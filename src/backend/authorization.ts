/**
 * Prompt 13 — Fail-closed authorization rules.
 *
 * Order of checks (never reorder to leak existence):
 *   1. backend unavailable  -> "unavailable"
 *   2. missing/expired session -> "unauthorized"
 *   3. missing record -> "not_found"
 *   4. wrong owner -> "forbidden"
 *   5. otherwise -> "available"
 *
 * Private metadata or bytes must only be returned AFTER "available".
 * Frontend checks remain UX hints only — backend/database rules are the
 * real security boundary.
 */
import type { ID } from "@/types/domain";
import type { BackendSession, BackendStatus } from "./backendTypes";

export const FRONTEND_AUTHZ_IS_UX_ONLY =
  "Frontend authorization checks are UX hints only. Backend and database ownership rules are the real security boundary.";

export interface OwnedRecord {
  ownerId: ID;
}

export interface AuthorizeInput {
  session: BackendSession | null;
  backendAvailable: boolean;
  record: OwnedRecord | null;
  recordExistsKnown?: boolean;
}

export function authorizeRecordAccess(input: AuthorizeInput): BackendStatus {
  if (!input.backendAvailable) return "unavailable";
  if (!input.session || !input.session.authenticated || input.session.expired || !input.session.user) {
    return "unauthorized";
  }
  // When the caller knows the record id is unknown, report not_found without
  // revealing anything else.
  if (input.record === null) return "not_found";
  if (input.record.ownerId !== input.session.user.id) return "forbidden";
  return "available";
}

export function authorizeCaseAccess(
  session: BackendSession | null,
  backendAvailable: boolean,
  kase: OwnedRecord | null,
): BackendStatus {
  return authorizeRecordAccess({ session, backendAvailable, record: kase });
}

export function authorizeDocumentAccess(
  session: BackendSession | null,
  backendAvailable: boolean,
  doc: OwnedRecord | null,
): BackendStatus {
  return authorizeRecordAccess({ session, backendAvailable, record: doc });
}

export function authorizeDeletion(
  session: BackendSession | null,
  backendAvailable: boolean,
  record: OwnedRecord | null,
): BackendStatus {
  return authorizeRecordAccess({ session, backendAvailable, record });
}

export function makeSession(userId: ID | null, opts?: { expired?: boolean }): BackendSession {
  if (!userId) return { user: null, authenticated: false, expired: false };
  return {
    user: { id: userId },
    authenticated: opts?.expired ? false : true,
    expired: opts?.expired ?? false,
  };
}

// ─── Prompt 14 — centralized ownership + route seams ────────────────────────
// The local InMemoryCaseEngine takes bare ids with no owner. These helpers
// are the single place future backend call-sites must use so identity is
// validated consistently instead of ad-hoc at a dozen call sites.

/** Opaque ids must be non-empty, bounded, and free of paths/whitespace. */
export function isWellFormedId(id: unknown): id is ID {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return false;
  if (trimmed !== id) return false;
  if (id.includes("..") || id.includes("/") || id.includes("\\") || /\s/.test(id)) return false;
  return true;
}

/** Pure owner comparison used before any record access. */
export function isRecordOwnedBy(record: OwnedRecord | null, ownerId: ID | null): boolean {
  if (!record || !ownerId || !isWellFormedId(ownerId)) return false;
  return record.ownerId === ownerId;
}

/**
 * Fail-closed ownership assertion returning an explicit BackendResult.
 * Prefer this over bare authorize* statuses when a call-site needs to
 * short-circuit before touching private data.
 */
export function requireOwnedRecord(
  session: BackendSession | null,
  backendAvailable: boolean,
  record: OwnedRecord | null,
): import("./backendTypes").BackendResult<{ ownerId: ID }> {
  const status = authorizeRecordAccess({ session, backendAvailable, record });
  if (status !== "available" || !record) {
    const messages: Record<string, string> = {
      unavailable: "Backend unavailable — cannot verify ownership.",
      unauthorized: "No authenticated session — access denied.",
      not_found: "Record not found.",
      forbidden: "Access denied — this record belongs to a different user.",
      failed: "Ownership check failed.",
    };
    return { status: status === "available" ? "failed" : status, error: messages[status] ?? "Access denied." };
  }
  return { status: "available", data: { ownerId: record.ownerId } };
}

export interface RouteAccessInput {
  requiresAuth: boolean;
  session: BackendSession | null;
  backendAvailable: boolean;
}

/**
 * Protected-route seam. No screen requires auth today because all data is
 * local-demo; when a future screen sets requiresAuth, a missing/expired
 * session or unavailable backend fails closed to "unauthorized"/"unavailable"
 * instead of rendering protected content.
 */
export function authorizeRouteAccess(input: RouteAccessInput): BackendStatus {
  if (!input.requiresAuth) return "available";
  if (!input.backendAvailable) return "unavailable";
  if (
    !input.session ||
    !input.session.authenticated ||
    input.session.expired ||
    !input.session.user ||
    !isWellFormedId(input.session.user.id)
  ) {
    return "unauthorized";
  }
  return "available";
}
