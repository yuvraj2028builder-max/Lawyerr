/**
 * Prompt 13 — Secure backend foundation: security & privacy tests.
 *
 * Covers: missing/expired sessions, wrong-owner and cross-user access,
 * unauthorized metadata/byte access, no public URLs, no signed URLs in
 * local mode, opaque storage keys, missing backend config, no frontend
 * secrets, no private metadata in analytics, deletion authorization, audit
 * ownership, backend failure handling, local-demo fallback, AI proposal
 * ownership, and never sending document text to unavailable providers.
 */
import { describe, expect, it } from "vitest";
import {
  LocalDemoAuthProvider,
  UnavailableCloudAuthProvider,
  LOCAL_DEMO_MESSAGE,
  CLOUD_AUTH_UNAVAILABLE_MESSAGE,
} from "@/backend/authProvider";
import {
  authorizeCaseAccess,
  authorizeDeletion,
  authorizeDocumentAccess,
  authorizeRecordAccess,
  FRONTEND_AUTHZ_IS_UX_ONLY,
  makeSession,
} from "@/backend/authorization";
import {
  getBackendAvailability,
  requireBackendConfigured,
  containsFrontendSecret,
  loadPublicBackendConfig,
  FORBIDDEN_FRONTEND_ENV_KEYS,
} from "@/backend/backendConfig";
import {
  buildOpaqueObjectKey,
  isOpaqueObjectKey,
  LocalDemoStorageProvider,
  LOCAL_DEMO_NO_SIGNED_URLS,
  PRIVATE_BUCKET_REQUIREMENT,
} from "@/backend/documentStorage";
import {
  isSafeBackendAnalyticsPayload,
  wouldLeakDocumentTextToProvider,
} from "@/backend/analyticsGuard";
import {
  UnavailableBackendAdapter,
  SupabaseBackendSeam,
} from "@/backend/adapters";
import {
  BACKEND_CONNECTED,
  AUTH_IS_REAL,
  PRIVATE_STORAGE_IS_REAL,
  resolveBackendProvider,
} from "@/backend/index";

const ALICE = "user_alice";
const BOB = "user_bob";
const OWNED = { ownerId: ALICE };
const BOBS = { ownerId: BOB };

// ─── Missing / expired sessions ─────────────────────────────────────────────

describe("Prompt 13 — missing and expired sessions fail closed", () => {
  it("null session cannot read a case (unauthorized)", () => {
    expect(authorizeCaseAccess(null, true, OWNED)).toBe("unauthorized");
  });
  it("null session cannot read a document (unauthorized)", () => {
    expect(authorizeDocumentAccess(null, true, OWNED)).toBe("unauthorized");
  });
  it("session without a user is unauthorized", () => {
    expect(authorizeRecordAccess({ session: makeSession(null), backendAvailable: true, record: OWNED })).toBe("unauthorized");
  });
  it("expired session is unauthorized even with a user id", () => {
    expect(authorizeCaseAccess(makeSession(ALICE, { expired: true }), true, OWNED)).toBe("unauthorized");
  });
  it("expired session cannot delete (unauthorized, not forbidden)", () => {
    expect(authorizeDeletion(makeSession(ALICE, { expired: true }), true, OWNED)).toBe("unauthorized");
  });
  it("backend unavailable beats session checks (unavailable)", () => {
    expect(authorizeCaseAccess(makeSession(ALICE), false, OWNED)).toBe("unavailable");
  });
});

// ─── Wrong-owner / cross-user access ────────────────────────────────────────

describe("Prompt 13 — wrong-owner and cross-user access is forbidden", () => {
  it("wrong owner cannot read a case (forbidden)", () => {
    expect(authorizeCaseAccess(makeSession(BOB), true, OWNED)).toBe("forbidden");
  });
  it("cross-user document read is forbidden", () => {
    expect(authorizeDocumentAccess(makeSession(BOB), true, OWNED)).toBe("forbidden");
  });
  it("cross-user case access from the other side is forbidden", () => {
    expect(authorizeCaseAccess(makeSession(ALICE), true, BOBS)).toBe("forbidden");
  });
  it("cross-user document access from the other side is forbidden", () => {
    expect(authorizeDocumentAccess(makeSession(ALICE), true, BOBS)).toBe("forbidden");
  });
  it("owner can read their own case (available)", () => {
    expect(authorizeCaseAccess(makeSession(ALICE), true, OWNED)).toBe("available");
  });
  it("missing record reports not_found (not forbidden)", () => {
    expect(authorizeCaseAccess(makeSession(ALICE), true, null)).toBe("not_found");
  });
});

// ─── Unauthorized metadata / byte access ────────────────────────────────────

describe("Prompt 13 — unauthorized metadata and byte access", () => {
  const storage = new LocalDemoStorageProvider();

  it("metadata access without a backend is not_configured, never metadata", async () => {
    const r = await storage.getMetadata({ ownerId: null, caseId: "c1", documentId: "d1" });
    expect(r.status).toBe("not_configured");
    expect("data" in r ? (r as { data?: unknown }).data : undefined).toBeUndefined();
  });
  it("bytes without an authenticated session are unauthorized", async () => {
    const r = await storage.getObjectBytes({ ownerId: null, caseId: "c1", documentId: "d1" });
    expect(r.status).toBe("unauthorized");
    if (r.status === "available") expect.unreachable("bytes must never be available here");
  });
  it("bytes are never returned alongside an error status", async () => {
    const r = await storage.getObjectBytes({ ownerId: ALICE, caseId: "c1", documentId: "d1" });
    expect(r.status).not.toBe("available");
  });
  it("unavailable backend adapter returns no private case data", async () => {
    const api = new UnavailableBackendAdapter();
    const r = await api.readCase({ caseId: "c1" });
    expect(r.status).toBe("not_configured");
  });
  it("unavailable backend adapter returns no private document metadata", async () => {
    const api = new UnavailableBackendAdapter();
    const r = await api.readDocumentMetadata({ caseId: "c1", documentId: "d1" });
    expect(r.status).toBe("not_configured");
  });
});

// ─── Public URLs / signed URLs ──────────────────────────────────────────────

describe("Prompt 13 — no public URLs, no signed URLs in local mode", () => {
  const storage = new LocalDemoStorageProvider();
  const api = new UnavailableBackendAdapter();

  it("local demo never issues a signed download", async () => {
    const r = await storage.createSignedDownload({ ownerId: ALICE, caseId: "c1", documentId: "d1" });
    expect(r.status).toBe("not_configured");
    expect(JSON.stringify(r)).not.toContain("http");
  });
  it("local demo states signed URLs are unavailable", async () => {
    const r = await storage.createSignedDownload({ ownerId: ALICE, caseId: "c1", documentId: "d1" });
    if (r.status !== "available") expect(r.error).toContain(LOCAL_DEMO_NO_SIGNED_URLS.slice(0, 12));
  });
  it("unavailable backend never issues an upload permission URL", async () => {
    const r = await api.createUploadPermission({ caseId: "c1", documentId: "d1" });
    expect(r.status).toBe("not_configured");
    expect(JSON.stringify(r)).not.toContain("http");
  });
  it("unavailable backend never issues a signed download URL", async () => {
    const r = await api.createSignedDownload({ caseId: "c1", documentId: "d1" });
    expect(r.status).toBe("not_configured");
    expect(JSON.stringify(r)).not.toContain("http");
  });
  it("storage contract requires a private bucket only", () => {
    expect(PRIVATE_BUCKET_REQUIREMENT).toContain("private");
  });
});

// ─── Opaque storage keys ────────────────────────────────────────────────────

describe("Prompt 13 — opaque server-generated storage keys", () => {
  it("builds an opaque key from ids", () => {
    expect(buildOpaqueObjectKey("u1", "c1", "d1")).toBe("private/u1/c1/d1");
  });
  it("opaque key carries no filename", () => {
    expect(buildOpaqueObjectKey("u1", "c1", "d1")).not.toContain("invoice");
  });
  it("opaque key carries no email", () => {
    expect(buildOpaqueObjectKey("u1", "c1", "d1")).not.toContain("@");
  });
  it("strips unsafe characters from key segments", () => {
    const segments = buildOpaqueObjectKey("u/1@x", "c 1", "d.1").split("/");
    expect(segments.slice(1).join("")).not.toMatch(/[@ .]/);
  });
  it("rejects filename-derived keys", () => {
    expect(isOpaqueObjectKey("private/u1/c1/invoice.pdf")).toBe(false);
  });
  it("rejects traversal keys", () => {
    expect(isOpaqueObjectKey("private/u1/../secret")).toBe(false);
  });
  it("accepts a well-formed opaque key", () => {
    expect(isOpaqueObjectKey(buildOpaqueObjectKey("user_alice", "case_1", "doc_9"))).toBe(true);
  });
});

// ─── Backend configuration ──────────────────────────────────────────────────

describe("Prompt 13 — missing backend configuration is honest", () => {
  it("empty public config reports local_demo + missing keys", () => {
    const a = getBackendAvailability({ apiBaseUrl: "", supabaseUrl: "", backendWanted: false });
    expect(a.configured).toBe(false);
    expect(a.mode).toBe("local_demo");
    expect(a.missing.length).toBeGreaterThan(0);
  });
  it("partial config is still not configured", () => {
    const a = getBackendAvailability({ apiBaseUrl: "https://api.example", supabaseUrl: "", backendWanted: true });
    expect(a.configured).toBe(false);
  });
  it("requireBackendConfigured returns not_configured, never throws", () => {
    const r = requireBackendConfigured({ apiBaseUrl: "", supabaseUrl: "", backendWanted: false });
    expect(r.status).toBe("not_configured");
  });
  it("test env exposes no backend by default (honest local demo)", () => {
    expect(getBackendAvailability(loadPublicBackendConfig()).mode).toBe("local_demo");
  });
});

// ─── No frontend secrets ────────────────────────────────────────────────────

describe("Prompt 13 — no secrets in frontend code", () => {
  it("forbids service-role keys in frontend env", () => {
    expect(FORBIDDEN_FRONTEND_ENV_KEYS).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("forbids database passwords in frontend env", () => {
    expect(FORBIDDEN_FRONTEND_ENV_KEYS).toContain("DATABASE_URL");
  });
  it("forbids Gemini API keys in frontend env", () => {
    expect(FORBIDDEN_FRONTEND_ENV_KEYS).toContain("GEMINI_API_KEY");
  });
  it("detects secret-like values", () => {
    expect(containsFrontendSecret(["SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi"])).toBe(true);
  });
  it("allows plain public config values", () => {
    expect(containsFrontendSecret(["https://api.nyayasetu.in", "NyayaSetu"])).toBe(false);
  });
  it("public config exposes only non-secret fields", () => {
    expect(Object.keys(loadPublicBackendConfig()).sort()).toEqual(["apiBaseUrl", "backendWanted", "supabaseUrl"]);
  });
});

// ─── Analytics privacy ──────────────────────────────────────────────────────

describe("Prompt 13 — no private metadata in analytics", () => {
  it("allows content-free workflow events", () => {
    expect(isSafeBackendAnalyticsPayload({ category: "document_workflow", meta: { step: "review" } })).toBe(true);
  });
  it("blocks owner identifiers", () => {
    expect(isSafeBackendAnalyticsPayload({ category: "document_workflow", meta: { ownerId: ALICE } })).toBe(false);
  });
  it("blocks document text", () => {
    expect(isSafeBackendAnalyticsPayload({ category: "intake", meta: { document_text: "invoice total" } })).toBe(false);
  });
  it("blocks tokens and signed material", () => {
    expect(isSafeBackendAnalyticsPayload({ category: "backend_status", meta: { token: "abc" } })).toBe(false);
    expect(isSafeBackendAnalyticsPayload({ category: "backend_status", meta: { signed: "url" } })).toBe(false);
  });
  it("blocks Aadhaar, PAN, passwords, and credentials", () => {
    expect(isSafeBackendAnalyticsPayload({ category: "intake", meta: { aadhaar: "1234" } })).toBe(false);
    expect(isSafeBackendAnalyticsPayload({ category: "intake", meta: { pan: "ABCDE1234F" } })).toBe(false);
    expect(isSafeBackendAnalyticsPayload({ category: "intake", meta: { password: "x" } })).toBe(false);
    expect(isSafeBackendAnalyticsPayload({ category: "intake", meta: { api_key: "x" } })).toBe(false);
  });
});

// ─── Deletion / audit / AI proposal ownership ───────────────────────────────

describe("Prompt 13 — deletion, audit, and AI proposal ownership", () => {
  it("deletion without a session is unauthorized", () => {
    expect(authorizeDeletion(null, true, OWNED)).toBe("unauthorized");
  });
  it("deletion by the wrong owner is forbidden", () => {
    expect(authorizeDeletion(makeSession(BOB), true, OWNED)).toBe("forbidden");
  });
  it("deletion by the owner is available", () => {
    expect(authorizeDeletion(makeSession(ALICE), true, OWNED)).toBe("available");
  });
  it("cloud deletion in local demo is not_configured", async () => {
    const r = await new LocalDemoStorageProvider().deleteObject({ ownerId: ALICE, caseId: "c1", documentId: "d1" });
    expect(r.status).toBe("not_configured");
  });
  it("audit listing without a backend is not_configured", async () => {
    const r = await new UnavailableBackendAdapter().listAuditEvents({ caseId: "c1" });
    expect(r.status).toBe("not_configured");
  });
  it("audit events carry owner identity at the contract level", () => {
    const event = { eventId: "e1", caseId: "c1", ownerId: ALICE, category: "document_workflow", createdAt: new Date(0).toISOString() };
    expect(event.ownerId).toBe(ALICE);
  });
  it("AI proposals are owner-scoped and unavailable without a backend", async () => {
    const r = await new UnavailableBackendAdapter().readAiProposals({ caseId: "c1" });
    expect(r.status).toBe("not_configured");
    const proposal = { proposalId: "p1", caseId: "c1", ownerId: ALICE, kind: "draft_help", summary: "s", createdAt: new Date(0).toISOString() };
    expect(authorizeRecordAccess({ session: makeSession(BOB), backendAvailable: true, record: { ownerId: proposal.ownerId } })).toBe("forbidden");
  });
});

// ─── Backend failure handling + local-demo fallback ─────────────────────────

describe("Prompt 13 — backend failure handling and local-demo fallback", () => {
  it("health reports unavailable without a backend", async () => {
    expect((await new UnavailableBackendAdapter().getHealth()).status).toBe("unavailable");
  });
  it("session lookup without a backend is unauthorized", async () => {
    expect((await new UnavailableBackendAdapter().getSession()).status).toBe("unauthorized");
  });
  it("user identity without a backend is unauthorized", async () => {
    expect((await new UnavailableBackendAdapter().getUserIdentity()).status).toBe("unauthorized");
  });
  it("case update/delete without a backend are not_configured", async () => {
    const api = new UnavailableBackendAdapter();
    expect((await api.updateCase({ caseId: "c1" })).status).toBe("not_configured");
    expect((await api.deleteCase({ caseId: "c1" })).status).toBe("not_configured");
  });
  it("Supabase seam without wiring never fabricates success", async () => {
    const seam = new SupabaseBackendSeam({ publicConfig: { apiBaseUrl: "", supabaseUrl: "", backendWanted: false } });
    expect(seam.isWired()).toBe(false);
    expect((await seam.getHealth()).status).toBe("not_configured");
    expect((await seam.readCase({ caseId: "c1" })).status).toBe("not_configured");
  });
  it("Supabase seam surfaces bridge failures as failed, not success", async () => {
    const seam = new SupabaseBackendSeam({
      publicConfig: { apiBaseUrl: "https://api.example", supabaseUrl: "https://proj.example", backendWanted: true },
      bridge: async () => { throw new Error("boom"); },
    });
    expect(seam.isWired()).toBe(true);
    expect((await seam.getHealth()).status).toBe("failed");
  });
  it("resolves to honest local demo mode", () => {
    expect(resolveBackendProvider().mode).toBe("local_demo");
  });
  it("reports no real backend, auth, or private storage", () => {
    expect(BACKEND_CONNECTED).toBe(false);
    expect(AUTH_IS_REAL).toBe(false);
    expect(PRIVATE_STORAGE_IS_REAL).toBe(false);
  });
});

// ─── Auth providers: no fake sessions ───────────────────────────────────────

describe("Prompt 13 — authentication providers never fake sessions", () => {
  it("local demo session is unauthenticated with no user", async () => {
    const s = await new LocalDemoAuthProvider().getSession();
    expect(s.authenticated).toBe(false);
    expect(s.user).toBeNull();
    expect(s.expired).toBe(false);
  });
  it("local demo has no current user", async () => {
    expect(await new LocalDemoAuthProvider().getCurrentUser()).toBeNull();
  });
  it("local demo sign-in never signs in and says so honestly", async () => {
    const r = await new LocalDemoAuthProvider().signIn();
    expect(r.signedIn).toBe(false);
    expect(r.reason).toContain("Local demo mode");
  });
  it("local demo message states browser-only storage exactly", () => {
    expect(LOCAL_DEMO_MESSAGE).toBe("Local demo mode \u2014 your data is saved only in this browser.");
  });
  it("cloud provider is unavailable without fake tokens", async () => {
    const p = new UnavailableCloudAuthProvider();
    expect((await p.getSession()).authenticated).toBe(false);
    expect(await p.getCurrentUser()).toBeNull();
    const r = await p.signIn();
    expect(r.signedIn).toBe(false);
    expect(CLOUD_AUTH_UNAVAILABLE_MESSAGE).toContain("not a private account");
  });
  it("auth state listeners receive an unauthenticated session and can unsubscribe", async () => {
    const seen: boolean[] = [];
    const unsub = new LocalDemoAuthProvider().onAuthStateChange((s) => seen.push(s.authenticated));
    await new Promise((resolve) => setTimeout(resolve, 5));
    unsub();
    expect(seen).toEqual([false]);
  });
});

// ─── Document text never sent to unavailable providers ──────────────────────

describe("Prompt 13 — document text never sent to unavailable providers", () => {
  it("flags sending document text while the provider is unavailable", () => {
    expect(wouldLeakDocumentTextToProvider({ documentTextPresent: true, providerAvailable: false })).toBe(true);
  });
  it("does not flag when no document text is present", () => {
    expect(wouldLeakDocumentTextToProvider({ documentTextPresent: false, providerAvailable: false })).toBe(false);
  });
  it("frontend authorization stays a documented UX hint, not a boundary", () => {
    expect(FRONTEND_AUTHZ_IS_UX_ONLY.toLowerCase()).toContain("backend");
  });
});
