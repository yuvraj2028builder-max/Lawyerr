/**
 * MemoryDocumentStorage — fallback when IndexedDB unavailable.
 * In-memory Map, lost on refresh. Honest about limitations.
 */
import type { DocumentUpload, ID } from "@/types/domain";

export interface StoredDocument {
  document: DocumentUpload;
  storageTier: "memory_only" | "browser_local" | "cloud";
  persistedAt: string;
  note: string;
}

export class MemoryDocumentStorage {
  private store = new Map<string, StoredDocument>();

  async save(doc: DocumentUpload): Promise<StoredDocument> {
    const stored: StoredDocument = {
      document: { ...doc },
      storageTier: "memory_only",
      persistedAt: new Date().toISOString(),
      note: "Stored in memory only — will be lost on refresh. Not cloud-persisted.",
    };
    this.store.set(doc.id, stored);
    return stored;
  }

  async get(documentId: ID): Promise<StoredDocument | null> {
    return this.store.get(documentId) ?? null;
  }

  async remove(documentId: ID): Promise<void> {
    this.store.delete(documentId);
  }

  async listForCase(caseId: ID): Promise<StoredDocument[]> {
    return Array.from(this.store.values()).filter((s) => s.document.caseId === caseId);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  getStatus(): { tier: "memory_only"; available: boolean; message: string } {
    return {
      tier: "memory_only",
      available: true,
      message: "Memory-only storage — data lost on refresh. Not cloud-persisted.",
    };
  }
}
