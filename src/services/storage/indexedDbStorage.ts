/**
 * IndexedDB Document Storage — browser-local persistence.
 * Uses IndexedDB to store document metadata + file blobs.
 * Falls back gracefully when IndexedDB unavailable.
 * Never stores raw bytes in localStorage; prefers IndexedDB.
 * Never stores in URL or analytics.
 */
import type { DocumentUpload, ID } from "@/types/domain";
import type { StoredDocument } from "./memoryStorage";

const DB_NAME = "nyayasetu_docs";
const DB_VERSION = 1;
const STORE_NAME = "documents";

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && !!indexedDB.open;
  } catch {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "document.id" });
        store.createIndex("caseId", "document.caseId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

// Serializable version — File stored as Blob + metadata
interface StoredRecord extends StoredDocument {
  fileBlob?: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export class IndexedDbDocumentStorage {
  isAvailable(): boolean {
    return isIndexedDBAvailable();
  }

  async save(doc: DocumentUpload): Promise<StoredDocument> {
    if (!this.isAvailable()) throw new Error("IndexedDB not available");

    const db = await openDB();
    try {
      // Convert File to Blob for storage if present
      let fileBlob: Blob | undefined;
      if (doc.file) {
        // File is subclass of Blob; slice to create Blob
        fileBlob = doc.file.slice(0, doc.file.size, doc.file.type);
      }

      const record: StoredRecord = {
        document: {
          // Store a copy without File object (which is not cloneable in some browsers)
          // Keep metadata, omit file field for IDB storage, but retain blob separately
          ...doc,
          file: undefined, // don't store File directly; use blob
        },
        fileBlob,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        storageTier: "browser_local",
        persistedAt: new Date().toISOString(),
        note: "Stored locally in this browser (IndexedDB) — not cloud-persisted. Data may be cleared if browser storage is cleared.",
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record as unknown as Record<string, unknown>);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      // Return with tier browser_local
      const stored: StoredDocument = {
        document: doc,
        storageTier: "browser_local",
        persistedAt: record.persistedAt,
        note: record.note,
      };
      return stored;
    } finally {
      db.close();
    }
  }

  async get(documentId: ID): Promise<StoredDocument | null> {
    if (!this.isAvailable()) return null;
    const db = await openDB();
    try {
      const record = await new Promise<StoredRecord | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(documentId);
        req.onsuccess = () => resolve(req.result as StoredRecord | undefined);
        req.onerror = () => reject(req.error);
      });

      if (!record) return null;

      // Reconstruct File if blob exists
      let file: File | undefined;
      if (record.fileBlob) {
        try {
          file = new File([record.fileBlob], record.fileName, { type: record.mimeType });
        } catch {
          // fallback: keep blob only
          file = undefined;
        }
      }

      const doc: DocumentUpload = {
        ...record.document,
        file: file ?? record.document.file,
        fileName: record.fileName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
      };

      return {
        document: doc,
        storageTier: "browser_local",
        persistedAt: record.persistedAt,
        note: record.note,
      };
    } finally {
      db.close();
    }
  }

  async remove(documentId: ID): Promise<void> {
    if (!this.isAvailable()) return;
    const db = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(documentId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async listForCase(caseId: ID): Promise<StoredDocument[]> {
    if (!this.isAvailable()) return [];
    const db = await openDB();
    try {
      const all = await new Promise<StoredRecord[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        // Try index first
        try {
          const idx = store.index("caseId");
          const req = idx.getAll(caseId);
          req.onsuccess = () => resolve((req.result as StoredRecord[]) ?? []);
          req.onerror = () => reject(req.error);
        } catch {
          // fallback to getAll
          const req = store.getAll();
          req.onsuccess = () => {
            const results = (req.result as StoredRecord[]).filter((r) => r.document.caseId === caseId);
            resolve(results);
          };
          req.onerror = () => reject(req.error);
        }
      });

      return all.map((record) => {
        let file: File | undefined;
        if (record.fileBlob) {
          try {
            file = new File([record.fileBlob], record.fileName, { type: record.mimeType });
          } catch {
            file = undefined;
          }
        }
        const doc: DocumentUpload = {
          ...record.document,
          file: file ?? record.document.file,
          fileName: record.fileName,
          mimeType: record.mimeType,
          sizeBytes: record.sizeBytes,
        };
        return {
          document: doc,
          storageTier: "browser_local" as const,
          persistedAt: record.persistedAt,
          note: record.note,
        };
      });
    } finally {
      db.close();
    }
  }

  async clearForCase(caseId: ID): Promise<void> {
    const docs = await this.listForCase(caseId);
    for (const d of docs) {
      await this.remove(d.document.id);
    }
  }

  getStatus(): { tier: "browser_local"; available: boolean; message: string } {
    return {
      tier: "browser_local",
      available: this.isAvailable(),
      message: this.isAvailable()
        ? "Browser-local IndexedDB storage — survives refresh, not cloud-persisted, may be cleared if browser data is cleared."
        : "IndexedDB not available — falling back to memory-only.",
    };
  }

  // For testing: check availability without side effects
  static checkAvailability(): boolean {
    return isIndexedDBAvailable();
  }
}
