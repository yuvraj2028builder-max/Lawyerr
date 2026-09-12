/**
 * Document Lifecycle — explicit state machine.
 * Transitions: selected → uploaded → processing → processed
 * Failure: failed, needs_review
 * Never marks processed if no readable text, classification failed, extraction failed.
 */

import type { DocumentProcessingStatus } from "@/types/domain";

export type LifecycleEvent =
  | "select"
  | "upload"
  | "start_processing"
  | "processing_success"
  | "processing_failed"
  | "needs_review"
  | "retry"
  | "confirm"
  | "remove";

const VALID_TRANSITIONS: Record<DocumentProcessingStatus, DocumentProcessingStatus[]> = {
  selected: ["uploaded", "failed"],
  uploaded: ["processing", "failed"],
  processing: ["processed", "failed", "needs_review"],
  processed: ["processing", "failed"], // allow retry from processed if needed
  failed: ["processing", "uploaded", "failed"], // retry path
  needs_review: ["processing", "processed", "failed"], // retry or confirm
};

export function canTransition(from: DocumentProcessingStatus, to: DocumentProcessingStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getNextStatusOnSuccess(hasReadableText: boolean, hasFacts: boolean): DocumentProcessingStatus {
  if (!hasReadableText) return "failed";
  if (!hasFacts) return "needs_review"; // we read but couldn't extract structured facts
  return "processed";
}

export function getNextStatusOnFailure(): DocumentProcessingStatus {
  return "failed";
}

export class DocumentLifecycleService {
  validateTransition(from: DocumentProcessingStatus, to: DocumentProcessingStatus): { valid: boolean; error?: string } {
    if (canTransition(from, to)) return { valid: true };
    return {
      valid: false,
      error: `Invalid transition: ${from} → ${to}. Allowed: ${VALID_TRANSITIONS[from]?.join(", ") ?? "none"}`,
    };
  }

  assertTransition(from: DocumentProcessingStatus, to: DocumentProcessingStatus): void {
    const res = this.validateTransition(from, to);
    if (!res.valid) throw new Error(res.error);
  }

  // Descriptions for UI
  getStatusDescription(status: DocumentProcessingStatus): string {
    switch (status) {
      case "selected": return "File selected — ready to upload";
      case "uploaded": return "File saved — ready to read";
      case "processing": return "Reading document — extracting text and details";
      case "processed": return "Document successfully read — details available for review";
      case "failed": return "Reading failed — document saved as evidence, details need manual entry";
      case "needs_review": return "Document read but details need confirmation — please review extracted information";
      default: return status;
    }
  }

  getStatusDistinction(status: DocumentProcessingStatus): { fileSaved: boolean; documentRead: boolean; factsConfirmed: boolean } {
    return {
      fileSaved: ["uploaded", "processing", "processed", "failed", "needs_review"].includes(status),
      documentRead: status === "processed",
      factsConfirmed: false, // facts confirmed is separate from processing status — requires user confirmation
    };
  }

  // Check if retry is allowed
  canRetry(status: DocumentProcessingStatus | { processingStatus: DocumentProcessingStatus }): boolean {
    const s = typeof status === "string" ? status : status.processingStatus;
    return ["failed", "needs_review", "processed", "uploaded"].includes(s);
  }

  canMarkProcessed(doc: { extractedText?: string; extractedFacts?: unknown[]; processingStatus?: DocumentProcessingStatus }): boolean {
    if (!doc.extractedText || doc.extractedText.trim().length < 5) return false;
    if (!doc.extractedFacts || (doc.extractedFacts as unknown[]).length === 0) return false;
    return true;
  }

  // Timeline event mapping
  getTimelineEventType(status: DocumentProcessingStatus): string {
    switch (status) {
      case "uploaded": return "document_added";
      case "processing": return "document_processing_started";
      case "processed": return "document_processed";
      case "failed": return "document_processing_failed";
      case "needs_review": return "document_processed"; // still considered processed with warning
      default: return "document_added";
    }
  }
}

export const documentLifecycleService = new DocumentLifecycleService();
