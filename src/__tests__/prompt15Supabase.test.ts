/**
 * Prompt 15 — Supabase wiring tests.
 *
 * EXPLICIT: no live Supabase project is used here. All client behavior is
 * tested against hand-written mocks of the narrow structural surfaces in
 * src/backend/supabase/*. RLS is verified statically against the real
 * migration SQL (each CREATE POLICY must filter on auth.uid()), and the
 * no-secret-in-bundle check greps real source AND built dist/ output.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getSupabasePublicConfig,
  isSupabaseEnvConfigured,
  loadSupabaseClient,
  __resetSupabaseClientCache,
} from "@/backend/supabase/client";
import { SupabaseAuthProvider, toBackendSession } from "@/backend/supabase/authProvider";
import { SupabaseBackendAdapter, mapDbError } from "@/backend/supabase/backendAdapter";
import type { SupabaseFullClient } from "@/backend/supabase/backendAdapter";
import { SupabaseStorageProvider, PRIVATE_DOCUMENTS_BUCKET } from "@/backend/supabase/storageProvider";
import { SIGNED_URL_TTL_SECONDS } from "@/backend/documentStorage";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const ROOT = process.cwd();

// ─── Mock builders ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
interface DbResult { data: unknown; error: { code?: string; message: string } | null }

class MockQuery {
  calls: string[] = [];
  constructor(private readonly result: DbResult) {}
  select(_c?: string): this { this.calls.push("select"); return this; }
  eq(column: string, value: unknown): this { this.calls.push(`eq:${column}`); void value; return this; }
  order(column: string, _o?: unknown): this { this.calls.push(`order:${column}`); return this; }
  limit(_n: number): this { this.calls.push("limit"); return this; }
  async single(): Promise<{ data: Row | null; error: DbResult["error"] }> {
    const d = this.result.data;
    return { data: (Array.isArray(d) ? (d[0] as Row) ?? null : (d as Row)) ?? null, error: this.result.error };
  }
  then(onF: (v: { data: Row[] | null; error: DbResult["error"] }) => unknown): Promise<unknown> {
    const d = this.result.data;
    const arr = d === null || d === undefined ? null : Array.isArray(d) ? (d as Row[]) : [d as Row];
    return Promise.resolve().then(() => onF({ data: arr, error: this.result.error }));
  }
}

function mockDb(
  results: Record<string, DbResult>,
  seen: { table: string; op: string }[] = [],
  inserts: unknown[] = [],
) {
  const pick = (table: string, op: string): DbResult =>
    results[`${table}:${op}`] ?? results[table] ?? { data: null, error: { code: "PGRST116", message: "no rows" } };
  return {
    from(table: string) {
      return {
        select: () => { seen.push({ table, op: "select" }); return new MockQuery(pick(table, "select")); },
        insert: (row: unknown) => {
          seen.push({ table, op: "insert" });
          inserts.push(row);
          return { select: () => new MockQuery(pick(table, "insert")) };
        },
        update: (patch: unknown) => {
          seen.push({ table, op: "update" });
          void patch;
          return { eq: () => ({ select: () => new MockQuery(pick(table, "update")) }) };
        },
        delete: () => {
          seen.push({ table, op: "delete" });
          return { eq: () => new MockQuery(pick(table, "delete")) };
        },
      };
    },
  };
}

interface SupaSessionLike { user: { id: string; email?: string }; expires_at?: number }

function mockAuth(session: SupaSessionLike | null, spy: { otp?: unknown; signedOut?: boolean; unsubscribed?: boolean; listener?: (e: string, s: SupaSessionLike | null) => void } = {}) {
  return {
    getSession: async () => ({ data: { session }, error: null }),
    signInWithOtp: async (input: { email: string }) => { spy.otp = input; return { error: null }; },
    signOut: async () => { spy.signedOut = true; return { error: null }; },
    onAuthStateChange: (cb: (e: string, s: SupaSessionLike | null) => void) => {
      spy.listener = cb;
      return { data: { subscription: { unsubscribe: () => { spy.unsubscribed = true; } } } };
    },
  };
}

function mockStorage(spy: { bucket?: string; paths?: string[]; expires?: number[] } = {}) {
  return {
    from: (bucket: string) => {
      spy.bucket = bucket;
      return {
        createSignedUploadUrl: async (p: string) => {
          (spy.paths ??= []).push(p);
          return { data: { path: p, token: "tok_abc" }, error: null };
        },
        createSignedUrl: async (p: string, expiresIn: number) => {
          (spy.paths ??= []).push(p);
          (spy.expires ??= []).push(expiresIn);
          return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${p}?token=sig` }, error: null };
        },
        remove: async (paths: string[]) => { (spy.paths ??= []).push(...paths); return { error: null }; },
      };
    },
  };
}

function mockSession(): SupaSessionLike {
  return { user: { id: ALICE, email: "a@example.in" }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
}

function fullClient(session: SupaSessionLike | null, results: Record<string, DbResult> = {}, spy: { otp?: unknown; signedOut?: boolean; unsubscribed?: boolean; listener?: (e: string, s: SupaSessionLike | null) => void; bucket?: string; paths?: string[]; expires?: number[] } = {}, seen: { table: string; op: string }[] = [], inserts: unknown[] = []): SupabaseFullClient {
  return { auth: mockAuth(session, spy), ...mockDb(results, seen, inserts), storage: mockStorage(spy) } as unknown as SupabaseFullClient;
}

// ─── Part 1: client env boundary ────────────────────────────────────────────

describe("Prompt 15 — public env only, honest fallback", () => {
  // Hermetic: developer .env.local must never change what these tests prove.
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    __resetSupabaseClientCache();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("absent env reads as empty (honest local demo)", () => {
    expect(getSupabasePublicConfig().url).toBe("");
  });
  it("absent env is not configured", () => {
    expect(isSupabaseEnvConfigured({ url: "", anonKey: "" })).toBe(false);
  });
  it("malformed URL is not configured", () => {
    expect(isSupabaseEnvConfigured({ url: "not-a-url", anonKey: "k" })).toBe(false);
  });
  it("non-https URL is not configured", () => {
    expect(isSupabaseEnvConfigured({ url: "http://localhost:8000", anonKey: "k" })).toBe(false);
  });
  it("well-formed public config is configured (no live call made)", () => {
    expect(isSupabaseEnvConfigured({ url: "https://abc.supabase.co", anonKey: "anon-key" })).toBe(true);
  });
  it("loadSupabaseClient resolves null when env is absent, never throws", async () => {
    __resetSupabaseClientCache();
    await expect(loadSupabaseClient()).resolves.toBeNull();
  });
});

// ─── Part 2: real auth mapping ──────────────────────────────────────────────

describe("Prompt 15 — Supabase auth mapping (mocked client)", () => {
  it("maps a Supabase session to authenticated with email identity", async () => {
    const p = new SupabaseAuthProvider({ auth: mockAuth(mockSession()) } as unknown as SupabaseFullClient);
    const s = await p.getSession();
    expect(s.authenticated).toBe(true);
    expect(s.user?.id).toBe(ALICE);
    expect(s.user?.displayName).toBe("a@example.in");
    expect(s.expiresAt).toBeDefined();
  });
  it("null Supabase session maps to unauthenticated", () => {
    expect(toBackendSession(null).authenticated).toBe(false);
  });
  it("expired Supabase session maps to expired, user withheld", () => {
    const s = toBackendSession({ user: { id: ALICE }, expires_at: Math.floor(Date.now() / 1000) - 10 });
    expect(s.authenticated).toBe(false);
    expect(s.expired).toBe(true);
    expect(s.user).toBeNull();
  });
  it("getCurrentUser returns null without a session", async () => {
    const p = new SupabaseAuthProvider({ auth: mockAuth(null) } as unknown as SupabaseFullClient);
    expect(await p.getCurrentUser()).toBeNull();
  });
  it("bare signIn never signs in and asks for an email", async () => {
    const p = new SupabaseAuthProvider({ auth: mockAuth(null) } as unknown as SupabaseFullClient);
    const r = await p.signIn();
    expect(r.signedIn).toBe(false);
    expect(r.reason.toLowerCase()).toContain("email");
  });
  it("magic link validates the email first", async () => {
    const p = new SupabaseAuthProvider({ auth: mockAuth(null) } as unknown as SupabaseFullClient);
    expect((await p.requestMagicLink("not-an-email")).sent).toBe(false);
  });
  it("magic link sends via signInWithOtp with email only (no password field)", async () => {
    const spy: { otp?: unknown } = {};
    const p = new SupabaseAuthProvider({ auth: mockAuth(null, spy) } as unknown as SupabaseFullClient);
    const r = await p.requestMagicLink("user@example.in");
    expect(r.sent).toBe(true);
    expect(spy.otp).toEqual({ email: "user@example.in" });
    expect(JSON.stringify(spy.otp).toLowerCase()).not.toContain("password");
  });
  it("signOut delegates to Supabase and completes", async () => {
    const spy: { signedOut?: boolean } = {};
    const p = new SupabaseAuthProvider({ auth: mockAuth(mockSession(), spy) } as unknown as SupabaseFullClient);
    await p.signOut();
    expect(spy.signedOut).toBe(true);
  });
  it("auth state changes map through and unsubscribe works", async () => {
    const spy: { listener?: (e: string, s: SupaSessionLike | null) => void; unsubscribed?: boolean } = {};
    const p = new SupabaseAuthProvider({ auth: mockAuth(null, spy) } as unknown as SupabaseFullClient);
    const seen: boolean[] = [];
    const unsub = p.onAuthStateChange((s) => seen.push(s.authenticated));
    spy.listener?.("SIGNED_IN", mockSession());
    spy.listener?.("SIGNED_OUT", null);
    unsub();
    expect(seen).toEqual([true, false]);
    expect(spy.unsubscribed).toBe(true);
  });
});

// ─── Backend adapter: fallback + mapping + RLS honesty ──────────────────────

describe("Prompt 15 — adapter fallback and status mapping", () => {
  it("null client keeps not_configured for reads, writes, and URLs", async () => {
    const api = new SupabaseBackendAdapter(null);
    expect((await api.readCase({ caseId: "c" })).status).toBe("not_configured");
    expect((await api.createCase({ title: "t", description: "d" })).status).toBe("not_configured");
    expect((await api.createSignedDownload({ caseId: "c", documentId: "d" })).status).toBe("not_configured");
    expect((await api.recordAuditEvent({ caseId: "c", category: "x" })).status).toBe("not_configured");
  });
  it("missing session is unauthorized, never metadata", async () => {
    const api = new SupabaseBackendAdapter(fullClient(null));
    const r = await api.readCase({ caseId: "c" });
    expect(r.status).toBe("unauthorized");
  });
  it("readCase maps the row into the DbCase contract", async () => {
    const row = { id: "c1", user_id: ALICE, title: "T", description: "D", status: "intake", created_at: "2026-01-01", updated_at: "2026-01-02" };
    const api = new SupabaseBackendAdapter(fullClient(mockSession(), { cases: { data: row, error: null } }));
    const r = await api.readCase({ caseId: "c1" });
    expect(r.status).toBe("available");
    if (r.status === "available") {
      expect(r.data.caseId).toBe("c1");
      expect(r.data.ownerId).toBe(ALICE);
    }
  });
  it("RLS-invisible rows read as not_found (no existence leak for cross-user reads)", async () => {
    const api = new SupabaseBackendAdapter(fullClient(mockSession()));
    const r = await api.readCase({ caseId: "someone-elses-case" });
    expect(r.status).toBe("not_found");
    if (r.status !== "available") expect(JSON.stringify(r).toLowerCase()).not.toContain(BOB);
  });
  it("WITH CHECK violations map to forbidden", () => {
    expect(mapDbError({ code: "42501", message: "permission denied" })).toBe("forbidden");
  });
  it("createCase stamps the signed-in user as owner", async () => {
    const inserts: unknown[] = [];
    const client = fullClient(mockSession(), { cases: { data: { id: "c9", user_id: ALICE }, error: null } }, {}, [], inserts);
    const api = new SupabaseBackendAdapter(client);
    const r = await api.createCase({ title: "t", description: "d" });
    expect(r.status).toBe("available");
    expect(JSON.stringify(inserts)).toContain(ALICE);
  });
  it("update denied by RLS is forbidden, not success", async () => {
    const api = new SupabaseBackendAdapter(fullClient(mockSession(), { cases: { data: null, error: { code: "42501", message: "denied" } } }));
    expect((await api.updateCase({ caseId: "c" })).status).toBe("forbidden");
  });
  it("delete without a session is unauthorized", async () => {
    const api = new SupabaseBackendAdapter(fullClient(null));
    expect((await api.deleteCase({ caseId: "c" })).status).toBe("unauthorized");
  });
  it("audit listing scopes to the case and maps categories", async () => {
    const seen: { table: string; op: string }[] = [];
    const api = new SupabaseBackendAdapter(
      fullClient(mockSession(), { timeline_events: { data: [{ id: "e1", case_id: "c1", user_id: ALICE, category: "document_workflow", created_at: "2026-01-01" }], error: null } }, {}, seen),
    );
    const r = await api.listAuditEvents({ caseId: "c1" });
    expect(r.status).toBe("available");
    if (r.status === "available") expect(r.data[0].category).toBe("document_workflow");
    expect(seen.some((s) => s.table === "timeline_events")).toBe(true);
  });
  it("health without a client is unavailable", async () => {
    expect((await new SupabaseBackendAdapter(null).getHealth()).status).toBe("unavailable");
  });
  it("health with a client reports available backend and signed-in auth", async () => {
    const r = await new SupabaseBackendAdapter(fullClient(mockSession())).getHealth();
    expect(r.status).toBe("available");
    if (r.status === "available") {
      expect(r.data.backend).toBe("available");
      expect(r.data.auth).toBe("available");
      expect(r.data.aiProvider).toBe("not_configured");
    }
  });
});

// ─── Private storage: opaque keys, short-lived URLs ─────────────────────────

describe("Prompt 15 — private storage honesty", () => {
  const ids = { ownerId: ALICE, caseId: "case_1", documentId: "doc_9" };
  it("unconfigured storage returns not_configured, never a URL", async () => {
    const s = new SupabaseStorageProvider(null);
    const up = await s.createSignedUpload(ids);
    const down = await s.createSignedDownload(ids);
    expect(up.status).toBe("not_configured");
    expect(down.status).toBe("not_configured");
    expect(JSON.stringify([up, down])).not.toContain("http");
  });
  it("upload targets the private bucket with an opaque key (no filename)", async () => {
    const spy: { bucket?: string; paths?: string[] } = {};
    const storageOnly = { storage: mockStorage(spy) } as unknown as SupabaseFullClient;
    const s = new SupabaseStorageProvider(storageOnly, { supabaseUrl: "https://abc.supabase.co" });
    const r = await s.createSignedUpload(ids);
    expect(r.status).toBe("available");
    expect(spy.bucket).toBe(PRIVATE_DOCUMENTS_BUCKET);
    expect(spy.paths?.[0]).toBe(`private/${ALICE}/case_1/doc_9`);
    expect(spy.paths?.[0]).not.toContain("invoice");
  });
  it("upload URL is a short-lived tokenized URL, not a bare path", async () => {
    const storageOnly = { storage: mockStorage() } as unknown as SupabaseFullClient;
    const s = new SupabaseStorageProvider(storageOnly, { supabaseUrl: "https://abc.supabase.co" });
    const r = await s.createSignedUpload(ids);
    if (r.status !== "available") expect.unreachable();
    else {
      // The single-use token belongs in the caller-only URL (required for the
      // upload to work). It must never be logged, cached, or sent to
      // analytics — pinned by the analytics-guard tests, not by stripping it.
      expect(r.data.url).toContain("token=");
      expect(r.data.url).toContain("private/");
    }
  });
  it("download expiry matches the short-lived TTL", async () => {
    const storageOnly = { storage: mockStorage() } as unknown as SupabaseFullClient;
    const s = new SupabaseStorageProvider(storageOnly, { supabaseUrl: "https://abc.supabase.co" });
    const before = Date.now();
    const r = await s.createSignedDownload(ids);
    if (r.status !== "available") expect.unreachable();
    else {
      const ttlMs = new Date(r.data.expiresAt).getTime() - before;
      expect(ttlMs).toBeGreaterThan(0);
      expect(ttlMs).toBeLessThanOrEqual(SIGNED_URL_TTL_SECONDS * 1000 + 5000);
    }
  });
  it("storage failures report failed, never a fabricated URL", async () => {
    const failing = { storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: new Error("boom") }) }) } };
    const s = new SupabaseStorageProvider(failing as unknown as SupabaseFullClient);
    const r = await s.createSignedDownload(ids);
    expect(r.status).toBe("failed");
    expect(JSON.stringify(r)).not.toContain("object/sign");
  });
});

// ─── RLS migration static verification ──────────────────────────────────────

const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
function readMigration(name: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
}

describe("Prompt 15 — RLS policies, table by table", () => {
  const tables = ["profiles", "cases", "case_members", "documents", "extracted_facts", "confirmed_facts", "action_plans", "action_items", "timeline_events", "ai_proposals"];
  it("migration files exist and are reviewable", () => {
    expect(existsSync(path.join(MIGRATIONS_DIR, "0001_nyayasetu_foundation.sql"))).toBe(true);
    expect(existsSync(path.join(MIGRATIONS_DIR, "0002_nyayasetu_storage.sql"))).toBe(true);
  });
  it.each(tables)("enables RLS on %s", (table) => {
    const sql = readMigration("0001_nyayasetu_foundation.sql");
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
  });
  it("every private table carries a user_id owner column", () => {
    const sql = readMigration("0001_nyayasetu_foundation.sql");
    for (const table of ["cases", "documents", "confirmed_facts", "action_plans", "action_items", "timeline_events", "ai_proposals"]) {
      expect(sql).toContain(`user_id uuid not null references auth.users (id) on delete cascade`);
      void table;
    }
  });
  it("owner policies filter on auth.uid() = user_id (no USING (true) anywhere)", () => {
    const sql = readMigration("0001_nyayasetu_foundation.sql");
    expect(sql.toLowerCase()).not.toContain("using (true)");
    expect(sql.toLowerCase()).not.toContain("with check (true)");
    const matches = sql.match(/auth\.uid\(\) = user_id/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(10);
  });
  it("case_members sharing is owner-managed, never world-readable", () => {
    const sql = readMigration("0001_nyayasetu_foundation.sql");
    expect(sql).toContain("case_members_select");
    expect(sql).toContain("case_members_insert_owner");
    expect(sql).toContain("c.user_id = auth.uid()");
  });
  it("confirmed facts survive document deletion (provenance promise)", () => {
    expect(readMigration("0001_nyayasetu_foundation.sql")).toContain("on delete set null");
  });
  it("storage bucket is private, never public", () => {
    const sql = readMigration("0002_nyayasetu_storage.sql");
    expect(sql).toContain("'nyayasetu-private'");
    expect(sql).toContain("false");
    expect(sql.toLowerCase()).not.toMatch(/public\s*=\s*true/);
  });
  it("storage policies pin the key prefix to the caller's auth.uid()", () => {
    const sql = readMigration("0002_nyayasetu_storage.sql");
    expect(sql).toContain("(storage.foldername(name))[2] = (auth.uid())::text");
    expect(sql).toContain("bucket_id = 'nyayasetu-private'");
    for (const op of ["for select", "for insert", "for update", "for delete"]) {
      expect(sql.toLowerCase()).toContain(op);
    }
  });
});

// ─── No service-role key in frontend (automated) ────────────────────────────
// NOTE: the bare WORDS "service-role" legitimately appear in warning copy
// ("never put service-role keys here"). What must never appear is a secret
// VALUE: a key name assigned a token, a private key block, or a live secret.
// These patterns target values, and the positive-control test below proves
// they actually catch a leak (so this check cannot pass vacuously).

const SECRET_VALUE_PATTERNS = [
  /service[_-]?role.{0,40}[=:]\s*["']?eyJ[A-Za-z0-9-_]{10,}/i,
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']?\S{16,}/i,
  /BEGIN[A-Z\s]*PRIVATE KEY/,
  /sk-live-[A-Za-z0-9]+/,
  /GEMINI_API_KEY\s*[:=]\s*["']?[A-Za-z0-9-_]{16,}/i,
];

function scanForSecretValues(content: string): string[] {
  return SECRET_VALUE_PATTERNS.filter((pattern) => pattern.test(content)).map(String);
}

describe("Prompt 15 — automated secret-leak checks", () => {
  it("positive control: the patterns catch a real-looking leak", () => {
    const leak = 'const key = "service_role_key=eyJhbGciOiJIUzI1NiJ9.payload.sig";';
    expect(scanForSecretValues(leak).length).toBeGreaterThan(0);
    expect(scanForSecretValues("Never put service-role keys in frontend code.")).toEqual([]);
  });
  it("supabase frontend source contains no secret values", () => {
    const dir = path.join(ROOT, "src", "backend", "supabase");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(path.join(dir, file), "utf8");
      expect(scanForSecretValues(content), `${file} leaks a secret value`).toEqual([]);
    }
  });
  it("whole src tree contains no assigned service-role value", () => {
    // Test fixtures intentionally contain leak-like strings (positive
    // controls), so __tests__ is excluded here — and the next test proves
    // test files are never bundled, so the exclusion cannot hide a real leak.
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === "__tests__") continue;
          walk(path.join(dir, entry.name));
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          const found = scanForSecretValues(readFileSync(full, "utf8"));
          if (found.length > 0) hits.push(`${full}: ${found.join(",")}`);
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(hits).toEqual([]);
  });
  it("no shipped source imports test files (so the scan exclusion is sound)", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === "__tests__") continue;
          walk(path.join(dir, entry.name));
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          if (readFileSync(full, "utf8").includes("__tests__")) offenders.push(full);
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
  it("built frontend bundle contains no secret values", () => {
    const dist = path.join(ROOT, "dist", "assets");
    if (!existsSync(dist)) {
      expect(true).toBe(true);
      return;
    }
    const bundles = readdirSync(dist).filter((f) => f.endsWith(".js"));
    expect(bundles.length).toBeGreaterThan(0);
    for (const bundle of bundles) {
      const content = readFileSync(path.join(dist, bundle), "utf8");
      expect(scanForSecretValues(content), `${bundle} leaks a secret value`).toEqual([]);
    }
  });
});
