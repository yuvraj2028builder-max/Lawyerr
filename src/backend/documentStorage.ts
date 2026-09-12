/**
 * Prompt 13 — Private document storage contract.
 *
 * - Private bucket only. No public buckets, no permanent public URLs.
 * - Opaque server-generated object keys. No filename-based storage paths.
 * - Short-lived signed URLs only, issued server-side after authorization.
 * - Local demo mode NEVER generates signed URLs and NEVER returns bytes.
 * - No document bytes are returned on unauthorized requests.
 */
import type { ID } from "@/types/domain";
import type { BackendResult } from "./backendTypes";
import { backendErr } from "./backendTypes";

export const PRIVATE_BUCKET_REQUIREMENT = "private-bucket-only";
export const SIGNED_URL_TTL_SECONDS = 15 * 60;
export const LOCAL_DEMO_NO_SIGNED_URLS = "Signed URLs are unavailable in local demo mode.";

export interface StorageUploadPermission {
  uploadUrl: string;
  expiresAt: string;
  documentId: ID;
  objectKey: string;
}

export interface StorageSignedDownload {
  downloadUrl: string;
  expiresAt: string;
  documentId: ID;
}

export interface PrivateStorageProvider {
  createUploadPermission(input: { ownerId: ID; caseId: ID; documentId: ID }): Promise<BackendResult<StorageUploadPermission>>;
  completeUpload(input: { ownerId: ID; caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID; objectKey: string }>>;
  getMetadata(input: { ownerId: ID | null; caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID; caseId: ID; ownerId: ID; displayName: string }>>;
  createSignedDownload(input: { ownerId: ID | null; caseId: ID; documentId: ID }): Promise<BackendResult<StorageSignedDownload>>;
  deleteObject(input: { ownerId: ID | null; caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID }>>;
  /** Bytes are only returned after authorization succeeds. Null session -> unauthorized. */
  getObjectBytes(input: { ownerId: ID | null; caseId: ID; documentId: ID }): Promise<BackendResult<{ bytes: Uint8Array }>>;
}

/**
 * Opaque server-generated object key. Inputs must already be opaque ids;
 * filenames, emails, or user text must never be passed here.
 */
export function buildOpaqueObjectKey(ownerId: ID, caseId: ID, documentId: ID): string {
  const safe = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return `private/${safe(ownerId)}/${safe(caseId)}/${safe(documentId)}`;
}

/** True when a key is opaque (no filename, extension, @, or traversal). */
export function isOpaqueObjectKey(key: string): boolean {
  if (!key.startsWith("private/")) return false;
  if (key.includes("..") || key.includes("@") || key.includes(" ")) return false;
  if (/\.(pdf|png|jpg|jpeg|webp|exe|txt|html)$/i.test(key)) return false;
  if (key.includes("invoice") || key.includes("receipt")) return false;
  return /^[A-Za-z0-9/_-]+$/.test(key);
}

/** Local demo storage: metadata only, no signed URLs, no bytes. */
export class LocalDemoStorageProvider implements PrivateStorageProvider {
  async createUploadPermission(_input: { ownerId: ID; caseId: ID; documentId: ID }): Promise<BackendResult<StorageUploadPermission>> {
    return backendErr("not_configured", "Upload permission unavailable in local demo mode. Files stay in this browser only.");
  }
  async completeUpload(_input: { ownerId: ID; caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID; objectKey: string }>> {
    return backendErr("not_configured", "Upload completion unavailable in local demo mode.");
  }
  async getMetadata(_input: { ownerId: ID | null; caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID; caseId: ID; ownerId: ID; displayName: string }>> {
    return backendErr("not_configured", "Private document metadata unavailable in local demo mode.");
  }
  async createSignedDownload(_input: { ownerId: ID | null; caseId: ID; documentId: ID }): Promise<BackendResult<StorageSignedDownload>> {
    return backendErr("not_configured", LOCAL_DEMO_NO_SIGNED_URLS);
  }
  async deleteObject(_input: { ownerId: ID | null; caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID }>> {
    return backendErr("not_configured", "Cloud deletion unavailable in local demo mode. Browser-local removal is separate.");
  }
  async getObjectBytes(_input: { ownerId: ID | null; caseId: ID; documentId: ID }): Promise<BackendResult<{ bytes: Uint8Array }>> {
    return backendErr("unauthorized", "Document bytes unavailable without an authenticated backend session.");
  }
}
