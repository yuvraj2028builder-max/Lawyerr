/**
 * Prompt 13 — Analytics guard: private data must never reach telemetry.
 *
 * Blocks document bytes/text, Aadhaar, PAN, passwords, API keys,
 * credentials, tokens, signed URLs, and owner-scoped private metadata.
 */
import { FORBIDDEN_FRONTEND_ENV_KEYS } from "./backendConfig";
export const ANALYTICS_BLOCKED_TERMS = [
  "aadhaar",
  "pan",
  "password",
  "api_key",
  "apikey",
  "credential",
  "secret",
  "token",
  "signed",
  "uploadurl",
  "downloadurl",
  "document_text",
  "ocr_text",
  "extractedtext",
  "bytes",
  "objectkey",
  "ownerid",
  "bearer",
  "data:",
  "<script",
] as const;

/** Content-free categories only. */
export const ANALYTICS_ALLOWED_CATEGORIES = [
  "intake",
  "action_plan",
  "evidence_metadata",
  "timeline",
  "document_workflow",
  "draft_workflow",
  "backend_status",
] as const;

export function isSafeBackendAnalyticsPayload(payload: { category: string; meta?: Record<string, unknown> }): boolean {
  if (!payload.category || typeof payload.category !== "string") return false;
  const serialized = JSON.stringify({ category: payload.category, meta: payload.meta ?? {} }).toLowerCase();
  return !ANALYTICS_BLOCKED_TERMS.some((term) => serialized.includes(term));
}

/** Returns true when document text would be sent to a provider (must be blocked while unavailable). */
export function wouldLeakDocumentTextToProvider(args: { documentTextPresent: boolean; providerAvailable: boolean }): boolean {
  return args.documentTextPresent && !args.providerAvailable;
}

// ─── Prompt 14 — precise analytics + config guards ──────────────────────────
// Risk addressed: substring-only blocklists miss short sensitive keys (pan,
// otp, cvv) or over-match innocent words ("company" contains "pan").
// Exact key matching for short tokens + substring scan for long markers.

/** Short tokens matched exactly against lowercased meta keys. */
export const ANALYTICS_BLOCKED_KEYS = [
  "aadhaar",
  "aadhar",
  "pan",
  "otp",
  "cvv",
  "password",
  "passwd",
  "pin",
  "upi_pin",
  "upipin",
  "cardnumber",
  "card_number",
  "email",
  "phone",
  "phonenumber",
  "address",
  "apikey",
  "api_key",
  "token",
  "secret",
  "credential",
  "credentials",
  "ownerid",
  "userid",
  "objectkey",
  "bytes",
  "documenttext",
  "document_text",
  "ocrtext",
  "ocr_text",
  "extractedtext",
  "signed",
  "bearer",
] as const;

/** Long markers scanned as substrings of the serialized payload. */
const ANALYTICS_BLOCKED_SUBSTRINGS = [
  "aadhaar",
  "api_key",
  "apikey",
  "credential",
  "document_text",
  "ocr_text",
  "extractedtext",
  "signed",
  "bearer",
  "private_key",
  "[phone_redacted]",
  "<script",
  "data:",
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}

/** Precise meta check: exact blocked keys + long-marker substring scan. */
export function isSafeAnalyticsMeta(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return true;
  for (const key of Object.keys(meta)) {
    if ((ANALYTICS_BLOCKED_KEYS as readonly string[]).includes(normalizeKey(key))) return false;
  }
  const serialized = JSON.stringify(meta).toLowerCase();
  return !ANALYTICS_BLOCKED_SUBSTRINGS.some((term) => serialized.includes(term));
}

/**
 * Gate for any future telemetry pipeline: the category must be allowlisted
 * AND the meta must pass the precise guard. Telemetry stays a no-op today;
 * this is the enforcement point for the day it is wired up.
 */
export function shouldSendAnalyticsEvent(payload: { category: string; meta?: Record<string, unknown> }): boolean {
  if (!payload.category || typeof payload.category !== "string") return false;
  if (!(ANALYTICS_ALLOWED_CATEGORIES as readonly string[]).includes(payload.category)) return false;
  return isSafeBackendAnalyticsPayload(payload) && isSafeAnalyticsMeta(payload.meta);
}

/**
 * Pure runtime scanner: returns the forbidden secret names found in an env
 * record. Use against import.meta.env keys to prove no VITE_-prefixed secret
 * leaks into the client bundle. Case-insensitive; matches bare names and
 * VITE_-prefixed variants.
 */
export function findForbiddenEnvKeys(env: Record<string, string | undefined>): string[] {
  const found: string[] = [];
  const names = Object.keys(env).map((k) => k.toUpperCase());
  for (const forbidden of FORBIDDEN_FRONTEND_ENV_KEYS) {
    if (names.some((k) => k === forbidden || k === `VITE_${forbidden}` || k.endsWith(`_${forbidden}`))) {
      found.push(forbidden);
    }
  }
  return found;
}
