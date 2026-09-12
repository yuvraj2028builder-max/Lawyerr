/**
 * CloudDocumentStorage — future-ready interface for Supabase/cloud storage.
 * No real Supabase integration unless safe backend boundaries exist.
 * Returns not_configured honestly; never exposes service-role keys in frontend.
 */
import type { DocumentUpload, ID } from "@/types/domain";
import type { StoredDocument } from "./memoryStorage";

export type CloudStorageStatus = "not_configured" | "available" | "failed";

export interface CloudDocumentStorage {
  save(document: DocumentUpload, file: File): Promise<StoredDocument>;
  get(documentId: ID): Promise<StoredDocument | null>;
  remove(documentId: ID): Promise<void>;
  getStatus(): { status: CloudStorageStatus; message: string; missing: string[] };
  isConfigured(): boolean;
}

/**
 * NotConfiguredCloudStorage — honest stub when cloud not configured.
 * Documents why integration is unavailable; never fakes cloud persistence.
 */
export class NotConfiguredCloudStorage implements CloudDocumentStorage {
  private missing: string[] = [
    "Safe backend boundary for uploads (not direct frontend Supabase key)",
    "Authentication and authorization for document access",
    "Row-level security (RLS) preventing public access",
    "Upload/download/remove implementation with signed URLs",
    "Environment credentials (SUPABASE_URL, SERVICE_ROLE_KEY) not in frontend bundle",
  ];

  async save(_document: DocumentUpload, _file: File): Promise<StoredDocument> {
    throw new Error(
      `Cloud storage not configured: ${this.missing.join("; ")}. ` +
      "Documents stored locally in browser only. Do not label as cloud."
    );
  }

  async get(_documentId: ID): Promise<StoredDocument | null> {
    return null;
  }

  async remove(_documentId: ID): Promise<void> {
    throw new Error("Cloud storage not configured — cannot remove from cloud.");
  }

  getStatus(): { status: CloudStorageStatus; message: string; missing: string[] } {
    return {
      status: "not_configured",
      message: "Cloud storage is not configured. Documents are stored locally in browser (IndexedDB/memory) — not cloud-persisted. Refresh may lose file data if browser storage unavailable. Missing: safe backend boundary, auth, RLS, signed URLs, env credentials.",
      missing: this.missing,
    };
  }

  isConfigured(): boolean {
    return false;
  }

  getMissingRequirements(): string[] {
    return [...this.missing];
  }
}

/**
 * SupabaseCloudStorage — placeholder for future real implementation.
 * Would require:
 * - Backend endpoint that validates auth, checks case ownership, generates signed upload URL
 * - Supabase Storage bucket with RLS: only case owner can read/write, not public
 * - Service-role key kept in backend env, never in frontend
 * - File stored via backend, URL never in localStorage
 *
 * For now, returns not_configured honestly.
 */
export class SupabaseCloudStorage extends NotConfiguredCloudStorage {
  constructor(private config?: { supabaseUrl?: string; anonKey?: string }) {
    super();
    // Even if config provided, still not_configured without backend
  }

  override getStatus(): { status: CloudStorageStatus; message: string; missing: string[] } {
    const base = super.getStatus();
    if (this.config?.supabaseUrl) {
      return {
        status: "not_configured",
        message: base.message + " Supabase URL provided but backend boundary still missing — not production-ready.",
        missing: base.missing,
      };
    }
    return base;
  }
}

export const cloudDocumentStorage: CloudDocumentStorage = new NotConfiguredCloudStorage();

// Helper to safely check if cloud is available (never expose secrets)
export function isCloudStorageAvailable(): boolean {
  return cloudDocumentStorage.isConfigured();
}
