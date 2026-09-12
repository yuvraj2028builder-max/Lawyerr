/**
 * Analytics architecture — event names only, no tracking yet.
 * Never log legal narratives as analytics payloads.
 */

export type IntakeAnalyticsEvent =
  | "intake_started"
  | "narrative_submitted"
  | "question_answered"
  | "fact_extracted"
  | "fact_corrected"
  | "domain_mismatch"
  | "question_skipped"
  | "intake_completed"
  | "intake_conflict_detected";

export interface AnalyticsPayload {
  event: IntakeAnalyticsEvent;
  sessionId?: string;
  step?: string;
  // Never include full narrative or PII
  meta?: Record<string, unknown>;
}

/** Content-free allowlist for any future telemetry implementation. */
export function isSafeAnalyticsPayload(payload: AnalyticsPayload): boolean {
  const serialized = JSON.stringify(payload.meta ?? {}).toLowerCase();
  return !["signed", "token", "password", "ocr", "document_text", "complaint", "data:", "<script"].some((term) => serialized.includes(term));
}

// No-op for now — privacy preserving, no third-party tracking
export function trackEvent(_payload: AnalyticsPayload): void {
  // Intentionally not sending to GA or any external service
  // For local dev, could console.debug in dev only without PII
}
