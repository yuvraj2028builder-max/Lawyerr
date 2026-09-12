/**
 * Prompt 15 — Private Supabase Storage provider.
 *
 * - Bucket is private (see supabase/migrations/*_storage.sql): no public
 *   URLs, ever. Only short-lived signed URLs, issued after the caller has
 *   passed authorization (this provider never authorizes by itself — it only
 *   mints URLs for already-authorized owner/case/document triples).
 * - Object keys are opaque server-style ids: private/<owner>/<case>/<doc>.
 *   Never filenames, never user-supplied paths.
 * - Signed URLs are returned to the caller only: never logged, never cached
 *   long-term, never sent to analytics (automated tests pin this).
 * - Unconfigured -> honest "not_configured". URLs are never fabricated.
 */
import type { ID } from "@/types/domain";
import type { BackendResult } from "../backendTypes";
import { backendErr, backendOk } from "../backendTypes";
import { buildOpaqueObjectKey } from "../documentStorage";
import { SIGNED_URL_TTL_SECONDS } from "../documentStorage";

export const PRIVATE_DOCUMENTS_BUCKET = "nyayasetu-private";

/** Narrow structural surface used — real SDK satisfies it; tests inject mocks. */
export interface SupabaseStorageClient {
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(
        path: string,
      ): Promise<{ data: { path: string; token: string } | null; error: Error | null }>;
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl: string } | null; error: Error | null }>;
      remove(paths: string[]): Promise<{ error: Error | null }>;
    };
  };
}

export interface StoragePermission {
  url: string;
  expiresAt: string;
  documentId: ID;
  objectKey: string;
}

function expiryIso(): string {
  return new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
}

export class SupabaseStorageProvider {
  constructor(
    private readonly client: SupabaseStorageClient | null,
    private readonly opts?: { supabaseUrl?: string },
  ) {}

  private backend(): SupabaseStorageClient | null {
    return this.client;
  }

  async createSignedUpload(input: { ownerId: ID; caseId: ID; documentId: ID }): Promise<BackendResult<StoragePermission>> {
    const backend = this.backend();
    if (!backend) {
      return backendErr("not_configured", "Private document storage is not configured. Files stay in this browser only.");
    }
    const objectKey = buildOpaqueObjectKey(input.ownerId, input.caseId, input.documentId);
    const { data, error } = await backend.storage.from(PRIVATE_DOCUMENTS_BUCKET).createSignedUploadUrl(objectKey);
    if (error || !data) {
      return backendErr("failed", `Could not prepare the private upload: ${error?.message ?? "unknown storage error"}`);
    }
    // A signed upload is only usable as the full tokenized URL. The token is
    // single-use and short-lived; it is returned to the caller only — never
    // logged, cached, or sent to analytics.
    const base = (this.opts?.supabaseUrl ?? "").replace(/\/$/, "");
    if (!base) {
      return backendErr("failed", "Could not prepare the private upload: storage host is not configured.");
    }
    const url = `${base}/storage/v1/object/upload/sign/${data.path}?token=${data.token}`;
    return backendOk({ url, expiresAt: expiryIso(), documentId: input.documentId, objectKey });
  }

  async createSignedDownload(input: { ownerId: ID; caseId: ID; documentId: ID }): Promise<BackendResult<StoragePermission>> {
    const backend = this.backend();
    if (!backend) {
      return backendErr("not_configured", "Private document downloads are not configured.");
    }
    const objectKey = buildOpaqueObjectKey(input.ownerId, input.caseId, input.documentId);
    const { data, error } = await backend.storage
      .from(PRIVATE_DOCUMENTS_BUCKET)
      .createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      return backendErr("failed", `Could not prepare the private download: ${error?.message ?? "unknown storage error"}`);
    }
    return backendOk({ url: data.signedUrl, expiresAt: expiryIso(), documentId: input.documentId, objectKey });
  }

  async removeObject(input: { ownerId: ID; caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID }>> {
    const backend = this.backend();
    if (!backend) {
      return backendErr("not_configured", "Private document deletion is not configured.");
    }
    const objectKey = buildOpaqueObjectKey(input.ownerId, input.caseId, input.documentId);
    const { error } = await backend.storage.from(PRIVATE_DOCUMENTS_BUCKET).remove([objectKey]);
    if (error) return backendErr("failed", `Could not delete the private document: ${error.message}`);
    return backendOk({ documentId: input.documentId });
  }
}
