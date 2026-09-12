/**
 * Prompt 13 — Secure backend foundation: shared backend types.
 *
 * Every private record carries an owner/user identifier at the backend
 * contract level. No document bytes, document text, Aadhaar, PAN,
 * passwords, API keys, or credentials belong in analytics payloads.
 */
import type { ID, ISODateString } from "@/types/domain";

/** Explicit per-method backend statuses. Never throw for expected states. */
export type BackendStatus =
  | "available"
  | "unavailable"
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "failed";

export type BackendResult<T> =
  | { status: "available"; data: T }
  | { status: Exclude<BackendStatus, "available">; error: string };

export function backendOk<T>(data: T): BackendResult<T> {
  return { status: "available", data };
}

export function backendErr<T>(status: Exclude<BackendStatus, "available">, error: string): BackendResult<T> {
  return { status, error };
}

export function isBackendOk<T>(r: BackendResult<T>): r is { status: "available"; data: T } {
  return r.status === "available";
}

// ─── Identity ───────────────────────────────────────────────────────────────

export interface BackendUser {
  id: ID;
  displayName?: string;
}

export interface BackendSession {
  /** null user = no authenticated session. Never a fake user. */
  user: BackendUser | null;
  /** True only when a real provider verified the session and it is unexpired. */
  authenticated: boolean;
  /** True when the session is past expiry — must be treated as unauthorized. */
  expired: boolean;
  expiresAt?: ISODateString;
}

// ─── Database model contracts (backend-owned, owner-scoped) ─────────────────
// Every private record includes ownerId / userId. Document bytes and
// document text are NEVER part of these metadata contracts.

export interface DbUserProfile {
  userId: ID;
  displayName?: string;
  languagePreference?: "en" | "hi";
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DbCase {
  caseId: ID;
  ownerId: ID;
  title: string;
  description: string;
  status: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DbCaseMember {
  caseId: ID;
  userId: ID;
  role: "owner" | "viewer";
  addedAt: ISODateString;
}

export interface DbDocumentMetadata {
  documentId: ID;
  caseId: ID;
  ownerId: ID;
  /** Safe display-only name. Never a storage path. */
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  /** Opaque server-generated object key. Never filename-derived. */
  objectKey: string;
  uploadedAt: ISODateString;
  processingStatus: string;
}

export interface DbExtractedFact {
  factId: ID;
  caseId: ID;
  ownerId: ID;
  documentId: ID;
  field: string;
  value: string;
  rawText: string;
  source: string;
  confidence: "high" | "medium" | "low";
  createdAt: ISODateString;
}

export interface DbConfirmedFact {
  factId: ID;
  caseId: ID;
  ownerId: ID;
  documentId?: ID;
  field: string;
  value: string;
  confirmedByUser: true;
  confirmedAt: ISODateString;
}

export interface DbActionPlan {
  planId: ID;
  caseId: ID;
  ownerId: ID;
  planVersion: number;
  summary: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DbActionItem {
  itemId: ID;
  planId: ID;
  caseId: ID;
  ownerId: ID;
  title: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  updatedAt: ISODateString;
}

export interface DbAuditEvent {
  eventId: ID;
  caseId: ID;
  ownerId: ID;
  /** Content-free category only — never document text or PII. */
  category: string;
  createdAt: ISODateString;
}

export interface DbAiProposal {
  proposalId: ID;
  caseId: ID;
  ownerId: ID;
  kind: string;
  /** Grounded proposal summary. Provider calls stay disabled until configured. */
  summary: string;
  createdAt: ISODateString;
}
