/**
 * CloudDocumentStorage — future-ready interface for Supabase/cloud persistence.
 * Currently NOT configured — documents remain local/demo.
 *
 * Safety requirements NOT met, so returns not_configured honestly:
 * - No backend boundary for credentials
 * - No auth / authorization handling
 * - No private-bucket policy (public by default would leak)
 * - No upload/download/remove implementation
 *
 * NEVER place Supabase service-role keys in frontend.
 * NEVER use hard-coded secrets.
 */

import type { DocumentUpload, ID } from "@/types/domain";
import type { StoredDocument, DocumentStorageService, StoragePersistence } from "./documentStorage.service";

export type CloudStorageStatus = "not_configured" | "available" | "error";

export interface CloudStorageConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  bucket?: string;
  configured: boolean;
  missing: string[]; // what is missing
}

export interface CloudDocumentStorage extends DocumentStorageService {
  getConfig(): CloudStorageConfig;
  getStatus(): CloudStorageStatus;
}

export class NotConfiguredCloudStorage implements CloudDocumentStorage {
  getConfig(): CloudStorageConfig {
    return {
      configured: false,
      missing: [
        "Supabase project URL not configured",
        "Supabase anonymous client key not configured; privileged credentials must remain on a backend",
        "Storage bucket not created with private access policy",
        "Authentication / row-level security not implemented",
        "Upload/download/remove not implemented behind backend boundary",
        "Documents must not become publicly accessible by default",
      ],
    };
  }

  getStatus(): CloudStorageStatus {
    return "not_configured";
  }

  async save(_doc: DocumentUpload): Promise<StoredDocument> {
    return {
      document: _doc,
      persistence: "memory_only",
      storedAt: new Date().toISOString(),
      storageNote:
        "cloud not_configured — Supabase storage not available. Using local/demo storage only. Cloud requires backend boundary, auth, and private bucket — none of which are configured.",
    };
  }

  async get(_documentId: ID): Promise<StoredDocument | null> {
    return null;
  }

  async getForCase(_caseId: ID): Promise<StoredDocument[]> {
    return [];
  }

  async remove(_documentId: ID): Promise<void> {
    // no-op — not configured
  }

  getPersistence(): StoragePersistence {
    return "cloud"; // interface claims cloud but status is not_configured
  }

  isAvailable(): boolean {
    return false;
  }

  getNotConfiguredMessage(): string {
    return (
      "Cloud storage not configured. Documents are stored locally in this browser only (IndexedDB or memory). " +
      "To enable cloud: add Supabase backend with private bucket, auth, and RLS — do not put service-role keys in frontend."
    );
  }
}

export const cloudDocumentStorage: CloudDocumentStorage = new NotConfiguredCloudStorage();
