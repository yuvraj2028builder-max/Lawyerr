/**
 * Prompt 13 — Typed backend provider boundary.
 *
 * Covers: health/status, authenticated session lookup, user identity,
 * case create/read/update/delete, case ownership checks, document metadata
 * create/read/delete, private upload permission, signed download permission,
 * and audit events. Every method returns an explicit BackendStatus.
 *
 * Gemini is NOT activated here — AI proposal storage is owner-scoped
 * metadata only, with no live provider calls.
 */
import type { ID } from "@/types/domain";
import type {
  BackendResult,
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
} from "./backendTypes";

export interface HealthStatus {
  backend: "available" | "unavailable" | "not_configured";
  auth: "available" | "unavailable" | "not_configured";
  storage: "available" | "unavailable" | "not_configured";
  aiProvider: "unavailable" | "not_configured";
  message: string;
}

export interface UploadPermission {
  /** Short-lived, single-use upload URL issued server-side. Never in local demo. */
  uploadUrl: string;
  expiresAt: string;
  documentId: ID;
}

export interface SignedDownload {
  /** Short-lived signed URL. Never permanent, never public. */
  downloadUrl: string;
  expiresAt: string;
  documentId: ID;
}

export interface BackendProvider {
  // Health / status
  getHealth(): Promise<BackendResult<HealthStatus>>;
  // Session / identity
  getSession(): Promise<BackendResult<BackendSession>>;
  getUserIdentity(): Promise<BackendResult<BackendUser>>;
  // Cases
  createCase(input: { title: string; description: string }): Promise<BackendResult<DbCase>>;
  readCase(input: { caseId: ID }): Promise<BackendResult<DbCase>>;
  updateCase(input: { caseId: ID; title?: string; description?: string }): Promise<BackendResult<DbCase>>;
  deleteCase(input: { caseId: ID }): Promise<BackendResult<{ caseId: ID }>>;
  checkCaseOwnership(input: { caseId: ID }): Promise<BackendResult<DbCaseMember>>;
  // Document metadata
  createDocumentMetadata(input: {
    caseId: ID;
    displayName: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<BackendResult<DbDocumentMetadata>>;
  readDocumentMetadata(input: { caseId: ID; documentId: ID }): Promise<BackendResult<DbDocumentMetadata>>;
  deleteDocumentMetadata(input: { caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID }>>;
  // Private storage permissions (server-issued only)
  createUploadPermission(input: { caseId: ID; documentId: ID }): Promise<BackendResult<UploadPermission>>;
  createSignedDownload(input: { caseId: ID; documentId: ID }): Promise<BackendResult<SignedDownload>>;
  // Audit (content-free categories only)
  recordAuditEvent(input: { caseId: ID; category: string }): Promise<BackendResult<DbAuditEvent>>;
  listAuditEvents(input: { caseId: ID }): Promise<BackendResult<DbAuditEvent[]>>;
  // Owner-scoped reads used by future secure Gemini calls (no live calls here)
  readActionPlan(input: { caseId: ID }): Promise<BackendResult<DbActionPlan>>;
  readActionItems(input: { caseId: ID }): Promise<BackendResult<DbActionItem[]>>;
  readConfirmedFacts(input: { caseId: ID }): Promise<BackendResult<DbConfirmedFact[]>>;
  readExtractedFacts(input: { caseId: ID }): Promise<BackendResult<DbExtractedFact[]>>;
  readAiProposals(input: { caseId: ID }): Promise<BackendResult<DbAiProposal[]>>;
  readUserProfile(): Promise<BackendResult<DbUserProfile>>;
}
