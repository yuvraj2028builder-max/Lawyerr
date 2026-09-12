/**
 * DocumentStorageService — provider interface for document persistence.
 * - Does NOT store sensitive bytes in URLs or analytics
 * - Does NOT claim cloud when it's local
 * - Prefers IndexedDB for browser-local, falls back to memory
 * - Never uses localStorage for raw bytes (IndexedDB is appropriate)
 */

import type { DocumentUpload, ID } from "@/types/domain";

export type StoragePersistence = "memory_only" | "browser_local" | "cloud";

export interface StoredDocument {
  document: DocumentUpload;
  persistence: StoragePersistence;
  storedAt: string; // ISO
  storageNote: string;
}

export interface DocumentStorageService {
  save(doc: DocumentUpload): Promise<StoredDocument>;
  get(documentId: ID): Promise<StoredDocument | null>;
  getForCase?(caseId: ID): Promise<StoredDocument[]>;
  remove(documentId: ID): Promise<void>;
  getPersistence(): StoragePersistence;
  isAvailable(): boolean;
}

// ─── In-Memory (fallback) ───────────────────────────────────────────────────
export class InMemoryDocumentStorage implements DocumentStorageService {
  private store = new Map<ID, StoredDocument>();

  async save(doc: DocumentUpload): Promise<StoredDocument> {
    const stored: StoredDocument = {
      document: { ...doc },
      persistence: "memory_only",
      storedAt: new Date().toISOString(),
      storageNote: "memory_only — not persisted across refresh. Browser-local storage unavailable in this environment.",
    };
    this.store.set(doc.id, stored);
    return stored;
  }

  async get(documentId: ID): Promise<StoredDocument | null> {
    return this.store.get(documentId) ?? null;
  }

  async getForCase(caseId: ID): Promise<StoredDocument[]> {
    return Array.from(this.store.values()).filter((s) => s.document.caseId === caseId);
  }

  async remove(documentId: ID): Promise<void> {
    this.store.delete(documentId);
  }

  getPersistence(): StoragePersistence {
    return "memory_only";
  }

  isAvailable(): boolean {
    return true;
  }

  clear(): void {
    this.store.clear();
  }
}

// ─── IndexedDB (browser-local) ─────────────────────────────────────────────
const DB_NAME = "nyayasetu_docs";
const STORE_NAME = "documents";
const DB_VERSION = 1;

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && !!indexedDB;
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
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export class IndexedDBDocumentStorage implements DocumentStorageService {
  async save(doc: DocumentUpload): Promise<StoredDocument> {
    if (!isIndexedDBAvailable()) {
      // Fallback to memory behavior but signal memory_only
      return {
        document: { ...doc },
        persistence: "memory_only",
        storedAt: new Date().toISOString(),
        storageNote: "memory_only — IndexedDB not available. Refresh will lose file data (metadata remains in case).",
      };
    }

    const stored: StoredDocument = {
      document: { ...doc },
      persistence: "browser_local",
      storedAt: new Date().toISOString(),
      storageNote:
        "browser_local — stored in IndexedDB on this device. Not cloud-persisted. Cleared if you clear site data. File data available after refresh if browser persistence succeeds.",
    };

    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        // Store with document.id as key
        const req = store.put(stored);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
      return stored;
    } catch (e) {
      // Fallback honestly
      return {
        document: { ...doc },
        persistence: "memory_only",
        storedAt: new Date().toISOString(),
        storageNote: `memory_only — IndexedDB save failed: ${e instanceof Error ? e.message : "unknown"}. Showing honest fallback.`,
      };
    }
  }

  async get(documentId: ID): Promise<StoredDocument | null> {
    if (!isIndexedDBAvailable()) return null;
    try {
      const db = await openDB();
      const result = await new Promise<StoredDocument | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(documentId);
        req.onsuccess = () => resolve((req.result as StoredDocument) ?? null);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
      return result;
    } catch {
      return null;
    }
  }

  async getForCase(caseId: ID): Promise<StoredDocument[]> {
    if (!isIndexedDBAvailable()) return [];
    try {
      const db = await openDB();
      const results = await new Promise<StoredDocument[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const index = store.index("caseId");
        const req = index.getAll(caseId);
        // Some browsers need IDBKeyRange — use getAll with key
        // Fallback if getAll not supported for index
        if (!req) {
          // Fallback: iterate all
          const all: StoredDocument[] = [];
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const val = cursor.value as StoredDocument;
              if (val.document.caseId === caseId) all.push(val);
              cursor.continue();
            } else {
              resolve(all);
            }
          };
          cursorReq.onerror = () => reject(cursorReq.error);
          return;
        }
        req.onsuccess = () => resolve((req.result as StoredDocument[]) ?? []);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
      return results;
    } catch {
      return [];
    }
  }

  async remove(documentId: ID): Promise<void> {
    if (!isIndexedDBAvailable()) return;
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(documentId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
    } catch {
      // ignore
    }
  }

  getPersistence(): StoragePersistence {
    return isIndexedDBAvailable() ? "browser_local" : "memory_only";
  }

  isAvailable(): boolean {
    return isIndexedDBAvailable();
  }
}

// ─── Hybrid provider (tries IndexedDB, falls back to memory) ────────────────
export class LocalDemoDocumentStorage implements DocumentStorageService {
  private memory = new InMemoryDocumentStorage();
  private indexedDB = new IndexedDBDocumentStorage();

  async save(doc: DocumentUpload): Promise<StoredDocument> {
    if (this.indexedDB.isAvailable()) {
      const result = await this.indexedDB.save(doc);
      if (result.persistence === "browser_local") return result;
      // Fallback to memory if IndexedDB failed
    }
    return this.memory.save(doc);
  }

  async get(documentId: ID): Promise<StoredDocument | null> {
    if (this.indexedDB.isAvailable()) {
      const fromIDB = await this.indexedDB.get(documentId);
      if (fromIDB) return fromIDB;
    }
    return this.memory.get(documentId);
  }

  async getForCase(caseId: ID): Promise<StoredDocument[]> {
    const mem = await this.memory.getForCase(caseId);
    if (this.indexedDB.isAvailable()) {
      const idb = await this.indexedDB.getForCase(caseId);
      // Merge, dedup by id
      const map = new Map<ID, StoredDocument>();
      for (const s of [...mem, ...idb]) map.set(s.document.id, s);
      return Array.from(map.values());
    }
    return mem;
  }

  async remove(documentId: ID): Promise<void> {
    await this.memory.remove(documentId);
    if (this.indexedDB.isAvailable()) await this.indexedDB.remove(documentId);
  }

  getPersistence(): StoragePersistence {
    return this.indexedDB.isAvailable() ? "browser_local" : "memory_only";
  }

  isAvailable(): boolean {
    return true; // always at least memory
  }

  // For testing
  clearMemory(): void {
    this.memory.clear();
  }
}

// ─── Cloud — future Supabase interface (not_configured) ─────────────────────

export type CloudStorageStatus = "not_configured" | "configured" | "error";

export interface CloudStorageConfig {
  status: CloudStorageStatus;
  reason: string;
  missing: string[];
}

export class CloudDocumentStorage implements DocumentStorageService {
  private config: CloudStorageConfig = {
    status: "not_configured",
    reason:
      "Cloud storage is not configured. Requires backend boundary with authenticated, authorized access; Supabase credentials must not be exposed in frontend; documents must not be publicly accessible by default.",
    missing: [
      "Supabase project with private bucket (not public)",
      "Row Level Security (RLS) policies per user/case",
      "Backend API to issue signed upload/download URLs (no service-role key in frontend)",
      "Authentication and authorization handling",
      "Document encryption at rest (if handling sensitive PII)",
    ],
  };

  getConfig(): CloudStorageConfig {
    return this.config;
  }

  async save(_doc: DocumentUpload): Promise<StoredDocument> {
    throw new Error(
      `Cloud storage not configured: ${this.config.reason} — Using local/demo storage.`
    );
  }

  async get(_documentId: ID): Promise<StoredDocument | null> {
    throw new Error("Cloud storage not configured — cannot fetch cloud document.");
  }

  async remove(_documentId: ID): Promise<void> {
    throw new Error("Cloud storage not configured — cannot remove cloud document.");
  }

  getPersistence(): StoragePersistence {
    return "cloud";
  }

  isAvailable(): boolean {
    return false;
  }

  getStatus(): CloudStorageStatus {
    return this.config.status;
  }

  describeLimitation(): string {
    return [
      "Cloud storage is not_configured.",
      this.config.reason,
      "Missing:",
      ...this.config.missing.map((m) => ` - ${m}`),
      "Never place Supabase service-role keys in frontend code. Never use hard-coded secrets. Never make documents publicly accessible by default.",
    ].join("\n");
  }
}

export const cloudDocumentStorage = new CloudDocumentStorage();

export const documentStorageService: DocumentStorageService = new LocalDemoDocumentStorage();

export function getDocumentStorage(): DocumentStorageService {
  return documentStorageService;
}
