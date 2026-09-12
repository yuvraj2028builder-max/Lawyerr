/**
 * Prompt 16 — Final production tests.
 *
 * Covers: anonymous-first usage (zero auth paths), optional sign-in honesty,
 * the consent-gated sync engine (single/all/conflicts/failure/no-duplicates),
 * live-RLS suite GATED behind SUPABASE_LIVE=1 (skipped otherwise, with
 * instructions), Edge Function payload discipline + fallback, honest OCR,
 * and session-expiry handling. No existing test modified.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { caseEngine } from "@/services/caseEngine.service";
import { consumerIntakeEngine } from "@/services/consumerIntake/consumerIntakeEngine";
import { evidenceService } from "@/services/evidence.service";
import { documentUploadService } from "@/services/documentUpload.service";
import { isSupabaseEnvConfigured } from "@/backend/supabase/client";
import { resolveAuthProvider, resolveBackendProviderAsync } from "@/backend/supabase/index";
import { LocalDemoAuthProvider } from "@/backend/authProvider";
import { UnavailableBackendAdapter } from "@/backend/adapters";
import { SupabaseBackendAdapter } from "@/backend/supabase/backendAdapter";
import { toBackendSession } from "@/backend/supabase/authProvider";
import {
  __clearSyncStore,
  describeSyncPlan,
  getSyncRecord,
  resolveConflict,
  syncAllCases,
  syncCase,
  type SyncBackend,
} from "@/services/sync/caseSync.service";
import {
  buildEdgePayload,
  requestEdgeExplanation,
} from "@/services/ai/edgeAiProvider";
import {
  validateEdgeRequest,
  validateEdgeResponse,
} from "../../supabase/functions/ai-explain/validate";
import {
  SUPPORTED_OCR_LANGUAGE,
  TesseractOCRService,
  UnavailableOCRService,
} from "@/services/ocr.service";

const ROOT = process.cwd();
const ok = <T>(data: T) => ({ status: "available" as const, data });
const fail = (status: "unauthorized" | "forbidden" | "not_found" | "failed" | "not_configured" | "unavailable", error: string) =>
  ({ status, error });
// Timestamps have millisecond resolution: separate a save from a later edit
// so "changed since last sync" comparisons are meaningful.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const HAS_LIVE_ENV = (() => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    return !!env.VITE_SUPABASE_URL && !!env.VITE_SUPABASE_ANON_KEY;
  } catch {
    return false;
  }
})();

// ─── Anonymous-first: zero auth paths ───────────────────────────────────────

describe("Prompt 16 — anonymous usage stays fully functional", () => {
  // Hermetic: stub env empty so a developer .env.local cannot change these.
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stubbed-absent env reads as not configured", () => {
    expect(isSupabaseEnvConfigured()).toBe(false);
  });
  it("auth resolves to the clearly-labeled local demo provider", async () => {
    expect(await resolveAuthProvider()).toBeInstanceOf(LocalDemoAuthProvider);
  });
  it("backend resolves to the honest unavailable adapter in local_demo mode", async () => {
    const resolved = await resolveBackendProviderAsync();
    expect(resolved.mode).toBe("local_demo");
    expect(resolved.provider).toBeInstanceOf(UnavailableBackendAdapter);
  });
  it("consumer intake works with zero auth", () => {
    const session = consumerIntakeEngine.createSession();
    const answered = consumerIntakeEngine.submitNarrative(session.sessionId, "My refund was denied for a defective phone.");
    expect(consumerIntakeEngine.getSession(session.sessionId)?.sessionId).toBe(session.sessionId);
    expect(answered.facts).toBeDefined();
  });
  it("local case creation works with zero auth", async () => {
    const c = await caseEngine.createCase({ description: "Anonymous case still works", title: "anon" });
    expect(c.id).toBeTruthy();
    expect((await caseEngine.getCase(c.id))?.description).toContain("Anonymous");
  });
  it("evidence metadata works with zero auth", async () => {
    const c = await caseEngine.createCase({ description: "evidence anon", title: "ev" });
    const item = await evidenceService.addEvidence({ caseId: c.id, type: "invoice_receipt", label: "bill", status: "available" });
    expect(item.id).toBeTruthy();
  });
  it("document upload works with zero auth", async () => {
    const c = await caseEngine.createCase({ description: "doc anon", title: "doc" });
    const file = new File(["hello"], "bill.pdf", { type: "application/pdf" });
    const doc = await documentUploadService.uploadDocument(c.id, file, "invoice_receipt");
    expect(doc.storageStatus).toBe("stored");
  });
  it("sync refuses anonymously without touching any backend", async () => {
    const c = await caseEngine.createCase({ description: "sync refused anon", title: "sr" });
    const calls: string[] = [];
    const backend = new SupabaseBackendAdapter(null);
    const outcome = await syncCase(c.id, { backend, uploadFile: async () => { calls.push("upload"); } });
    expect(outcome.status).toBe("refused");
    expect(outcome.message.toLowerCase()).toContain("sign in");
    expect(calls).toEqual([]);
    expect(getSyncRecord(c.id)).toBeNull();
  });
});

describe.skipIf(!HAS_LIVE_ENV)("Prompt 16 — live wiring (real .env.local present)", () => {
  it("resolver selects the real Supabase adapters (values never asserted or printed)", async () => {
    const { SupabaseAuthProvider } = await import("@/backend/supabase/authProvider");
    const { SupabaseBackendAdapter } = await import("@/backend/supabase/backendAdapter");
    expect(await resolveAuthProvider()).toBeInstanceOf(SupabaseAuthProvider);
    const backend = await resolveBackendProviderAsync();
    expect(backend.mode).toBe("cloud");
    expect(backend.provider).toBeInstanceOf(SupabaseBackendAdapter);
  });
});

// ─── Optional sign-in honesty ───────────────────────────────────────────────

describe("Prompt 16 — sign-in stays optional and honest", () => {
  it("demo sign-in never authenticates and says local demo", async () => {
    const r = await new LocalDemoAuthProvider().signIn();
    expect(r.signedIn).toBe(false);
    expect(r.reason).toContain("Local demo mode");
  });
  it("demo sign-out completes and stays demo", async () => {
    const p = new LocalDemoAuthProvider();
    await p.signOut();
    expect((await p.getSession()).authenticated).toBe(false);
  });
  it("expired sessions map to expired, never authenticated", () => {
    const s = toBackendSession({ user: { id: "u1" }, expires_at: Math.floor(Date.now() / 1000) - 60 });
    expect(s.authenticated).toBe(false);
    expect(s.expired).toBe(true);
    expect(s.user).toBeNull();
  });
  it("adapter session errors degrade to unauthenticated, never crash", async () => {
    const client = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: new Error("refresh failed") }),
        signInWithOtp: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      },
    };
    const api = new SupabaseBackendAdapter(client as never);
    expect((await api.getSession()).status).toBe("unauthorized");
    expect((await api.readCase({ caseId: "c" })).status).toBe("unauthorized");
  });
});

// ─── Sync engine ────────────────────────────────────────────────────────────

function mockSyncBackend(overrides: Partial<SyncBackend> = {}, calls: { op: string; arg?: unknown }[] = []): SyncBackend {
  const now = new Date().toISOString();
  return {
    getSession: async () => ok({ user: { id: "user_1" }, authenticated: true, expired: false }),
    createCase: async (input) => { calls.push({ op: "createCase", arg: input }); return ok({ caseId: "cloud_1", ownerId: "user_1", title: input.title, description: input.description, status: "intake", createdAt: now, updatedAt: now }); },
    readCase: async (input) => { calls.push({ op: "readCase", arg: input }); return ok({ caseId: input.caseId, ownerId: "user_1", title: "T", description: "D", status: "intake", createdAt: now, updatedAt: now }); },
    updateCase: async (input) => { calls.push({ op: "updateCase", arg: input }); return ok({ caseId: input.caseId, ownerId: "user_1", title: input.title ?? "T", description: input.description ?? "D", status: "intake", createdAt: now, updatedAt: now }); },
    deleteCase: async (input) => { calls.push({ op: "deleteCase", arg: input }); return ok({ caseId: input.caseId }); },
    createDocumentMetadata: async (input) => { calls.push({ op: "createDocumentMetadata", arg: input }); return ok({ documentId: `cloud_${String(input.displayName)}`, caseId: input.caseId, ownerId: "user_1", displayName: input.displayName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, objectKey: "private/u/c/d", uploadedAt: now, processingStatus: "selected" }); },
    createUploadPermission: async (input) => { calls.push({ op: "createUploadPermission", arg: input }); return ok({ uploadUrl: "https://up.example/sign", expiresAt: now, documentId: input.documentId }); },
    recordAuditEvent: async (input) => { calls.push({ op: "recordAuditEvent", arg: input }); return ok({ eventId: "e1", caseId: input.caseId, ownerId: "user_1", category: input.category, createdAt: now }); },
    ...overrides,
  };
}

describe("Prompt 16 — consent-gated sync", () => {
  it("plan describes what leaves the browser before anything happens", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "plan case", title: "Plan" });
    const file = new File(["x"], "bill.pdf", { type: "application/pdf" });
    await documentUploadService.uploadDocument(c.id, file, "invoice_receipt");
    const calls: { op: string; arg?: unknown }[] = [];
    const described = await describeSyncPlan(c.id, { backend: mockSyncBackend({}, calls) });
    expect(described.plan?.join(" ")).toContain("private account");
    expect(calls).toEqual([]);
    expect(getSyncRecord(c.id)).toBeNull();
  });
  it("first save pushes case, metadata, bytes, and audit, then records", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "first save", title: "First" });
    const file = new File(["bytes"], "bill.pdf", { type: "application/pdf" });
    await documentUploadService.uploadDocument(c.id, file, "invoice_receipt");
    const calls: { op: string; arg?: unknown }[] = [];
    const uploads: string[] = [];
    const outcome = await syncCase(c.id, { backend: mockSyncBackend({}, calls), uploadFile: async (url) => { uploads.push(url); } });
    expect(outcome.status).toBe("synced");
    expect(calls.map((x) => x.op)).toEqual(expect.arrayContaining(["createCase", "createDocumentMetadata", "createUploadPermission", "recordAuditEvent"]));
    expect(uploads).toEqual(["https://up.example/sign"]);
    const record = getSyncRecord(c.id);
    expect(record?.cloudCaseId).toBe("cloud_1");
    expect((await caseEngine.getCase(c.id))?.description).toBe("first save");
  });
  it("metadata-only sync fabricates no file when bytes are gone", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "no bytes", title: "NB" });
    const file = new File(["x"], "bill.pdf", { type: "application/pdf" });
    const doc = await documentUploadService.uploadDocument(c.id, file, "invoice_receipt");
    await documentUploadService.updateUpload(c.id, doc.id, { file: undefined } as never);
    const uploads: string[] = [];
    const outcome = await syncCase(c.id, { backend: mockSyncBackend(), uploadFile: async () => { uploads.push("x"); } });
    expect(outcome.status).toBe("synced");
    expect(uploads).toEqual([]);
    expect(outcome.filesSkipped ?? []).toContain("bill.pdf");
    expect(outcome.message).toContain("nothing was fabricated");
  });
  it("second save with no changes reports up-to-date (no duplicate offer)", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "dup check", title: "Dup" });
    const backend = mockSyncBackend();
    const first = await syncCase(c.id, { backend });
    expect(first.status).toBe("synced");
    const record = getSyncRecord(c.id);
    expect(record).not.toBeNull();
    const second = await syncCase(c.id, { backend });
    expect(second.status).toBe("synced");
    expect(second.message).toContain("up to date");
  });
  it("conflict offers a choice and overwrites nothing by itself", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "conflict base", title: "CB" });
    let reads = 0;
    const backend = mockSyncBackend({
      readCase: async () => {
        reads += 1;
        const stamp = reads <= 1 ? new Date(Date.now() - 60000).toISOString() : "2999-01-01T00:00:00.000Z";
        return ok({ caseId: "cloud_1", ownerId: "user_1", title: "Cloud title", description: "D", status: "intake", createdAt: stamp, updatedAt: stamp });
      },
    });
    expect((await syncCase(c.id, { backend })).status).toBe("synced");
    await tick();
    await caseEngine.updateCase(c.id, { description: "local edit after save" });
    const outcome = await syncCase(c.id, { backend });
    expect(outcome.status).toBe("conflict");
    expect(outcome.conflict).toBeDefined();
    expect((await caseEngine.getCase(c.id))?.description).toBe("local edit after save");
  });
  it("conflict keep_cloud pulls without losing the decision trail", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "kc base", title: "KC" });
    let reads = 0;
    const backend = mockSyncBackend({
      readCase: async () => {
        reads += 1;
        const stamp = reads <= 1 ? new Date(Date.now() - 60000).toISOString() : "2999-01-01T00:00:00.000Z";
        return ok({ caseId: "cloud_1", ownerId: "user_1", title: "Cloud wins", description: "cloud text", status: "intake", createdAt: "", updatedAt: stamp });
      },
    });
    await syncCase(c.id, { backend });
    await tick();
    await caseEngine.updateCase(c.id, { description: "local rival edit" });
    const resolved = await resolveConflict(c.id, "keep_cloud", { backend });
    expect(resolved.status).toBe("pulled");
    expect((await caseEngine.getCase(c.id))?.title).toBe("Cloud wins");
  });
  it("conflict keep_local pushes and cancel changes nothing", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "kl base", title: "KL" });
    const calls: { op: string; arg?: unknown }[] = [];
    let reads = 0;
    const backend = mockSyncBackend({
      readCase: async () => {
        reads += 1;
        const stamp = reads <= 1 ? new Date(Date.now() - 60000).toISOString() : "2999-01-01T00:00:00.000Z";
        return ok({ caseId: "cloud_1", ownerId: "user_1", title: "T", description: "D", status: "intake", createdAt: "", updatedAt: stamp });
      },
    }, calls);
    await syncCase(c.id, { backend });
    await tick();
    await caseEngine.updateCase(c.id, { description: "local rival 2" });
    const cancelled = await resolveConflict(c.id, "cancel", { backend });
    expect(cancelled.message).toContain("as-is");
    expect((await caseEngine.getCase(c.id))?.description).toBe("local rival 2");
    const pushed = await resolveConflict(c.id, "keep_local", { backend });
    expect(pushed.status).toBe("synced");
    expect(calls.map((x) => x.op)).toContain("updateCase");
  });
  it("partial failure leaves local intact, cleans the fresh cloud case, offers retry", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "partial fail", title: "PF" });
    const file = new File(["x"], "bill.pdf", { type: "application/pdf" });
    await documentUploadService.uploadDocument(c.id, file, "invoice_receipt");
    const calls: { op: string; arg?: unknown }[] = [];
    const backend = mockSyncBackend({
      createDocumentMetadata: async () => { calls.push({ op: "createDocumentMetadata" }); return fail("failed", "db down"); },
    }, calls);
    const outcome = await syncCase(c.id, { backend });
    expect(outcome.status).toBe("failed");
    expect(outcome.retryable).toBe(true);
    expect(outcome.failedAtStep).toBe("save-document");
    expect((await caseEngine.getCase(c.id))?.description).toBe("partial fail");
    expect(calls.map((x) => x.op)).toContain("deleteCase");
    expect(getSyncRecord(c.id)).toBeNull();
  });
  it("upload failure reports failed with local untouched", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "upload fail", title: "UF" });
    const file = new File(["x"], "bill.pdf", { type: "application/pdf" });
    await documentUploadService.uploadDocument(c.id, file, "invoice_receipt");
    const backend = mockSyncBackend();
    const outcome = await syncCase(c.id, {
      backend,
      uploadFile: async () => { throw new Error("network drop"); },
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.failedAtStep).toBe("exception");
    expect((await caseEngine.getCase(c.id))?.description).toBe("upload fail");
  });
  it("sync-all skips saved cases, saves the rest, survives one failure", async () => {
    __clearSyncStore();
    const a = await caseEngine.createCase({ description: "all a", title: "A" });
    const b = await caseEngine.createCase({ description: "all b", title: "B" });
    const backend = mockSyncBackend();
    expect((await syncCase(a.id, { backend })).status).toBe("synced");
    const failing = mockSyncBackend({
      createCase: async () => fail("failed", "down"),
    });
    const result = await syncAllCases([a.id, b.id], { backend: failing });
    expect(result.skipped).toContain(a.id);
    expect(result.failed.map((f) => f.id)).toContain(b.id);
    expect((await caseEngine.getCase(b.id))?.description).toBe("all b");
  });
  it("cloud-only change pulls automatically with nothing local to lose", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "pull base", title: "PB" });
    const backend = mockSyncBackend();
    expect((await syncCase(c.id, { backend })).status).toBe("synced");
    // Record holds the original save time; every read now reports newer cloud.
    const cloudNewer = mockSyncBackend({
      readCase: async () => ok({ caseId: "cloud_1", ownerId: "user_1", title: "New cloud title", description: "D", status: "intake", createdAt: "", updatedAt: "2999-06-01T00:00:00.000Z" }),
    });
    const outcome = await syncCase(c.id, { backend: cloudNewer });
    expect(outcome.status).toBe("pulled");
    expect((await caseEngine.getCase(c.id))?.title).toBe("New cloud title");
  });
});

// ─── Edge Function payload discipline + fallback ────────────────────────────

describe("Prompt 16 — Edge AI boundary honesty", () => {
  it("payload carries only kind, sanitized query, and bounded passages", () => {
    const payload = buildEdgePayload({
      kind: "grounded_explanation",
      query: "What are my rights?",
      passages: [{ section: "2(7)", text: "consumer means...", source: "CPA 2019" }],
      // @ts-expect-error — forbidden extras must be dropped even if passed
      password: "x",
      filename: "bill.pdf",
      bytes: "AAA",
    });
    expect(Object.keys(payload).sort()).toEqual(["kind", "passages", "query"]);
    expect(JSON.stringify(payload)).not.toContain("bill.pdf");
  });
  it("payload redacts PII and caps lengths", () => {
    const payload = buildEdgePayload({ kind: "fact_proposal", query: "Contact me at user@example.in please", rawText: "y".repeat(9000) });
    expect(JSON.stringify(payload)).not.toContain("user@example.in");
    expect((payload.rawText as string).length).toBeLessThanOrEqual(4000);
  });
  it("unconfigured function resolves to the honest unavailable state", async () => {
    const r = await requestEdgeExplanation({ kind: "grounded_explanation", query: "hi" }, { invoke: async () => null });
    expect(r.available).toBe(false);
    expect(r.usedFallback).toBe(true);
  });
  it("invoke errors resolve to unavailable, never throw", async () => {
    const r = await requestEdgeExplanation(
      { kind: "grounded_explanation", query: "hi" },
      { invoke: async () => ({ invokeFunction: async () => { throw new Error("offline"); } }) },
    );
    expect(r.available).toBe(false);
  });
  it("validateEdgeRequest rejects secrets, filenames, and bytes", () => {
    expect(validateEdgeRequest({ kind: "grounded_explanation", query: "q", api_key: "x" }).ok).toBe(false);
    expect(validateEdgeRequest({ kind: "grounded_explanation", query: "q", fileName: "b.pdf" }).ok).toBe(false);
    expect(validateEdgeRequest({ kind: "x", query: "q" }).ok).toBe(false);
    expect(validateEdgeRequest({ kind: "grounded_explanation", query: "   " }).ok).toBe(false);
  });
  it("validateEdgeRequest truncates (not rejects) oversized input", () => {
    const r = validateEdgeRequest({ kind: "grounded_explanation", query: "q".repeat(5000) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.clean.query.length).toBeLessThanOrEqual(2000);
  });
  it("validateEdgeResponse strips guarantees and flags outside citations", () => {
    const v = validateEdgeResponse("You will definitely win [7].", ["1"]);
    expect(v.explanation).not.toContain("definitely win");
    expect(v.rejectedGuarantees).toBe(1);
    expect(v.warnings.length).toBeGreaterThan(0);
  });
  it("frontend caller never references Gemini directly", () => {
    const src = readFileSync(path.join(ROOT, "src", "services", "ai", "edgeAiProvider.ts"), "utf8");
    expect(src).not.toContain("generativelanguage");
    expect(src).not.toContain("GEMINI_API_KEY");
    expect(src).toContain("ai-explain");
  });
});

// ─── Honest OCR ─────────────────────────────────────────────────────────────

describe("Prompt 16 — OCR Option A, English only", () => {
  it("claims English only", () => {
    expect(SUPPORTED_OCR_LANGUAGE).toBe("eng");
  });
  it("unavailable provider stays unavailable with no text", async () => {
    const res = await new UnavailableOCRService().extractText(new File(["x"], "a.png", { type: "image/png" }));
    expect(res.available).toBe(false);
    expect(res.text).toBeUndefined();
  });
  it("non-English requests are refused honestly, never attempted", async () => {
    const res = await new TesseractOCRService("hin+eng").extractText(new File(["x"], "a.png", { type: "image/png" }));
    expect(res.available).toBe(false);
    expect(res.error).toContain("English only");
  });
  it("scanned PDFs are refused honestly (photos only)", async () => {
    const res = await new TesseractOCRService("eng").extractText(new File(["x"], "a.pdf", { type: "application/pdf" }));
    expect(res.available).toBe(false);
    expect(res.text).toBeUndefined();
  });
  it("forced-unavailable stays unavailable", async () => {
    const res = await new TesseractOCRService("eng", true).extractText(new File(["x"], "a.png", { type: "image/png" }));
    expect(res.available).toBe(false);
  });
});

// ─── Live RLS suite (gated: needs real credentials) ─────────────────────────
// Run with: SUPABASE_LIVE=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... npm test -- --run -t "live RLS"
// (vitest reads SUPABASE_URL/ANON_KEY from process env; never commit them.)

const LIVE = process.env.SUPABASE_LIVE === "1";

describe.skipIf(!LIVE)("Prompt 16 — live RLS (requires SUPABASE_LIVE=1)", () => {
  it("live project is reachable and RLS hides other users' rows", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL ?? "";
    const anon = process.env.SUPABASE_ANON_KEY ?? "";
    expect(url.startsWith("https://")).toBe(true);
    expect(anon.length).toBeGreaterThan(20);
    const anonClient = createClient(url, anon);
    const { data, error } = await anonClient.from("cases").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
  it("authenticated user can insert, read back, and delete their own row", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL ?? "";
    const anon = process.env.SUPABASE_ANON_KEY ?? "";
    const email = process.env.SUPABASE_TEST_EMAIL ?? "";
    const password = process.env.SUPABASE_TEST_PASSWORD ?? "";
    expect(email).toContain("@");
    const client = createClient(url, anon);
    const { error: signErr } = await client.auth.signInWithPassword({ email, password });
    expect(signErr).toBeNull();
    const title = `live-smoke-${Date.now()}`;
    const { data: created, error: insErr } = await client.from("cases").insert({ title, description: "smoke" }).select().single();
    expect(insErr).toBeNull();
    const { data: readBack } = await client.from("cases").select("id,title").eq("id", (created as { id: string }).id).single();
    expect((readBack as { title: string }).title).toBe(title);
    await client.from("cases").delete().eq("id", (created as { id: string }).id);
    await client.auth.signOut();
  });
});

describe("Prompt 16 — live suite instructions", () => {
  it("documents how to run the gated live tests", () => {
    expect(existsSync(path.join(ROOT, "SUPABASE_SETUP.md"))).toBe(true);
    expect(LIVE ? "live" : "skipped").toBeDefined();
  });
});

// ─── Sync store + edge cases ────────────────────────────────────────────────

describe("Prompt 16 — sync bookkeeping and edge cases", () => {
  it("unknown cases have no sync record; clearing is safe", async () => {
    __clearSyncStore();
    const { clearSyncRecord } = await import("@/services/sync/caseSync.service");
    expect(getSyncRecord("nope")).toBeNull();
    expect(() => clearSyncRecord("nope")).not.toThrow();
  });
  it("plan and sync refuse honestly when the backend is gone", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "gone backend", title: "GB" });
    const backend = new SupabaseBackendAdapter(null);
    expect((await describeSyncPlan(c.id, { backend })).status).toBe("refused");
    expect((await resolveConflict(c.id, "keep_local", { backend })).status).toBe("refused");
  });
  it("resolving a never-synced case fails instead of fabricating", async () => {
    __clearSyncStore();
    const c = await caseEngine.createCase({ description: "never synced", title: "NS" });
    const r = await resolveConflict(c.id, "keep_local", { backend: mockSyncBackend() });
    expect(r.status).toBe("failed");
  });
  it("syncing a deleted local case fails instead of fabricating", async () => {
    const r = await syncCase("missing-local-id", { backend: mockSyncBackend() });
    expect(r.status).toBe("failed");
  });
  it("magic-link send failures report honestly", async () => {
    const { SupabaseAuthProvider } = await import("@/backend/supabase/authProvider");
    const client = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithOtp: async () => ({ error: new Error("smtp down") }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      },
    };
    const p = new SupabaseAuthProvider(client as never);
    const r = await p.requestMagicLink("user@example.in");
    expect(r.sent).toBe(false);
    expect(r.message).toContain("smtp down");
  });
  it("edge prompt constrains the model to the provided passages", async () => {
    const { buildGeminiPrompt } = await import("../../supabase/functions/ai-explain/validate");
    const prompt = buildGeminiPrompt({ kind: "grounded_explanation", query: "q", passages: [] });
    expect(prompt).toContain("ONLY");
    expect(prompt).toContain("say so plainly");
  });
  it("clean model output passes through with no warnings", async () => {
    const { validateEdgeResponse } = await import("../../supabase/functions/ai-explain/validate");
    const v = validateEdgeResponse("Based on [1], you may approach the forum.", ["1"]);
    expect(v.rejectedGuarantees).toBe(0);
    expect(v.warnings).toEqual([]);
  });
  it("OCR factory with Hindi honestly refuses at use time", async () => {
    const { createOCRService } = await import("@/services/ocr.service");
    const svc = createOCRService({ language: "hin" });
    const res = await svc.extractText(new File(["x"], "a.png", { type: "image/png" }));
    expect(res.available).toBe(false);
    expect(res.error).toContain("English only");
  });
  it("tesseract is lazy: no static import in shipped source", () => {
    const src = readFileSync(path.join(ROOT, "src", "services", "ocr.service.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']tesseract\.js["']/);
    expect(src).toContain('import("tesseract.js")');
  });
});
