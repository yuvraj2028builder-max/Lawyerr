/**
 * Prompt 16 — Consent-gated local → cloud sync (Part 3).
 *
 * - NEVER automatic, NEVER bulk-by-default: one case per explicit tap,
 *   "save all" only via its own explicit button.
 * - Explicit consent (checkbox) is required before anything leaves the browser.
 * - Files upload only when real bytes exist locally; otherwise metadata only.
 * - Crash/partway-failure safe: the SyncRecord is written LAST, local data is
 *   never mutated on push paths, and a best-effort cleanup removes a
 *   just-created cloud case when a later step fails.
 * - Conflict (both sides changed since last sync) returns a choice — never
 *   silent overwrite. Cloud-only change pulls automatically (no local edits
 *   to lose); local-only change pushes.
 * - Anonymous users can never reach this code: every entry requires a
 *   signed-in session first.
 */
import type { Case, ID } from "@/types/domain";
import type { BackendResult, BackendSession, DbCase, DbDocumentMetadata } from "@/backend/backendTypes";
import { caseEngine } from "@/services/caseEngine.service";

export type SyncState = "not_synced" | "synced" | "behind_cloud" | "ahead_local" | "conflict" | "failed";
export type ConflictChoice = "keep_cloud" | "keep_local" | "cancel";

export interface SyncRecord {
  localId: ID;
  cloudCaseId: ID;
  localUpdatedAt: string;
  cloudUpdatedAt: string;
  syncedAt: string;
  documents: Record<string, ID>;
  filesSkipped: string[];
}

export interface SyncOutcome {
  status: "synced" | "pulled" | "conflict" | "failed" | "refused";
  message: string;
  retryable: boolean;
  conflict?: { localUpdatedAt: string; cloudUpdatedAt: string };
  failedAtStep?: string;
  filesSkipped?: string[];
}

/** Narrow backend surface sync needs (SupabaseBackendAdapter satisfies it). */
export interface SyncBackend {
  getSession(): Promise<BackendResult<BackendSession>>;
  createCase(input: { title: string; description: string }): Promise<BackendResult<DbCase>>;
  readCase(input: { caseId: ID }): Promise<BackendResult<DbCase>>;
  updateCase(input: { caseId: ID; title?: string; description?: string }): Promise<BackendResult<DbCase>>;
  deleteCase(input: { caseId: ID }): Promise<BackendResult<{ caseId: ID }>>;
  createDocumentMetadata(input: { caseId: ID; displayName: string; mimeType: string; sizeBytes: number }): Promise<BackendResult<DbDocumentMetadata>>;
  createUploadPermission(input: { caseId: ID; documentId: ID }): Promise<BackendResult<{ uploadUrl: string; expiresAt: string; documentId: ID }>>;
  recordAuditEvent(input: { caseId: ID; category: string }): Promise<BackendResult<{ eventId: ID }>>;
}

const SYNC_STORE_KEY = "nyayasetu_sync_v1";

function loadStore(): Record<string, SyncRecord> {
  try {
    return JSON.parse(localStorage.getItem(SYNC_STORE_KEY) ?? "{}") as Record<string, SyncRecord>;
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, SyncRecord>): void {
  localStorage.setItem(SYNC_STORE_KEY, JSON.stringify(store));
}

export function getSyncRecord(localId: ID): SyncRecord | null {
  return loadStore()[localId] ?? null;
}

export function clearSyncRecord(localId: ID): void {
  const store = loadStore();
  delete store[localId];
  saveStore(store);
}

/** Test seam: wipe the sync map. */
export function __clearSyncStore(): void {
  try { localStorage.removeItem(SYNC_STORE_KEY); } catch { /* ignore */ }
}

async function requireSession(backend: SyncBackend): Promise<{ userId: ID } | { error: string }> {
  const session = await backend.getSession();
  if (session.status !== "available" || !session.data.user) {
    return { error: "Sign in to save cases to your account. Anonymous usage stays local-only." };
  }
  return { userId: session.data.user.id };
}

async function defaultUploadFile(url: string, file: File): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!res.ok) throw new Error(`File upload failed (${res.status}). Your local copy is untouched.`);
}

export interface SyncDeps {
  backend: SyncBackend;
  uploadFile?: (url: string, file: File) => Promise<void>;
}

/**
 * Describe what a sync would do, without doing anything. Powers the consent
 * UI ("here is exactly what will leave your browser").
 */
export async function describeSyncPlan(localId: ID, deps: SyncDeps): Promise<SyncOutcome & { plan?: string[] }> {
  const authed = await requireSession(deps.backend);
  if ("error" in authed) return { status: "refused", message: authed.error, retryable: false };
  const local = await caseEngine.getCase(localId);
  if (!local) return { status: "failed", message: "Local case not found.", retryable: false };
  const record = getSyncRecord(localId);
  const docs = local.documentUploads ?? [];
  const withBytes = docs.filter((d) => d.file).length;
  const plan = [
    `Copy "${local.title}" and its case details to your private account.`,
    `${docs.length} evidence record(s) will be copied${withBytes < docs.length ? ` (${docs.length - withBytes} without file bytes — metadata only, no file is fabricated)` : " (with their files)"}.`,
    record ? "This case was saved before — only new changes will be pushed." : "This is the first save for this case.",
  ];
  return { status: "synced", message: plan.join(" "), retryable: false, plan };
}

export async function syncCase(localId: ID, deps: SyncDeps): Promise<SyncOutcome> {
  const authed = await requireSession(deps.backend);
  if ("error" in authed) return { status: "refused", message: authed.error, retryable: false };
  const local = await caseEngine.getCase(localId);
  if (!local) return { status: "failed", message: "Local case not found.", retryable: false };

  const record = getSyncRecord(localId);
  const uploadFile = deps.uploadFile ?? defaultUploadFile;

  // Previously synced: compare both sides before touching anything.
  if (record) {
    const cloud = await deps.backend.readCase({ caseId: record.cloudCaseId });
    if (cloud.status !== "available") {
      return { status: "failed", message: "Could not reach your saved copy. Local data is untouched — try again.", retryable: true, failedAtStep: "read-cloud" };
    }
    const cloudChanged = cloud.data.updatedAt > record.cloudUpdatedAt;
    const localChanged = local.updatedAt > record.localUpdatedAt;
    if (cloudChanged && localChanged) {
      return {
        status: "conflict",
        message: "This case changed both here and in your account since the last save. Choose which to keep — nothing is overwritten until you decide.",
        retryable: false,
        conflict: { localUpdatedAt: local.updatedAt, cloudUpdatedAt: cloud.data.updatedAt },
      };
    }
    if (cloudChanged && !localChanged) {
      await pullCloudIntoLocal(local, cloud.data);
      persistRecord({ ...record, localUpdatedAt: (await caseEngine.getCase(localId))?.updatedAt ?? record.localUpdatedAt, cloudUpdatedAt: cloud.data.updatedAt, syncedAt: new Date().toISOString() });
      return { status: "pulled", message: "Your saved copy was newer, so this device now matches it. Nothing you changed was lost.", retryable: false };
    }
    if (!localChanged && !cloudChanged) {
      return { status: "synced", message: "Already up to date — nothing needed saving.", retryable: false };
    }
    const pushed = await pushLocalToCloud(local, record.cloudCaseId, deps, uploadFile, record);
    return pushed;
  }

  // First save: create the cloud case, then children, record LAST.
  const created = await deps.backend.createCase({ title: local.title, description: local.description });
  if (created.status !== "available") {
    return { status: "failed", message: "Could not save this case. Local data is untouched — try again.", retryable: true, failedAtStep: "create-case" };
  }
  const cloudCaseId = created.data.caseId;
  const emptyRecord: SyncRecord = {
    localId, cloudCaseId, localUpdatedAt: "", cloudUpdatedAt: "", syncedAt: "", documents: {}, filesSkipped: [],
  };
  const pushed = await pushLocalToCloud(local, cloudCaseId, deps, uploadFile, emptyRecord, true);
  if (pushed.status !== "synced") {
    // Best-effort cleanup so a retry starts clean; local data untouched either way.
    try { await deps.backend.deleteCase({ caseId: cloudCaseId }); } catch { /* report, don't throw */ }
  }
  return pushed;
}

export async function resolveConflict(localId: ID, choice: ConflictChoice, deps: SyncDeps): Promise<SyncOutcome> {
  const authed = await requireSession(deps.backend);
  if ("error" in authed) return { status: "refused", message: authed.error, retryable: false };
  if (choice === "cancel") return { status: "conflict", message: "Kept everything as-is. Nothing was overwritten.", retryable: false };
  const record = getSyncRecord(localId);
  const local = await caseEngine.getCase(localId);
  if (!record || !local) return { status: "failed", message: "Nothing to resolve — save the case first.", retryable: false };

  if (choice === "keep_cloud") {
    const cloud = await deps.backend.readCase({ caseId: record.cloudCaseId });
    if (cloud.status !== "available") {
      return { status: "failed", message: "Could not reach your saved copy. Local data is untouched — try again.", retryable: true, failedAtStep: "read-cloud" };
    }
    await pullCloudIntoLocal(local, cloud.data);
    persistRecord({ ...record, localUpdatedAt: (await caseEngine.getCase(localId))?.updatedAt ?? record.localUpdatedAt, cloudUpdatedAt: cloud.data.updatedAt, syncedAt: new Date().toISOString() });
    return { status: "pulled", message: "Kept your saved copy. This device now matches it.", retryable: false };
  }

  const pushed = await pushLocalToCloud(local, record.cloudCaseId, deps, deps.uploadFile ?? defaultUploadFile, record);
  return pushed;
}

/** Sequential per-case save-all. Each case still syncs individually; one failure never stops the rest. */
export async function syncAllCases(localIds: ID[], deps: SyncDeps): Promise<{ synced: ID[]; failed: { id: ID; message: string }[]; skipped: ID[] }> {
  const synced: ID[] = [];
  const failed: { id: ID; message: string }[] = [];
  const skipped: ID[] = [];
  for (const id of localIds) {
    if (getSyncRecord(id)) { skipped.push(id); continue; }
    const outcome = await syncCase(id, deps);
    if (outcome.status === "synced" || outcome.status === "pulled") synced.push(id);
    else failed.push({ id, message: outcome.message });
  }
  return { synced, failed, skipped };
}

export function getSyncState(local: Case): SyncState {
  const record = getSyncRecord(local.id);
  if (!record) return "not_synced";
  return "synced";
}

// ─── internals ──────────────────────────────────────────────────────────────

function persistRecord(record: SyncRecord): void {
  const store = loadStore();
  store[record.localId] = record;
  saveStore(store);
}

async function pullCloudIntoLocal(local: Case, cloud: DbCase): Promise<void> {
  await caseEngine.updateCase(local.id, { title: cloud.title, description: cloud.description });
}

async function pushLocalToCloud(
  local: Case,
  cloudCaseId: ID,
  deps: SyncDeps,
  uploadFile: (url: string, file: File) => Promise<void>,
  record: SyncRecord,
  isFirstPush = false,
): Promise<SyncOutcome> {
  const filesSkipped: string[] = [];
  const documents: Record<string, ID> = { ...record.documents };

  try {
    if (!isFirstPush) {
      const updated = await deps.backend.updateCase({ caseId: cloudCaseId, title: local.title, description: local.description });
      if (updated.status !== "available") {
        return { status: "failed", message: "Could not update your saved copy. Local data is untouched — try again.", retryable: true, failedAtStep: "update-case" };
      }
    }

    for (const doc of local.documentUploads ?? []) {
      if (documents[doc.id]) continue;
      const meta = await deps.backend.createDocumentMetadata({
        caseId: cloudCaseId,
        displayName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
      });
      if (meta.status !== "available") {
        return { status: "failed", message: `Could not save evidence "${doc.fileName}". Local data is untouched — try again.`, retryable: true, failedAtStep: "save-document" };
      }
      documents[doc.id] = meta.data.documentId;
      if (doc.file) {
        const perm = await deps.backend.createUploadPermission({ caseId: cloudCaseId, documentId: meta.data.documentId });
        if (perm.status !== "available") {
          return { status: "failed", message: `Could not upload "${doc.fileName}". Its record was saved; the file can be retried. Local data is untouched.`, retryable: true, failedAtStep: "upload-file" };
        }
        await uploadFile(perm.data.uploadUrl, doc.file);
      } else {
        filesSkipped.push(doc.fileName);
      }
    }

    await deps.backend.recordAuditEvent({ caseId: cloudCaseId, category: "case_synced" });

    const freshLocal = await caseEngine.getCase(local.id);
    const freshCloud = await deps.backend.readCase({ caseId: cloudCaseId });
    persistRecord({
      localId: local.id,
      cloudCaseId,
      localUpdatedAt: freshLocal?.updatedAt ?? local.updatedAt,
      cloudUpdatedAt: freshCloud.status === "available" ? freshCloud.data.updatedAt : new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      documents,
      filesSkipped,
    });
    return {
      status: "synced",
      message: filesSkipped.length > 0
        ? `Saved to your account. ${filesSkipped.length} file(s) had no data left on this device, so only their records were saved — nothing was fabricated.`
        : "Saved to your account. Your saved copy is now the source of truth for this case.",
      retryable: false,
      filesSkipped,
    };
  } catch (e) {
    return {
      status: "failed",
      message: e instanceof Error ? `${e.message} Local data is untouched — try again.` : "Saving failed partway. Local data is untouched — try again.",
      retryable: true,
      failedAtStep: "exception",
    };
  }
}
