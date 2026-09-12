/**
 * DocumentProcessor — abstraction for upload → extraction → classification.
 * For Prompt 1: interfaces + safe mock, with validation.
 */

import type { DocumentRef, DocumentExtraction, ID } from "@/types/domain";

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface DocumentUploadInput {
  caseId: ID;
  file: File;
}

export interface IDocumentProcessor {
  validate(file: File): { ok: boolean; error?: string };
  upload(input: DocumentUploadInput): Promise<DocumentRef>;
  extract(documentId: ID): Promise<DocumentExtraction>;
  classify(extraction: DocumentExtraction): DocumentExtraction["documentKind"];
}

class MockDocumentProcessor implements IDocumentProcessor {
  private store = new Map<ID, DocumentRef>();

  validate(file: File): { ok: boolean; error?: string } {
    if (!ALLOWED_MIME.has(file.type)) {
      return { ok: false, error: `File type not supported: ${file.type}. Please upload PDF, JPG, PNG, or WebP.` };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { ok: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` };
    }
    if (file.size === 0) return { ok: false, error: "File is empty." };
    return { ok: true };
  }

  async upload(input: DocumentUploadInput): Promise<DocumentRef> {
    const v = this.validate(input.file);
    if (!v.ok) throw new Error(v.error);

    const id = `doc_${Math.random().toString(36).slice(2, 9)}`;
    const doc: DocumentRef = {
      id,
      caseId: input.caseId,
      fileName: input.file.name,
      fileSizeBytes: input.file.size,
      mimeType: input.file.type || "application/octet-stream",
      kind: null,
      status: "processing",
      uploadedAt: new Date().toISOString(),
      extraction: null,
    };
    this.store.set(id, doc);

    // Simulate async extraction (mock)
    setTimeout(() => this.runMockExtraction(id), 800);
    return doc;
  }

  private runMockExtraction(id: ID) {
    const doc = this.store.get(id);
    if (!doc) return;
    const mockExtraction: DocumentExtraction = {
      documentKind: "other",
      whoSentIt: undefined,
      whatTheyClaim: "[DEMO EXTRACTION — NOT VERIFIED] Mock extraction shows structure. Real extraction will use OCR + LLM.",
      amountMentioned: null,
      datesMentioned: [],
      deadlinesMentioned: [],
      requestedAction: undefined,
      riskFlags: [],
      confidence: 0.0,
      extractedAt: new Date().toISOString(),
      isMock: true,
    };
    const updated: DocumentRef = {
      ...doc,
      status: "extracted",
      kind: mockExtraction.documentKind,
      extraction: mockExtraction,
    };
    this.store.set(id, updated);
  }

  async extract(documentId: ID): Promise<DocumentExtraction> {
    const doc = this.store.get(documentId);
    if (!doc) throw new Error("Document not found");
    if (doc.extraction) return doc.extraction;
    // fallback mock
    return {
      documentKind: "other",
      whoSentIt: undefined,
      whatTheyClaim: "[DEMO] No extraction available yet.",
      amountMentioned: null,
      datesMentioned: [],
      deadlinesMentioned: [],
      riskFlags: [],
      confidence: 0,
      extractedAt: new Date().toISOString(),
      isMock: true,
    };
  }

  classify(extraction: DocumentExtraction): DocumentExtraction["documentKind"] {
    return extraction.documentKind;
  }

  // For UI polling
  getDoc(id: ID): DocumentRef | undefined {
    return this.store.get(id);
  }
}

export const documentProcessor: IDocumentProcessor & { getDoc(id: ID): DocumentRef | undefined } =
  new MockDocumentProcessor() as never;
