/**
 * DocumentStorageService — provider interface for document persistence.
 * Differentiates memory_only vs browser_local vs cloud honestly.
 * Never labels local as cloud; never stores bytes in URL/analytics.
 */
import type { DocumentUpload, ID } from "@/types/domain";
import { MemoryDocumentStorage, type StoredDocument } from "./memoryStorage";
import { IndexedDbDocumentStorage } from "./indexedDbStorage";

export type StorageTier = "memory_only" | "browser_local" | "cloud";
export type StorageStatus = "not_stored" | "stored" | "failed";

export interface DocumentStorageService {
  save(document: DocumentUpload): Promise<StoredDocument>;
  get(documentId: ID): Promise<StoredDocument | null>;
  remove(documentId: ID): Promise<void>;
  listForCase(caseId: ID): Promise<StoredDocument[]>;
  getStorageStatus(): { tier: StorageTier; available: boolean; message: string };
  clearForCase(caseId: ID): Promise<void>;
}

export class LocalDemoDocumentStorage implements DocumentStorageService {
  private memory = new MemoryDocumentStorage();
  private indexedDb = new IndexedDbDocumentStorage();

  private isIndexedDBAvailable(): boolean {
    return this.indexedDb.isAvailable();
  }

  async save(doc: DocumentUpload): Promise<StoredDocument> {
    // Prefer IndexedDB for browser-local persistence if available
    if (this.isIndexedDBAvailable()) {
      try {
        const stored = await this.indexedDb.save(doc);
        // Also keep in memory for fast access
        await this.memory.save(doc).catch(() => {});
        return stored;
      } catch (e) {
        // Fallback to memory if IndexedDB fails (e.g., quota, blocked)
        console.warn("[NyayaSetu] IndexedDB save failed, fallback to memory:", e);
        return this.memory.save(doc);
      }
    }
    // No IndexedDB — memory only
    return this.memory.save(doc);
  }

  async get(documentId: ID): Promise<StoredDocument | null> {
    // Try IndexedDB first, then memory
    if (this.isIndexedDBAvailable()) {
      try {
        const fromDb = await this.indexedDb.get(documentId);
        if (fromDb) return fromDb;
      } catch {
        // fall through to memory
      }
    }
    return this.memory.get(documentId);
  }

  async remove(documentId: ID): Promise<void> {
    // Remove from both
    await this.memory.remove(documentId);
    if (this.isIndexedDBAvailable()) {
      try {
        await this.indexedDb.remove(documentId);
      } catch {
        // ignore
      }
    }
  }

  async listForCase(caseId: ID): Promise<StoredDocument[]> {
    if (this.isIndexedDBAvailable()) {
      try {
        const fromDb = await this.indexedDb.listForCase(caseId);
        if (fromDb.length > 0) return fromDb;
      } catch {
        // fallback
      }
    }
    return this.memory.listForCase(caseId);
  }

  getStorageStatus(): { tier: StorageTier; available: boolean; message: string } {
    if (this.isIndexedDBAvailable()) {
      return this.indexedDb.getStatus();
    }
    return this.memory.getStatus() as { tier: StorageTier; available: boolean; message: string };
  }

  async clearForCase(caseId: ID): Promise<void> {
    await this.memory.clear();
    if (this.isIndexedDBAvailable()) {
      try {
        await this.indexedDb.clearForCase(caseId);
      } catch {
        // ignore
      }
    }
  }

  // For testing: expose underlying storages
  getMemoryStorage(): MemoryDocumentStorage {
    return this.memory;
  }
  getIndexedDbStorage(): IndexedDbDocumentStorage {
    return this.indexedDb;
  }
}

export class NotAvailableDocumentStorage implements DocumentStorageService {
  async save(_doc: DocumentUpload): Promise<StoredDocument> {
    throw new Error("Storage not available");
  }
  async get(_id: ID): Promise<StoredDocument | null> {
    return null;
  }
  async remove(_id: ID): Promise<void> {}
  async listForCase(_caseId: ID): Promise<StoredDocument[]> {
    return [];
  }
  getStorageStatus(): { tier: StorageTier; available: boolean; message: string } {
    return { tier: "memory_only", available: false, message: "Storage not available" };
  }
  async clearForCase(_caseId: ID): Promise<void> {}
}

export const documentStorageService: DocumentStorageService = new LocalDemoDocumentStorage();
