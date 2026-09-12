/** Future backend API contracts. These types do not make network calls. */
import type { Case, CaseTimelineEvent, ID } from "@/types/domain";
import type { ApiResult, CreateUploadRequest, DeleteDocumentRequest, DownloadPermission, PrivateDocumentMetadata, UploadPermission } from "@/services/document/privateDocument.contract";

export interface BackendApiContracts {
  currentUser(): Promise<ApiResult<{ id: ID; displayName?: string }>>;
  createCase(input: { userId: ID; description: string; title?: string }): Promise<ApiResult<Case>>;
  getCase(input: { userId: ID; caseId: ID }): Promise<ApiResult<Case>>;
  listCases(input: { userId: ID }): Promise<ApiResult<Case[]>>;
  createDocumentUpload(input: CreateUploadRequest): Promise<ApiResult<UploadPermission>>;
  completeDocumentUpload(input: { userId: ID; caseId: ID; documentId: ID }): Promise<ApiResult<PrivateDocumentMetadata>>;
  getDocumentMetadata(input: { userId: ID; caseId: ID; documentId: ID }): Promise<ApiResult<PrivateDocumentMetadata>>;
  createSignedDownload(input: { userId: ID; caseId: ID; documentId: ID }): Promise<ApiResult<DownloadPermission>>;
  deleteDocument(input: DeleteDocumentRequest): Promise<ApiResult<{ documentId: ID; deletionStatus: "requested" }>>;
  createAuditEvent(input: { userId: ID; caseId: ID; category: string }): Promise<ApiResult<{ eventId: ID }>>;
  getCaseTimeline(input: { userId: ID; caseId: ID }): Promise<ApiResult<CaseTimelineEvent[]>>;
}
