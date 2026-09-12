/**
 * DocumentUploadService — real browser file-selection abstraction.
 * Supports PDF, PNG, JPG/JPEG, WEBP with safety validation.
 * Storage: browser_local (IndexedDB) with memory_only fallback; cloud is not_configured.
 * Does not store sensitive documents in URLs, does not expose bytes in analytics.
 */

import type { DocumentUpload, EvidenceType, ID } from "@/types/domain";
import { caseEngine } from "@/services/caseEngine.service";
import { timelineService } from "@/services/timeline.service";
import { documentStorageService, cloudDocumentStorage } from "@/services/document/documentStorage.service";
import { imagePreprocessingService } from "@/services/document/imagePreprocessing.service";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB configurable
export const ALLOWED_MIMES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
export const ALLOWED_EXTS = new Set<string>([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

function genId(): string {
  return `doc_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

const EXECUTABLE_EXTENSIONS = new Set([".exe", ".com", ".bat", ".cmd", ".msi", ".sh", ".ps1", ".js", ".jar", ".scr"]);
const MAX_FILENAME_LENGTH = 120;

export function sanitizeDisplayFileName(name: string): string {
  const withoutControls = Array.from(name, (char) => char.charCodeAt(0) < 32 ? "_" : char).join("");
  return withoutControls.replace(/[\\/]/g, "_").replace(/[<>]/g, "_").replace(/\s+/g, " ").trim().slice(0, MAX_FILENAME_LENGTH) || "document";
}

export function isSuspiciousDoubleExtension(name: string): boolean {
  const parts = sanitizeDisplayFileName(name).toLowerCase().split(".").filter(Boolean);
  return parts.length > 1 && EXECUTABLE_EXTENSIONS.has(`.${parts[parts.length - 2]}`);
}

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

export class DocumentUploadService {
  validateFile(file: File): ValidateResult {
    if (!file) return { ok: false, error: "No file selected." };
    if (file.name !== sanitizeDisplayFileName(file.name) || file.name.includes("..") || /[<>]/.test(file.name)) {
      return { ok: false, error: "Filename contains unsafe path, control, or markup characters." };
    }
    if (file.size === 0) return { ok: false, error: "File is empty (0 bytes)." };
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.` };
    }
    if (!ALLOWED_MIMES.has(file.type.toLowerCase())) {
      // Also check extension as fallback (some browsers may give empty type)
      const ext = getExtension(file.name);
      if (!ALLOWED_EXTS.has(ext)) {
        return { ok: false, error: `Unsupported file type: ${file.type || ext || "unknown"}. Use PDF, PNG, JPG/JPEG, or WEBP.` };
      }
    }
    const ext = getExtension(file.name);
    if (ext && !ALLOWED_EXTS.has(ext)) {
      return { ok: false, error: `Unsupported file extension: ${ext}. Use .pdf, .png, .jpg, .webp` };
    }
    // Reject obviously executable
    if (EXECUTABLE_EXTENSIONS.has(ext) || isSuspiciousDoubleExtension(file.name) || file.type.includes("executable")) {
      return { ok: false, error: "Executable files are not allowed." };
    }
    return { ok: true };
  }

  async uploadDocument(caseId: ID, file: File, evidenceType: EvidenceType = "other"): Promise<DocumentUpload> {
    const validation = this.validateFile(file);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    // Lightweight image validation (does not modify file)
    if (file.type.startsWith("image/")) {
      const validationRes = await imagePreprocessingService.validateImage(file);
      if (!validationRes.ok) {
        throw new Error(validationRes.error);
      }
    }

    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found: ${caseId}`);

    const now = new Date().toISOString();
    const tier = documentStorageService.getPersistence();
    const storageNote =
      tier === "browser_local"
        ? "Stored locally in this browser (IndexedDB) — not cloud-persisted. File bytes may not survive refresh in all environments."
        : tier === "cloud"
          ? "Cloud storage (not configured in this demo)"
          : "local/demo storage — memory only, will be lost on refresh";
    const doc: DocumentUpload = {
      id: genId(),
      caseId,
      fileName: sanitizeDisplayFileName(file.name),
      sanitizedFileName: sanitizeDisplayFileName(file.name),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      uploadedAt: now,
      evidenceType,
      storageStatus: "stored",
      processingStatus: "uploaded",
      file,
      storageNote,
      storageTier: tier,
      deletionStatus: "active",
      retentionStatus: "not_configured",
    };

    // Persist via storage provider (honest tier distinction)
    try {
      await documentStorageService.save(doc);
    } catch {
      // Even if storage fails, keep in-memory via caseEngine
    }

    const existing = kase.documentUploads ?? [];
    await caseEngine.updateCase(caseId, { documentUploads: [...existing, doc] });

    await timelineService.addEvent({
      caseId,
      type: "document_added",
      title: "Document added",
      description: `${evidenceType} • ${file.type} • ${(file.size / 1024).toFixed(1)} KB • ${tier}`,
      source: "system",
      metadata: { documentId: doc.id, mimeType: file.type, sizeBytes: file.size, storageTier: tier },
    });

    // Also add processing_started event immediately (distinct from processing in documentProcessingService)
    await timelineService.addEvent({
      caseId,
      type: "document_processing_started",
      title: "Document processing started",
      source: "system",
      metadata: { documentId: doc.id },
    });

    return doc;
  }

  async getUploads(caseId: ID): Promise<DocumentUpload[]> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) return [];
    return kase.documentUploads ?? [];
  }

  async getUpload(caseId: ID, documentId: ID): Promise<DocumentUpload | null> {
    const uploads = await this.getUploads(caseId);
    return uploads.find((d) => d.id === documentId) ?? null;
  }

  async removeUpload(caseId: ID, documentId: ID): Promise<void> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found`);
    const doc = (kase.documentUploads ?? []).find((d) => d.id === documentId);
    if (!doc) return;
    const remaining = (kase.documentUploads ?? []).filter((d) => d.id !== documentId);
    await caseEngine.updateCase(caseId, { documentUploads: remaining });

    // Also remove from storage provider
    try {
      await documentStorageService.remove(documentId);
    } catch {
      // ignore
    }

    // Do not silently delete unrelated case facts — only remove evidence linked to this doc if user confirms
    // For now, keep confirmed facts (user must explicitly choose); just remove document record

    await timelineService.addEvent({
      caseId,
      type: "document_removed",
      title: "Document removed locally",
      description: "Cloud deletion was not requested because private cloud storage is not configured.",
      source: "system",
      metadata: { documentId, deletionStatus: "completed", retentionStatus: "not_configured" },
    });

    // Clear temporary extracted text where practical (file bytes already removed with doc)
  }

  /** Returns honest storage tier for UI */
  getStorageTier(): string {
    try {
      return documentStorageService.getPersistence();
    } catch {
      return "memory_only";
    }
  }

  /** Cloud storage status — always not_configured unless backend exists */
  getCloudStatus(): { status: string; missing: string[]; reason?: string } {
    const cfg = cloudDocumentStorage.getConfig();
    return {
      status: cfg.status,
      missing: cfg.missing ?? [],
      reason: cfg.reason,
    };
  }

  async updateUpload(caseId: ID, documentId: ID, patch: Partial<DocumentUpload>): Promise<DocumentUpload> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found`);
    const uploads = kase.documentUploads ?? [];
    const idx = uploads.findIndex((d) => d.id === documentId);
    if (idx === -1) throw new Error(`Document not found: ${documentId}`);
    const updated = { ...uploads[idx], ...patch };
    const next = [...uploads];
    next[idx] = updated;
    await caseEngine.updateCase(caseId, { documentUploads: next });
    return updated;
  }
}

export const documentUploadService = new DocumentUploadService();
