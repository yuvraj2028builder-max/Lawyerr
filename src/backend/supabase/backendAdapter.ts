/**
 * Prompt 15 — Real Supabase backend adapter fulfilling BackendProvider.
 *
 * - Talks to a real Supabase project (Postgres + Auth + Storage) via
 *   supabase-js. Construct with a null client and every method honestly
 *   returns "not_configured" — the same fallback as before, no fake success.
 * - Privacy is enforced by Postgres RLS, not here: another user's rows are
 *   invisible, so cross-user reads surface as "not_found" (no existence
 *   leak). WITH CHECK violations (42501) surface as "forbidden".
 * - Statuses stay exactly: available/unavailable/not_configured/
 *   unauthorized/forbidden/not_found/failed.
 */
import type { ID } from "@/types/domain";
import type { BackendResult } from "../backendTypes";
import { backendErr, backendOk } from "../backendTypes";
import type {
  BackendProvider,
  HealthStatus,
  SignedDownload,
  UploadPermission,
} from "../backendProvider";
import type {
  BackendSession,
  BackendUser,
  DbActionItem,
  DbActionPlan,
  DbAiProposal,
  DbAuditEvent,
  DbCase,
  DbCaseMember,
  DbConfirmedFact,
  DbDocumentMetadata,
  DbExtractedFact,
  DbUserProfile,
} from "../backendTypes";
import type { SupabaseAuthClient, SupaSession } from "./authProvider";
import { toBackendSession } from "./authProvider";
import type { SupabaseStorageClient } from "./storageProvider";
import { SupabaseStorageProvider } from "./storageProvider";

/** Minimal query-builder surface used (real SDK satisfies it; tests mock it). */
export interface SupabaseQuery {
  eq(column: string, value: unknown): SupabaseQuery;
  order(column: string, opts?: { ascending?: boolean }): SupabaseQuery;
  limit(n: number): SupabaseQuery;
  single(): Promise<{ data: Record<string, unknown> | null; error: DbError | null }>;
  then(
    onFulfilled: (value: { data: Record<string, unknown>[] | null; error: DbError | null }) => unknown,
  ): Promise<unknown>;
}

export interface DbError {
  code?: string;
  message: string;
}

export interface SupabaseTable {
  select(columns?: string): SupabaseQuery;
  insert(row: Record<string, unknown>): { select(): SupabaseQuery };
  update(patch: Record<string, unknown>): { eq(column: string, value: unknown): { select(): SupabaseQuery } };
  delete(): { eq(column: string, value: unknown): SupabaseQuery };
}

export interface SupabaseDbClient {
  from(table: string): SupabaseTable;
}

export type SupabaseFullClient = SupabaseAuthClient & SupabaseDbClient & SupabaseStorageClient;

const NOT_CONFIGURED_MSG =
  "Backend unavailable \u2014 no real backend is connected. Local demo mode only; data stays in this browser.";

/** RLS denials must never leak row existence: invisible rows read as not_found. */
export function mapDbError(error: DbError): Exclude<BackendResult<never>["status"], "available"> {
  if (error.code === "42501") return "forbidden";
  if (error.code === "PGRST116") return "not_found";
  return "failed";
}

export function dbErrorMessage(action: string, error: DbError, status: string): string {
  if (status === "forbidden") return `${action} denied \u2014 this record belongs to a different user or is not shared with you.`;
  if (status === "not_found") return `${action} failed \u2014 record not found in your private account.`;
  return `${action} failed: ${error.message}`;
}

export class SupabaseBackendAdapter implements BackendProvider {
  private readonly storage: SupabaseStorageProvider;

  constructor(
    private readonly client: SupabaseFullClient | null,
    private readonly opts?: { supabaseUrl?: string },
  ) {
    this.storage = new SupabaseStorageProvider(client, { supabaseUrl: opts?.supabaseUrl });
  }

  private notConfigured<T>(): BackendResult<T> {
    return backendErr("not_configured", NOT_CONFIGURED_MSG);
  }

  private async sessionUser(): Promise<{ session: SupaSession | null; user: { id: string; email?: string } | null }> {
    if (!this.client) return { session: null, user: null };
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session?.user?.id) return { session: null, user: null };
    return { session: data.session, user: { id: data.session.user.id, email: data.session.user.email } };
  }

  async getHealth(): Promise<BackendResult<HealthStatus>> {
    if (!this.client) return backendErr("unavailable", NOT_CONFIGURED_MSG);
    const { user } = await this.sessionUser();
    return backendOk({
      backend: "available",
      auth: user ? "available" : "unavailable",
      storage: "available",
      aiProvider: "not_configured",
      message: user ? "Supabase backend connected with a signed-in user." : "Supabase backend configured. No user signed in — local demo data stays in this browser.",
    });
  }

  async getSession(): Promise<BackendResult<BackendSession>> {
    if (!this.client) return backendErr("unauthorized", "No authenticated session in local demo mode.");
    const { session } = await this.sessionUser();
    const mapped = toBackendSession(session);
    if (!mapped.authenticated || !mapped.user) return backendErr("unauthorized", "No authenticated Supabase session.");
    return backendOk(mapped);
  }

  async getUserIdentity(): Promise<BackendResult<BackendUser>> {
    const session = await this.getSession();
    if (session.status !== "available") return backendErr("unauthorized", "No authenticated user.");
    return backendOk(session.data.user as BackendUser);
  }

  // ─── Cases ────────────────────────────────────────────────────────────────

  async createCase(input: { title: string; description: string }): Promise<BackendResult<DbCase>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to create a private case.");
    const { data, error } = await this.client
      .from("cases")
      .insert({ user_id: user.id, title: input.title, description: input.description, status: "intake" })
      .select()
      .single();
    if (error || !data) {
      const e = error ?? { message: "insert returned no row" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage("Case creation", e, status));
    }
    return backendOk(mapCase(data));
  }

  async readCase(input: { caseId: ID }): Promise<BackendResult<DbCase>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to open a private case.");
    const { data, error } = await this.client.from("cases").select("*").eq("id", input.caseId).single();
    if (error || !data) {
      const e = error ?? { code: "PGRST116", message: "no rows" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage("Case read", e, status));
    }
    return backendOk(mapCase(data));
  }

  async updateCase(input: { caseId: ID; title?: string; description?: string }): Promise<BackendResult<DbCase>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to update a private case.");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    const { data, error } = await this.client.from("cases").update(patch).eq("id", input.caseId).select().single();
    if (error || !data) {
      const e = error ?? { code: "PGRST116", message: "no rows" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage("Case update", e, status));
    }
    return backendOk(mapCase(data));
  }

  async deleteCase(input: { caseId: ID }): Promise<BackendResult<{ caseId: ID }>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to delete a private case.");
    const { error: delError } = await this.client.from("cases").delete().eq("id", input.caseId);
    if (delError) {
      const status = mapDbError(delError);
      return backendErr(status, dbErrorMessage("Case deletion", delError, status));
    }
    return backendOk({ caseId: input.caseId });
  }

  async checkCaseOwnership(input: { caseId: ID }): Promise<BackendResult<DbCaseMember>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to check case access.");
    const { data, error } = await this.client
      .from("case_members")
      .select("*")
      .eq("case_id", input.caseId)
      .eq("user_id", user.id)
      .single();
    if (error || !data) {
      const e = error ?? { code: "PGRST116", message: "no rows" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage("Ownership check", e, status));
    }
    return backendOk(mapCaseMember(data));
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  async createDocumentMetadata(input: {
    caseId: ID;
    displayName: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<BackendResult<DbDocumentMetadata>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to add a private document.");
    const documentId = crypto.randomUUID();
    const { buildOpaqueObjectKey } = await import("../documentStorage");
    const objectKey = buildOpaqueObjectKey(user.id, input.caseId, documentId);
    const { data, error } = await this.client
      .from("documents")
      .insert({
        id: documentId,
        case_id: input.caseId,
        user_id: user.id,
        display_name: input.displayName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        object_key: objectKey,
        processing_status: "selected",
      })
      .select()
      .single();
    if (error || !data) {
      const e = error ?? { message: "insert returned no row" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage("Document registration", e, status));
    }
    return backendOk(mapDocument(data));
  }

  async readDocumentMetadata(input: { caseId: ID; documentId: ID }): Promise<BackendResult<DbDocumentMetadata>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to open a private document.");
    const { data, error } = await this.client
      .from("documents")
      .select("*")
      .eq("id", input.documentId)
      .eq("case_id", input.caseId)
      .single();
    if (error || !data) {
      const e = error ?? { code: "PGRST116", message: "no rows" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage("Document read", e, status));
    }
    return backendOk(mapDocument(data));
  }

  async deleteDocumentMetadata(input: { caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID }>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to delete a private document.");
    const meta = await this.readDocumentMetadata(input);
    if (meta.status !== "available") {
      return backendErr(meta.status, meta.error);
    }
    await this.storage.removeObject({ ownerId: user.id, caseId: input.caseId, documentId: input.documentId });
    const { error: delError } = await this.client.from("documents").delete().eq("id", input.documentId);
    if (delError) {
      const status = mapDbError(delError);
      return backendErr(status, dbErrorMessage("Document deletion", delError, status));
    }
    return backendOk({ documentId: input.documentId });
  }

  async createUploadPermission(input: { caseId: ID; documentId: ID }): Promise<BackendResult<UploadPermission>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to upload a private document.");
    const meta = await this.readDocumentMetadata(input);
    if (meta.status !== "available") {
      return backendErr(meta.status, meta.error);
    }
    const perm = await this.storage.createSignedUpload({ ownerId: user.id, caseId: input.caseId, documentId: input.documentId });
    if (perm.status !== "available") return perm as BackendResult<UploadPermission>;
    return backendOk({ uploadUrl: perm.data.url, expiresAt: perm.data.expiresAt, documentId: input.documentId });
  }

  async createSignedDownload(input: { caseId: ID; documentId: ID }): Promise<BackendResult<SignedDownload>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to download a private document.");
    const meta = await this.readDocumentMetadata(input);
    if (meta.status !== "available") {
      return backendErr(meta.status, meta.error);
    }
    const perm = await this.storage.createSignedDownload({ ownerId: user.id, caseId: input.caseId, documentId: input.documentId });
    if (perm.status !== "available") return perm as BackendResult<SignedDownload>;
    return backendOk({ downloadUrl: perm.data.url, expiresAt: perm.data.expiresAt, documentId: input.documentId });
  }

  // ─── Audit / plans / facts / proposals / profile ──────────────────────────

  async recordAuditEvent(input: { caseId: ID; category: string }): Promise<BackendResult<DbAuditEvent>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to record case activity.");
    const { data, error } = await this.client
      .from("timeline_events")
      .insert({ case_id: input.caseId, user_id: user.id, category: input.category })
      .select()
      .single();
    if (error || !data) {
      const e = error ?? { message: "insert returned no row" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage("Audit event", e, status));
    }
    return backendOk(mapAuditEvent(data));
  }

  async listAuditEvents(input: { caseId: ID }): Promise<BackendResult<DbAuditEvent[]>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to view case activity.");
    const result = await this.client
      .from("timeline_events")
      .select("*")
      .eq("case_id", input.caseId)
      .order("created_at", { ascending: true })
      .then((r) => r);
    const { data, error } = result as { data: Record<string, unknown>[] | null; error: DbError | null };
    if (error) {
      const status = mapDbError(error);
      return backendErr(status, dbErrorMessage("Audit read", error, status));
    }
    return backendOk((data ?? []).map(mapAuditEvent));
  }

  async readActionPlan(input: { caseId: ID }): Promise<BackendResult<DbActionPlan>> {
    return this.readSingle("action_plans", input.caseId, "Action plan", mapActionPlan);
  }

  async readActionItems(input: { caseId: ID }): Promise<BackendResult<DbActionItem[]>> {
    return this.readMany("action_items", input.caseId, mapActionItem);
  }

  async readConfirmedFacts(input: { caseId: ID }): Promise<BackendResult<DbConfirmedFact[]>> {
    return this.readMany("confirmed_facts", input.caseId, mapConfirmedFact);
  }

  async readExtractedFacts(input: { caseId: ID }): Promise<BackendResult<DbExtractedFact[]>> {
    return this.readMany("extracted_facts", input.caseId, mapExtractedFact);
  }

  async readAiProposals(input: { caseId: ID }): Promise<BackendResult<DbAiProposal[]>> {
    return this.readMany("ai_proposals", input.caseId, mapAiProposal);
  }

  async readUserProfile(): Promise<BackendResult<DbUserProfile>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to view your profile.");
    const { data, error } = await this.client.from("profiles").select("*").eq("user_id", user.id).single();
    if (error || !data) {
      const e = error ?? { code: "PGRST116", message: "no rows" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage("Profile read", e, status));
    }
    return backendOk(mapProfile(data));
  }

  private async readSingle<T>(
    table: string,
    caseId: ID,
    label: string,
    map: (row: Record<string, unknown>) => T,
  ): Promise<BackendResult<T>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", `Sign in to view this ${label.toLowerCase()}.`);
    const { data, error } = await this.client.from(table).select("*").eq("case_id", caseId).single();
    if (error || !data) {
      const e = error ?? { code: "PGRST116", message: "no rows" };
      const status = mapDbError(e);
      return backendErr(status, dbErrorMessage(label, e, status));
    }
    return backendOk(map(data));
  }

  private async readMany<T>(
    table: string,
    caseId: ID,
    map: (row: Record<string, unknown>) => T,
  ): Promise<BackendResult<T[]>> {
    if (!this.client) return this.notConfigured();
    const { user } = await this.sessionUser();
    if (!user) return backendErr("unauthorized", "Sign in to view private case data.");
    const result = await this.client
      .from(table)
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true })
      .then((r) => r);
    const { data, error } = result as { data: Record<string, unknown>[] | null; error: DbError | null };
    if (error) {
      const status = mapDbError(error);
      return backendErr(status, dbErrorMessage("Private read", error, status));
    }
    return backendOk((data ?? []).map(map));
  }
}

// ─── Row mappers (snake_case rows -> camelCase contracts) ───────────────────

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" ? v : fallback);

function mapCase(row: Record<string, unknown>): DbCase {
  return {
    caseId: str(row.id), ownerId: str(row.user_id), title: str(row.title), description: str(row.description),
    status: str(row.status, "intake"), createdAt: str(row.created_at), updatedAt: str(row.updated_at),
  };
}

function mapCaseMember(row: Record<string, unknown>): DbCaseMember {
  return {
    caseId: str(row.case_id), userId: str(row.user_id),
    role: row.role === "owner" ? "owner" : "viewer", addedAt: str(row.added_at),
  };
}

function mapDocument(row: Record<string, unknown>): DbDocumentMetadata {
  return {
    documentId: str(row.id), caseId: str(row.case_id), ownerId: str(row.user_id),
    displayName: str(row.display_name), mimeType: str(row.mime_type), sizeBytes: num(row.size_bytes),
    objectKey: str(row.object_key), uploadedAt: str(row.uploaded_at), processingStatus: str(row.processing_status, "selected"),
  };
}

function mapExtractedFact(row: Record<string, unknown>): DbExtractedFact {
  return {
    factId: str(row.id), caseId: str(row.case_id), ownerId: str(row.user_id), documentId: str(row.document_id),
    field: str(row.field), value: str(row.value), rawText: str(row.raw_text), source: str(row.source, "document_text"),
    confidence: row.confidence === "high" || row.confidence === "low" ? row.confidence : "medium",
    createdAt: str(row.created_at),
  };
}

function mapConfirmedFact(row: Record<string, unknown>): DbConfirmedFact {
  return {
    factId: str(row.id), caseId: str(row.case_id), ownerId: str(row.user_id),
    documentId: row.document_id ? str(row.document_id) : undefined,
    field: str(row.field), value: str(row.value), confirmedByUser: true, confirmedAt: str(row.confirmed_at),
  };
}

function mapActionPlan(row: Record<string, unknown>): DbActionPlan {
  return {
    planId: str(row.id), caseId: str(row.case_id), ownerId: str(row.user_id),
    planVersion: num(row.plan_version, 1), summary: str(row.summary),
    createdAt: str(row.created_at), updatedAt: str(row.updated_at),
  };
}

function mapActionItem(row: Record<string, unknown>): DbActionItem {
  const status = str(row.status, "pending");
  return {
    itemId: str(row.id), planId: str(row.plan_id), caseId: str(row.case_id), ownerId: str(row.user_id),
    title: str(row.title),
    status: status === "done" || status === "in_progress" || status === "skipped" ? status : "pending",
    updatedAt: str(row.updated_at),
  };
}

function mapAuditEvent(row: Record<string, unknown>): DbAuditEvent {
  return {
    eventId: str(row.id), caseId: str(row.case_id), ownerId: str(row.user_id),
    category: str(row.category), createdAt: str(row.created_at),
  };
}

function mapAiProposal(row: Record<string, unknown>): DbAiProposal {
  return {
    proposalId: str(row.id), caseId: str(row.case_id), ownerId: str(row.user_id),
    kind: str(row.kind), summary: str(row.summary), createdAt: str(row.created_at),
  };
}

function mapProfile(row: Record<string, unknown>): DbUserProfile {
  return {
    userId: str(row.user_id), displayName: row.display_name ? str(row.display_name) : undefined,
    languagePreference: row.language_preference === "hi" ? "hi" : "en",
    createdAt: str(row.created_at), updatedAt: str(row.updated_at),
  };
}
