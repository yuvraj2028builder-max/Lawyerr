/**
 * Threat model, not a production-security claim. Mitigations describe the required
 * backend design; local demo mode has no authenticated private-storage boundary.
 */
export interface Threat { threat: string; boundary: string; requiredMitigation: string; currentStatus: "designed" | "not_configured"; }
export const SECURITY_THREATS: Threat[] = [
  ["Unauthorized or cross-user document/case access", "backend authorization", "Authenticate every request and enforce case/document ownership in database policies.", "not_configured"],
  ["Leaked or stale signed URLs", "server signed-URL issuer", "Create short-lived URLs only after ownership checks; never persist, log, or display them broadly.", "designed"],
  ["Public bucket or frontend credentials", "cloud configuration", "Use a private bucket and server-held privileged credentials; no VITE_ secrets.", "designed"],
  ["Predictable IDs, metadata leaks, sharing", "API and storage keys", "Use server-generated opaque IDs/keys and minimum display metadata; prohibit arbitrary paths.", "designed"],
  ["Replay, oversized or malicious uploads", "upload endpoint", "Validate authenticated request, size/type/hash and one-time short-lived upload permissions server-side.", "designed"],
  ["Path traversal, HTML, double extensions", "client/server file validation", "Reject unsafe filenames; sanitize display name; never use it as a path or instruction.", "designed"],
  ["Prompt injection or untrusted PDF/OCR text", "processing boundary", "Treat extracted text as data only; require user confirmation and verified-law sources.", "designed"],
  ["Analytics/errors leaking case contents", "telemetry", "Allowlisted content-free events and safe error categories only.", "designed"],
  ["Deletion recovery/stale URLs", "deletion service", "Track deletion state; revoke new access and preserve fact provenance without promising retention periods.", "designed"],
  ["Client authorization bypass", "backend", "Never trust client checks; backend/database is the security boundary.", "not_configured"],
].map(([threat, boundary, requiredMitigation, currentStatus]) => ({ threat, boundary, requiredMitigation, currentStatus: currentStatus as Threat["currentStatus"] }));
