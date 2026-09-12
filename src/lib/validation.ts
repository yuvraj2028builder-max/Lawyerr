/**
 * Shared validation helpers — keep input safe, minimal PII.
 */

export function isReasonableText(s: string, maxLen = 5000): boolean {
  return typeof s === "string" && s.trim().length > 0 && s.length <= maxLen;
}

export function sanitizeText(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, 5000);
}

export function validateAmount(n: unknown): { ok: boolean; value?: number; error?: string } {
  if (n === "" || n === null || n === undefined) return { ok: true };
  const v = typeof n === "string" ? Number(n) : (n as number);
  if (Number.isNaN(v) || !Number.isFinite(v)) return { ok: false, error: "Please enter a valid amount." };
  if (v < 0) return { ok: false, error: "Amount cannot be negative." };
  if (v > 100000000) return { ok: false, error: "Amount seems too large — please check." };
  return { ok: true, value: v };
}
