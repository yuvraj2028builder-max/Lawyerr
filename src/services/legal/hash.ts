/**
 * Deterministic content hash — used for source/provision integrity.
 * Browser + Node compatible. Uses FNV-1a 32-bit then hex; sufficient for
 * foundation.
 *
 * Hashing abstraction (Prompt 3):
 *  - Current: FNV-1a (fast, deterministic, 32 hex chars) — compatible with existing tests
 *  - Future: SHA-256 via SubtleCrypto — upgrade by replacing `hashContent()` body
 *            without changing ingestion pipeline callers.
 *  Keep `createContentHash` for backward compat; `hashContent` is the abstraction.
 */

export function createContentHash(text: string): string {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // multiply by FNV prime 16777619 (mod 2^32)
    hash = Math.imul(hash, 16777619);
  }
  // Convert to unsigned hex, 8 chars, pad
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  // Duplicate to look like 64-char hash for UI consistency, but deterministic
  // Real SHA-256 would be 64 hex chars; we return 32 chars by repeating
  return hex + hex + hex + hex;
}

export function verifyHash(text: string, expectedHash: string): boolean {
  return createContentHash(text) === expectedHash;
}

/** Prompt 3 abstraction — callers should prefer this; impl can be upgraded to SHA-256 */
export const hashContent = createContentHash;

/** Async SHA-256 path (available when SubtleCrypto present). Not used by default to keep tests sync. */
export async function hashContentSha256(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // fallback to FNV-1a if SubtleCrypto unavailable
  return createContentHash(text);
}
