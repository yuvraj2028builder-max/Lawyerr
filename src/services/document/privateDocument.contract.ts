/** Server-only contract shapes; this browser client has no implementation. */
import type { ID } from "@/types/domain";

export type ApiErrorCode = "unauthenticated" | "unauthorized" | "not_found" | "validation_failed" | "provider_unavailable" | "not_configured" | "rate_limited" | "unknown";
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: ApiErrorCode; message: string } };
export interface PrivateDocumentMetadata { documentId: ID; caseId: ID; ownerId: ID; displayName: string; mimeType: string; sizeBytes: number; contentHash?: string; uploadedAt: string; processingStatus: string; deletionStatus: "active" | "requested" | "completed" | "failed" | "metadata_only"; }
export interface CreateUploadRequest { userId: ID; caseId: ID; documentId: ID; displayName: string; mimeType: string; sizeBytes: number; }
export interface UploadPermission { uploadUrl: string; expiresAt: string; method: "PUT"; documentId: ID; }
export interface DownloadPermission { downloadUrl: string; expiresAt: string; documentId: ID; }
export interface DeleteDocumentRequest { userId: ID; caseId: ID; documentId: ID; reason?: string; }

export interface PrivateDocumentApi {
  createUploadRequest(input: CreateUploadRequest): Promise<ApiResult<UploadPermission>>;
  completeUpload(input: { userId: ID; caseId: ID; documentId: ID }): Promise<ApiResult<PrivateDocumentMetadata>>;
  getPrivateDocument(input: { userId: ID; caseId: ID; documentId: ID }): Promise<ApiResult<PrivateDocumentMetadata>>;
  createSignedDownload(input: { userId: ID; caseId: ID; documentId: ID }): Promise<ApiResult<DownloadPermission>>;
  removePrivateDocument(input: DeleteDocumentRequest): Promise<ApiResult<{ documentId: ID; deletionStatus: "requested" }>>;
}

/** No URLs are generated: a normal URL is never presented as a signed URL. */
export class NotConfiguredPrivateDocumentApi implements PrivateDocumentApi {
  private unavailable<T>(): ApiResult<T> { return { ok: false, error: { code: "not_configured", message: "Private cloud storage requires an authenticated backend, ownership checks, and a private bucket. It is not configured." } }; }
  async createUploadRequest(_input: CreateUploadRequest) { return this.unavailable<UploadPermission>(); }
  async completeUpload(_input: { userId: ID; caseId: ID; documentId: ID }) { return this.unavailable<PrivateDocumentMetadata>(); }
  async getPrivateDocument(_input: { userId: ID; caseId: ID; documentId: ID }) { return this.unavailable<PrivateDocumentMetadata>(); }
  async createSignedDownload(_input: { userId: ID; caseId: ID; documentId: ID }) { return this.unavailable<DownloadPermission>(); }
  async removePrivateDocument(_input: DeleteDocumentRequest) { return this.unavailable<{ documentId: ID; deletionStatus: "requested" }>(); }
}

/** Server-generated only. It contains opaque IDs, never names, email, or filename. */
export function serverStorageKey(caseId: ID, documentId: ID): string { return `cases/${caseId}/documents/${documentId}`; }
export const privateDocumentApi: PrivateDocumentApi = new NotConfiguredPrivateDocumentApi();
