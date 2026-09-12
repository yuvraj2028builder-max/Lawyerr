/**
 * Prompt 14 — Production-readiness audit tests.
 *
 * Each test pins a real integration risk discovered in the audit:
 * auth confusion, missing identity, wrong-user access, unavailable backend /
 * auth / storage, unsafe AI proposal handling, unsupported legal claims,
 * missing citations, false success reporting, demo-mode clarity, and
 * privacy-safe analytics. No existing tests were modified.
 */
import { describe, expect, it } from "vitest";
import {
  getAppAuthMode,
  isAuthenticatedBackendSession,
  toLegacyAuthSession,
  APP_AUTH_MODE,
} from "@/backend/authMode";
import { LOCAL_DEMO_MESSAGE, LocalDemoAuthProvider } from "@/backend/authProvider";
import {
  authorizeRouteAccess,
  isRecordOwnedBy,
  isWellFormedId,
  requireOwnedRecord,
} from "@/backend/authorization";
import { makeSession } from "@/backend/authorization";
import {
  findForbiddenEnvKeys,
  isSafeAnalyticsMeta,
  shouldSendAnalyticsEvent,
} from "@/backend/analyticsGuard";
import {
  AI_SUGGESTION_LABEL,
  DRAFT_NOT_SUBMITTED_LABEL,
  UNVERIFIED_LEGAL_LABEL,
  canDisplayAsVerifiedClaim,
  canDisplayDeadline,
  requireExplicitConfirmation,
  requireVerifiedClaim,
} from "@/backend/legalSafety";
import { UnavailableBackendAdapter } from "@/backend/adapters";
import { trackEvent } from "@/services/analytics";
import { caseEngine } from "@/services/caseEngine.service";
import { aiFactProposalService } from "@/services/ai/aiFactProposal.service";

const ALICE = "user_alice";
const BOB = "user_bob";

// ─── Auth single source of truth ────────────────────────────────────────────

describe("Prompt 14 — demo auth can never look authenticated", () => {
  it("app auth mode is local_demo", () => {
    expect(getAppAuthMode()).toBe("local_demo");
    expect(APP_AUTH_MODE).toBe("local_demo");
  });
  it("null session is not authenticated", () => {
    expect(isAuthenticatedBackendSession(null)).toBe(false);
  });
  it("userless session is not authenticated", () => {
    expect(isAuthenticatedBackendSession(makeSession(null))).toBe(false);
  });
  it("expired session with a user is not authenticated", () => {
    expect(isAuthenticatedBackendSession(makeSession(ALICE, { expired: true }))).toBe(false);
  });
  it("blank user id is not authenticated", () => {
    expect(isAuthenticatedBackendSession({ user: { id: "   " }, authenticated: true, expired: false })).toBe(false);
  });
  it("genuine session shape is authenticated", () => {
    expect(isAuthenticatedBackendSession(makeSession(ALICE))).toBe(true);
  });
  it("demo session maps to unavailable legacy state, never authenticated", async () => {
    const legacy = toLegacyAuthSession(await new LocalDemoAuthProvider().getSession());
    expect(legacy.status).toBe("unavailable");
    expect(legacy.user).toBeNull();
    expect(legacy.mode).toBe("development");
  });
  it("expired session maps to unavailable, never authenticated", () => {
    expect(toLegacyAuthSession(makeSession(ALICE, { expired: true })).status).toBe("unavailable");
  });
  it("repeated session reads never flip to authenticated", async () => {
    const provider = new LocalDemoAuthProvider();
    for (let i = 0; i < 3; i++) {
      expect(isAuthenticatedBackendSession(await provider.getSession())).toBe(false);
    }
  });
  it("logout in demo completes without error and stays demo", async () => {
    const provider = new LocalDemoAuthProvider();
    await provider.signOut();
    expect(isAuthenticatedBackendSession(await provider.getSession())).toBe(false);
  });
});

// ─── Centralized ownership checks ───────────────────────────────────────────

describe("Prompt 14 — ownership checks are centralized and strict", () => {
  it("accepts a well-formed opaque id", () => {
    expect(isWellFormedId("user_alice")).toBe(true);
  });
  it("rejects empty, blank, and non-string ids", () => {
    expect(isWellFormedId("")).toBe(false);
    expect(isWellFormedId("   ")).toBe(false);
    expect(isWellFormedId(null)).toBe(false);
    expect(isWellFormedId(undefined)).toBe(false);
  });
  it("rejects traversal, separators, and whitespace", () => {
    expect(isWellFormedId("../secret")).toBe(false);
    expect(isWellFormedId("a/b")).toBe(false);
    expect(isWellFormedId("a b")).toBe(false);
  });
  it("rejects over-long ids", () => {
    expect(isWellFormedId(`u${"x".repeat(200)}`)).toBe(false);
  });
  it("matches owner to record", () => {
    expect(isRecordOwnedBy({ ownerId: ALICE }, ALICE)).toBe(true);
  });
  it("rejects wrong owner, null record, and malformed owner", () => {
    expect(isRecordOwnedBy({ ownerId: ALICE }, BOB)).toBe(false);
    expect(isRecordOwnedBy(null, ALICE)).toBe(false);
    expect(isRecordOwnedBy({ ownerId: ALICE }, "")).toBe(false);
  });
  it("requireOwnedRecord denies missing identity as unauthorized", () => {
    const r = requireOwnedRecord(null, true, { ownerId: ALICE });
    expect(r.status).toBe("unauthorized");
    if (r.status === "available") expect.unreachable();
    else expect(r.error.toLowerCase()).toContain("session");
  });
  it("requireOwnedRecord denies wrong owner as forbidden without data", () => {
    const r = requireOwnedRecord(makeSession(BOB), true, { ownerId: ALICE });
    expect(r.status).toBe("forbidden");
    expect("data" in r ? (r as { data?: unknown }).data : undefined).toBeUndefined();
  });
  it("requireOwnedRecord reports missing records as not_found", () => {
    expect(requireOwnedRecord(makeSession(ALICE), true, null).status).toBe("not_found");
  });
  it("requireOwnedRecord fails closed when backend is down", () => {
    expect(requireOwnedRecord(makeSession(ALICE), false, { ownerId: ALICE }).status).toBe("unavailable");
  });
  it("requireOwnedRecord returns owner on success", () => {
    const r = requireOwnedRecord(makeSession(ALICE), true, { ownerId: ALICE });
    expect(r.status).toBe("available");
    if (r.status === "available") expect(r.data.ownerId).toBe(ALICE);
  });
});

// ─── Protected-route seam ───────────────────────────────────────────────────

describe("Prompt 14 — protected routes fail closed", () => {
  it("public routes stay available without any session", () => {
    expect(authorizeRouteAccess({ requiresAuth: false, session: null, backendAvailable: false })).toBe("available");
  });
  it("protected route without a session is unauthorized", () => {
    expect(authorizeRouteAccess({ requiresAuth: true, session: null, backendAvailable: true })).toBe("unauthorized");
  });
  it("protected route with an expired session is unauthorized", () => {
    expect(authorizeRouteAccess({ requiresAuth: true, session: makeSession(ALICE, { expired: true }), backendAvailable: true })).toBe("unauthorized");
  });
  it("protected route with backend down is unavailable", () => {
    expect(authorizeRouteAccess({ requiresAuth: true, session: makeSession(ALICE), backendAvailable: false })).toBe("unavailable");
  });
  it("protected route with malformed user id is unauthorized", () => {
    const session = { user: { id: "" }, authenticated: true, expired: false };
    expect(authorizeRouteAccess({ requiresAuth: true, session, backendAvailable: true })).toBe("unauthorized");
  });
  it("protected route with a genuine session is available", () => {
    expect(authorizeRouteAccess({ requiresAuth: true, session: makeSession(ALICE), backendAvailable: true })).toBe("available");
  });
});

// ─── Analytics hardening ────────────────────────────────────────────────────

describe("Prompt 14 — analytics never carries private data", () => {
  it("allows content-free meta", () => {
    expect(isSafeAnalyticsMeta({ step: "review", category: "document" })).toBe(true);
  });
  it("does not false-positive on innocent words containing short tokens", () => {
    expect(isSafeAnalyticsMeta({ company: "Acme Retail" })).toBe(true);
  });
  it("blocks owner and identity keys", () => {
    expect(isSafeAnalyticsMeta({ ownerId: ALICE })).toBe(false);
    expect(isSafeAnalyticsMeta({ email: "a@b.in" })).toBe(false);
    expect(isSafeAnalyticsMeta({ phone: "98765 43210" })).toBe(false);
  });
  it("blocks short sensitive keys exactly (pan, otp, cvv, password)", () => {
    expect(isSafeAnalyticsMeta({ pan: "ABCDE1234F" })).toBe(false);
    expect(isSafeAnalyticsMeta({ otp: "123456" })).toBe(false);
    expect(isSafeAnalyticsMeta({ password: "x" })).toBe(false);
  });
  it("blocks sensitive values hidden under innocent keys", () => {
    expect(isSafeAnalyticsMeta({ note: "my aadhaar number here" })).toBe(false);
    expect(isSafeAnalyticsMeta({ note: "signed download url" })).toBe(false);
  });
  it("send gate requires an allowlisted category", () => {
    expect(shouldSendAnalyticsEvent({ category: "nope", meta: {} })).toBe(false);
    expect(shouldSendAnalyticsEvent({ category: "", meta: {} })).toBe(false);
  });
  it("send gate drops unsafe meta even for allowed categories", () => {
    expect(shouldSendAnalyticsEvent({ category: "document_workflow", meta: { step: "review" } })).toBe(true);
    expect(shouldSendAnalyticsEvent({ category: "document_workflow", meta: { ownerId: ALICE } })).toBe(false);
  });
  it("trackEvent drops unsafe payloads instead of sending", () => {
    expect(trackEvent({ event: "intake_started", meta: { token: "abc" } })).toBe(false);
    expect(trackEvent({ event: "intake_started" })).toBe(true);
  });
});

// ─── Config safety ──────────────────────────────────────────────────────────

describe("Prompt 14 — no secrets reach the client", () => {
  it("clean env reports no forbidden keys", () => {
    expect(findForbiddenEnvKeys({})).toEqual([]);
    expect(findForbiddenEnvKeys({ VITE_API_BASE_URL: "https://api.example", VITE_SUPABASE_URL: "https://p.example" })).toEqual([]);
  });
  it("detects bare and VITE_-prefixed secret names", () => {
    expect(findForbiddenEnvKeys({ GEMINI_API_KEY: "x" })).toContain("GEMINI_API_KEY");
    expect(findForbiddenEnvKeys({ VITE_GEMINI_API_KEY: "x" })).toContain("GEMINI_API_KEY");
    expect(findForbiddenEnvKeys({ DATABASE_URL: "x" })).toContain("DATABASE_URL");
    expect(findForbiddenEnvKeys({ SUPABASE_SERVICE_ROLE_KEY: "x" })).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("matching is case-insensitive", () => {
    expect(findForbiddenEnvKeys({ gemini_api_key: "x" })).toContain("GEMINI_API_KEY");
  });
});

// ─── Legal display safety ───────────────────────────────────────────────────

describe("Prompt 14 — unsupported claims can never display as verified", () => {
  const verified = { verified: true, productionAllowed: true, isMock: false, citationText: "CPA 2019 — Section 2(7)" };
  it("allows a fully verified, cited claim", () => {
    expect(canDisplayAsVerifiedClaim(verified)).toBe(true);
  });
  it("blocks unverified claims", () => {
    expect(canDisplayAsVerifiedClaim({ ...verified, verified: false })).toBe(false);
  });
  it("blocks non-production claims", () => {
    expect(canDisplayAsVerifiedClaim({ ...verified, productionAllowed: false })).toBe(false);
  });
  it("blocks mock claims even when flagged verified", () => {
    expect(canDisplayAsVerifiedClaim({ ...verified, isMock: true })).toBe(false);
  });
  it("blocks missing or blank citations", () => {
    expect(canDisplayAsVerifiedClaim({ ...verified, citationText: undefined })).toBe(false);
    expect(canDisplayAsVerifiedClaim({ ...verified, citationText: "   " })).toBe(false);
  });
  it("requireVerifiedClaim fails closed with a plain-language error", () => {
    const r = requireVerifiedClaim({ ...verified, verified: false });
    expect(r.status).toBe("failed");
    if (r.status === "available") expect.unreachable();
    else expect(r.error).toContain("not verified");
  });
  it("deadlines need verification, a due date, and a source", () => {
    expect(canDisplayDeadline({ verificationStatus: "verified", dueDate: "2026-01-01", sourceId: "s1" })).toBe(true);
    expect(canDisplayDeadline({ verificationStatus: "not_available", dueDate: "2026-01-01", sourceId: "s1" })).toBe(false);
    expect(canDisplayDeadline({ verificationStatus: "verified", sourceId: "s1" })).toBe(false);
    expect(canDisplayDeadline({ verificationStatus: "verified", dueDate: "2026-01-01" })).toBe(false);
  });
  it("AI output requires explicit confirmation before use", () => {
    expect(requireExplicitConfirmation({ confirmedByUser: false }).status).toBe("failed");
    const ok = requireExplicitConfirmation({ confirmedByUser: true });
    expect(ok.status).toBe("available");
  });
  it("honesty labels promise nothing", () => {
    for (const label of [AI_SUGGESTION_LABEL, UNVERIFIED_LEGAL_LABEL, DRAFT_NOT_SUBMITTED_LABEL]) {
      expect(label.toLowerCase()).not.toContain("guarantee");
      expect(label.toLowerCase()).not.toContain("you will win");
    }
    expect(AI_SUGGESTION_LABEL.toLowerCase()).toContain("confirmation");
    expect(DRAFT_NOT_SUBMITTED_LABEL.toLowerCase()).toContain("not submitted");
  });
});

// ─── AI proposal failure honesty ────────────────────────────────────────────

describe("Prompt 14 — failed confirmations are never reported as success", () => {
  it("confirmProposal rolls back when the case update fails", async () => {
    const c = await caseEngine.createCase({ description: "rollback check one", title: "rollback check" });
    const proposals = await aiFactProposalService.requestProposals(c.id, "Invoice total: Rs 25000", "document_text");
    expect(proposals.length).toBeGreaterThan(0);
    await caseEngine.deleteCase(c.id);
    await expect(aiFactProposalService.confirmProposal(c.id, proposals[0].id)).rejects.toThrow();
    const current = aiFactProposalService.getProposals(c.id).find((p) => p.id === proposals[0].id);
    expect(current?.status).toBe("proposed");
    expect(current?.confirmedByUser).toBe(false);
    aiFactProposalService.clearProposals(c.id);
  });
  it("modifyAndConfirmProposal rolls back when the case update fails", async () => {
    const c = await caseEngine.createCase({ description: "rollback check two", title: "rollback check two" });
    const proposals = await aiFactProposalService.requestProposals(c.id, "Order ID ABC123", "document_text");
    expect(proposals.length).toBeGreaterThan(0);
    await caseEngine.deleteCase(c.id);
    await expect(aiFactProposalService.modifyAndConfirmProposal(c.id, proposals[0].id, "XYZ999")).rejects.toThrow();
    const current = aiFactProposalService.getProposals(c.id).find((p) => p.id === proposals[0].id);
    expect(current?.status).toBe("proposed");
    expect(current?.confirmedByUser).toBe(false);
    expect(current?.userModifiedValue).toBeUndefined();
    aiFactProposalService.clearProposals(c.id);
  });
});

// ─── Unavailable backend honesty ────────────────────────────────────────────

describe("Prompt 14 — unavailable operations are never successes", () => {
  it("every unavailable-backend method reports a non-available status", async () => {
    const api = new UnavailableBackendAdapter();
    const results = await Promise.all([
      api.getHealth(),
      api.getSession(),
      api.getUserIdentity(),
      api.createCase({ title: "t", description: "d" }),
      api.readCase({ caseId: "c" }),
      api.updateCase({ caseId: "c" }),
      api.deleteCase({ caseId: "c" }),
      api.checkCaseOwnership({ caseId: "c" }),
      api.createDocumentMetadata({ caseId: "c", displayName: "d", mimeType: "application/pdf", sizeBytes: 1 }),
      api.readDocumentMetadata({ caseId: "c", documentId: "d" }),
      api.deleteDocumentMetadata({ caseId: "c", documentId: "d" }),
      api.createUploadPermission({ caseId: "c", documentId: "d" }),
      api.createSignedDownload({ caseId: "c", documentId: "d" }),
      api.recordAuditEvent({ caseId: "c", category: "document_workflow" }),
      api.listAuditEvents({ caseId: "c" }),
      api.readActionPlan({ caseId: "c" }),
      api.readActionItems({ caseId: "c" }),
      api.readConfirmedFacts({ caseId: "c" }),
      api.readExtractedFacts({ caseId: "c" }),
      api.readAiProposals({ caseId: "c" }),
      api.readUserProfile(),
    ]);
    expect(results.length).toBe(21);
    for (const r of results) expect(r.status).not.toBe("available");
  });
  it("demo-mode wording names browser-only storage", () => {
    expect(LOCAL_DEMO_MESSAGE).toContain("Local demo mode");
    expect(LOCAL_DEMO_MESSAGE).toContain("only in this browser");
  });
});
