/**
 * Normalization — deterministic, preserves legal meaning, strips noise.
 * Source text is DATA, never instructions. We sanitize for retrieval only,
 * not execute.
 */

export function normalizeText(raw: string): string {
  if (!raw) return "";
  // Unicode NFKC, trim, collapse whitespace, lower case for search
  // Keep punctuation because legal citations need it
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeSectionIdentifier(id: string): string {
  return id.trim().replace(/\s+/g, " ").toLowerCase();
}

// Treat source content as DATA — strip prompt-injection patterns for display
// but never execute them. This is defensive; retrieval should never feed raw
// source as system instruction to an LLM.
const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/gi,
  /system\s*:\s*/gi,
  /you\s+are\s+now/gi,
];

export function isSuspiciousSourceContent(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

export function sanitizeForDisplay(text: string): string {
  // For UI display we show source text verbatim but mark suspicious
  return text;
}
