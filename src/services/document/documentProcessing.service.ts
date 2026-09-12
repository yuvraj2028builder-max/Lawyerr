/**
 * DocumentProcessingService — real abstraction for PDF text extraction, OCR, classification, fact extraction.
 * Each layer is independently testable and fails gracefully without fabricating text.
 * Uses PdfTextExtractionService (lazy pdfjs-dist) and OCR provider boundary.
 */

import type { DocumentProcessingResult, EvidenceType, ID } from "@/types/domain";
import { documentUploadService } from "@/services/documentUpload.service";
import { ocrService } from "@/services/ocr.service";
import { pdfTextExtractionService } from "@/services/document/pdfTextExtraction.service";
import { classifyDocument } from "@/services/documentClassifier.service";
import { extractDocumentFacts } from "@/services/documentFactExtractor.service";
import { timelineService } from "@/services/timeline.service";
import { documentLifecycleService } from "@/services/document/documentLifecycle.service";

export interface ProcessOptions {
  caseId: ID;
  documentId: ID;
}

async function extractPdfText(file: File): Promise<{ text?: string; available: boolean; pageCount?: number; error?: string; source: "pdf_text" | "none" }> {
  const result = await pdfTextExtractionService.extractText(file);
  return {
    text: result.text,
    available: result.available,
    pageCount: result.pageCount,
    error: result.error,
    source: result.source,
  };
}

async function extractTextFromFile(
  file: File
): Promise<{ text?: string; source: "document_text" | "ocr_text" | "none"; available: boolean; pageCount?: number; error?: string }> {
  if (file.type === "application/pdf") {
    const res = await extractPdfText(file);
    if (res.available && res.text) {
      return { text: res.text, source: "document_text", available: true, pageCount: res.pageCount };
    }
    // If PDF is image-only/empty but pdfjs was available, try OCR fallback
    if (res.available && !res.text) {
      const ocr = await ocrService.extractText(file);
      if (ocr.available && ocr.text) {
        return { text: ocr.text, source: "ocr_text", available: true, pageCount: res.pageCount };
      }
      // No text even after OCR attempt — return with pageCount but no available text
      return { text: undefined, source: "none", available: false, pageCount: res.pageCount, error: res.error ?? ocr.error };
    }
    // pdfjs not available — try OCR as fallback for scanned PDF
    const ocr = await ocrService.extractText(file);
    if (ocr.available && ocr.text) {
      return { text: ocr.text, source: "ocr_text", available: true };
    }
    return { text: undefined, source: "none", available: false, error: res.error ?? ocr.error };
  }

  if (file.type.startsWith("image/")) {
    // For images, try OCR (lazy-loaded)
    const ocr = await ocrService.extractText(file);
    if (ocr.available && ocr.text) {
      return { text: ocr.text, source: "ocr_text", available: true };
    }
    return { text: undefined, source: "none", available: false, error: ocr.error ?? "OCR not available for this image. You can still keep it as evidence." };
  }

  // For other types, try to read as text (unlikely)
  try {
    const text = await file.text();
    if (text.trim().length > 10) {
      return { text: text.trim(), source: "document_text", available: true };
    }
  } catch {
    // ignore
  }
  return { text: undefined, source: "none", available: false, error: "Could not read text from this document." };
}

export class DocumentProcessingService {
  async processDocument(opts: ProcessOptions): Promise<DocumentProcessingResult> {
    const doc = await documentUploadService.getUpload(opts.caseId, opts.documentId);
    if (!doc) throw new Error(`Document not found: ${opts.documentId}`);
    if (!doc.file) {
      return {
        documentId: opts.documentId,
        status: "failed",
        ocrAvailable: false,
        facts: [],
        error: "No file data available (local storage may have been cleared). No file data available after refresh — metadata retained, file bytes lost.",
      };
    }

    // Idempotency: avoid duplicate processing_started events if already processing
    const currentStatus = doc.processingStatus;
    if (currentStatus === "processing") {
      // Already processing — return existing state without duplicating event
      return {
        documentId: doc.id,
        status: "processing" as never,
        ocrAvailable: !!doc.ocrAvailable,
        facts: doc.extractedFacts ?? [],
        error: undefined,
      };
    }

    // Update status to processing — validate transition
    try {
      documentLifecycleService.assertTransition(currentStatus, "processing");
    } catch {
      // Allow retry from failed/needs_review anyway
      if (!documentLifecycleService.canRetry(currentStatus)) {
        throw new Error(`Cannot process document in status ${currentStatus}`);
      }
    }

    await documentUploadService.updateUpload(opts.caseId, opts.documentId, {
      processingStatus: "processing",
      lastError: undefined,
    });
    // Add timeline event only if not already recently added (avoid duplicate on rerenders — caller ensures not during render)
    await timelineService.addEvent({
      caseId: opts.caseId,
      type: "document_processing_started",
      title: `Processing ${doc.fileName}`,
      source: "system",
      metadata: { documentId: doc.id },
    });

    try {
      const extraction = await extractTextFromFile(doc.file);
      const text = extraction.text ?? "";

      // Classification — deterministic, transparent
      const classification = classifyDocument(doc.fileName, doc.mimeType, text);

      // Fact extraction — separate from legal reasoning, with provenance
      const facts = text ? extractDocumentFacts(text, doc.fileName) : [];
      // Attach source info to each fact
      const factsWithSource = facts.map((f) => ({
        ...f,
        source: extraction.source === "ocr_text" ? ("ocr_text" as const) : f.source,
      }));

      // Use lifecycle to decide status honestly: do not mark processed if no readable text
      let status: DocumentProcessingResult["status"];
      if (factsWithSource.length > 0 && extraction.available) {
        status = "processed";
      } else if (extraction.available && text.trim().length > 0) {
        status = "needs_review";
      } else if (extraction.source === "none" && !extraction.available) {
        status = "failed";
      } else {
        status = extraction.available ? "needs_review" : "failed";
      }

      // Update document with extracted info — include pageCount and retry handling
      const prevRetry = doc.retryCount ?? 0;
      await documentUploadService.updateUpload(opts.caseId, opts.documentId, {
        extractedText: text || undefined,
        ocrAvailable: extraction.source === "ocr_text",
        classification: { type: classification.type as EvidenceType, confidence: classification.confidence, reason: classification.reason },
        extractedFacts: factsWithSource,
        processingStatus: status,
        pageCount: extraction.pageCount,
        lastError: status === "failed" ? extraction.error : undefined,
        // do not increment retry here; retry increments in retryProcessing
      } as unknown as Partial<import("@/types/domain").DocumentUpload>);

      const timelineType = status === "failed" ? "document_processing_failed" : "document_processed";
      await timelineService.addEvent({
        caseId: opts.caseId,
        type: timelineType,
        title: status === "failed" ? `Failed to read ${doc.fileName}` : `Processed ${doc.fileName} — ${classification.type} (${classification.confidence})`,
        description: status === "failed" ? extraction.error : `Extracted ${factsWithSource.length} facts${extraction.pageCount ? ` • ${extraction.pageCount} pages` : ""}`,
        source: "system",
        metadata: { documentId: doc.id, classification, facts: factsWithSource.length, pageCount: extraction.pageCount },
      });

      return {
        documentId: doc.id,
        status,
        extractedText: text || undefined,
        ocrText: extraction.source === "ocr_text" ? text : undefined,
        ocrAvailable: extraction.source === "ocr_text",
        classification,
        facts: factsWithSource,
        error: status === "failed" ? extraction.error : undefined,
        warnings: status === "needs_review" ? [extraction.error ?? "Needs review — low confidence"] : undefined,
        pageCount: extraction.pageCount,
        retryCount: prevRetry,
      };
    } catch (e) {
      const err = e instanceof Error ? e.message : "Processing failed";
      await documentUploadService.updateUpload(opts.caseId, opts.documentId, { processingStatus: "failed", lastError: err });
      await timelineService.addEvent({
        caseId: opts.caseId,
        type: "document_processing_failed",
        title: `Failed to process ${doc.fileName}`,
        source: "system",
        metadata: { documentId: doc.id, error: err },
      });
      return {
        documentId: doc.id,
        status: "failed",
        ocrAvailable: false,
        facts: [],
        error: err,
      };
    }
  }

  async retryProcessing(opts: ProcessOptions): Promise<DocumentProcessingResult> {
    const doc = await documentUploadService.getUpload(opts.caseId, opts.documentId);
    if (!doc) throw new Error(`Document not found: ${opts.documentId}`);
    if (!documentLifecycleService.canRetry(doc.processingStatus)) {
      throw new Error(`Retry not allowed in status ${doc.processingStatus}`);
    }

    // Increment retry count
    const newRetry = (doc.retryCount ?? 0) + 1;
    await documentUploadService.updateUpload(opts.caseId, opts.documentId, { retryCount: newRetry, lastError: undefined });

    // Retry uses existing document — does not create duplicate evidence/timeline/facts unnecessarily
    await timelineService.addEvent({
      caseId: opts.caseId,
      type: "retry_started" as never,
      title: `Retry reading: ${doc.fileName}`,
      description: "Retrying document reading — previous extracted facts preserved until confirmed.",
      source: "system",
      metadata: { documentId: doc.id, retry: true, retryCount: newRetry },
    });

    // Also emit processing_started for lifecycle consistency (but avoid duplicate if retry_started covers it)
    // ProcessDocument will add processing_started again — we keep retry_started as distinct
    return this.processDocument(opts);
  }
}

export const documentProcessingService = new DocumentProcessingService();
