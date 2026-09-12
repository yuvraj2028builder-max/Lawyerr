import { describe, expect, it } from "vitest";
import { DevelopmentAuthService } from "@/services/auth.service";
import { BackendRequiredAuthorizationService, FRONTEND_AUTHORIZATION_LIMITATION } from "@/services/authorization.service";
import { NotConfiguredPrivateDocumentApi, serverStorageKey } from "@/services/document/privateDocument.contract";
import { NotConfiguredCloudStorage } from "@/services/document/cloudDocumentStorage.service";
import { documentUploadService, isSuspiciousDoubleExtension, sanitizeDisplayFileName } from "@/services/documentUpload.service";
import { isSafeAnalyticsPayload } from "@/services/analytics";
import { SECURITY_THREATS } from "@/security/threatModel";

const ids = { userId: "usr_opaque_123", caseId: "case_opaque_456", documentId: "doc_opaque_789" };
const file = (name: string, type = "application/pdf", size = 100) => new File(["x".repeat(size)], name, { type });

describe("Prompt 9 — authentication boundary", () => {
  it("has no current user in development mode", async () => expect(await new DevelopmentAuthService().getCurrentUser()).toBeNull());
  it("labels the adapter as development mode", async () => expect((await new DevelopmentAuthService().getSession()).mode).toBe("development"));
  it("does not claim authenticated status", async () => expect((await new DevelopmentAuthService().getSession()).status).toBe("unavailable"));
  it("does not fake a production sign-in", async () => expect((await new DevelopmentAuthService().signIn()).ok).toBe(false));
  it("explains that local demo is not a private account", async () => expect(JSON.stringify(await new DevelopmentAuthService().signIn())).toContain("not a private account"));
});

describe("Prompt 9 — authorization boundary", () => {
  const authz = new BackendRequiredAuthorizationService();
  it("denies unauthenticated case reads", async () => expect(await authz.canReadCase(null, ids.caseId)).toBe(false));
  it("denies frontend-only same-user case reads", async () => expect(await authz.canReadCase(ids.userId, ids.caseId, ids.userId)).toBe(false));
  it("denies cross-user document reads", async () => expect(await authz.canReadDocument("other", ids.caseId, ids.documentId, ids.userId)).toBe(false));
  it("denies document writes", async () => expect(await authz.can(ids.userId, "upload_document", ids)).toBe(false));
  it("documents that frontend checks are not security", () => expect(FRONTEND_AUTHORIZATION_LIMITATION).toContain("backend"));
});

describe("Prompt 9 — cloud and signed URL contracts", () => {
  const api = new NotConfiguredPrivateDocumentApi();
  it("cloud adapter remains not configured", () => expect(new NotConfiguredCloudStorage().getStatus()).toBe("not_configured"));
  it("cloud adapter is unavailable", () => expect(new NotConfiguredCloudStorage().isAvailable()).toBe(false));
  it("does not create a fake upload URL", async () => expect(await api.createUploadRequest({ ...ids, displayName: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 100 })).toMatchObject({ ok: false, error: { code: "not_configured" } }));
  it("does not create a fake download URL", async () => expect(await api.createSignedDownload(ids)).toMatchObject({ ok: false, error: { code: "not_configured" } }));
  it("does not pretend upload completion succeeded", async () => expect(await api.completeUpload(ids)).toMatchObject({ ok: false, error: { code: "not_configured" } }));
  it("does not return private metadata without backend", async () => expect(await api.getPrivateDocument(ids)).toMatchObject({ ok: false, error: { code: "not_configured" } }));
  it("does not claim cloud deletion completed", async () => expect(await api.removePrivateDocument(ids)).toMatchObject({ ok: false, error: { code: "not_configured" } }));
  it("uses a short safe not-configured error", async () => expect(JSON.stringify(await api.createSignedDownload(ids))).not.toContain("http"));
});

describe("Prompt 9 — storage-key and filename hardening", () => {
  it("uses opaque identifiers in server storage key", () => expect(serverStorageKey(ids.caseId, ids.documentId)).toBe("cases/case_opaque_456/documents/doc_opaque_789"));
  it("never puts filenames in a server storage key", () => expect(serverStorageKey(ids.caseId, ids.documentId)).not.toContain("invoice"));
  it("never puts an email in a server storage key", () => expect(serverStorageKey(ids.caseId, ids.documentId)).not.toContain("@"));
  it("sanitizes separators", () => expect(sanitizeDisplayFileName("a/b\\c.pdf")).not.toMatch(/[\\/]/));
  it("sanitizes markup delimiters", () => expect(sanitizeDisplayFileName("<script>.pdf")).not.toContain("<"));
  it("limits display-name length", () => expect(sanitizeDisplayFileName(`${"a".repeat(200)}.pdf`).length).toBeLessThanOrEqual(120));
  it("flags executable double extensions", () => expect(isSuspiciousDoubleExtension("invoice.exe.pdf")).toBe(true));
  it("rejects path traversal", () => expect(documentUploadService.validateFile(file("../../private.pdf")).ok).toBe(false));
  it("rejects markup filenames", () => expect(documentUploadService.validateFile(file("<script>.pdf")).ok).toBe(false));
  it("rejects executable double extensions", () => expect(documentUploadService.validateFile(file("invoice.exe.pdf")).ok).toBe(false));
  it("rejects executable extensions", () => expect(documentUploadService.validateFile(file("invoice.exe", "application/pdf")).ok).toBe(false));
  it("rejects MIME and extension mismatch", () => expect(documentUploadService.validateFile(file("invoice.exe", "application/pdf")).ok).toBe(false));
  it("accepts an ordinary PDF", () => expect(documentUploadService.validateFile(file("invoice.pdf")).ok).toBe(true));
  it("rejects zero-byte files", () => expect(documentUploadService.validateFile(file("empty.pdf", "application/pdf", 0)).ok).toBe(false));
  it("rejects unsupported file formats", () => expect(documentUploadService.validateFile(file("document.txt", "text/plain")).ok).toBe(false));
});

describe("Prompt 9 — privacy and telemetry", () => {
  it("allows content-free analytics metadata", () => expect(isSafeAnalyticsPayload({ event: "intake_started", meta: { category: "document" } })).toBe(true));
  it("blocks signed URL-like analytics metadata", () => expect(isSafeAnalyticsPayload({ event: "intake_started", meta: { signed: "url" } })).toBe(false));
  it("blocks OCR analytics metadata", () => expect(isSafeAnalyticsPayload({ event: "intake_started", meta: { ocr: "text" } })).toBe(false));
  it("blocks tokens from analytics metadata", () => expect(isSafeAnalyticsPayload({ event: "intake_started", meta: { token: "value" } })).toBe(false));
  it("threat model records client authorization bypass", () => expect(SECURITY_THREATS.some((t) => t.threat.includes("Client authorization bypass"))).toBe(true));
  it("threat model does not claim all controls configured", () => expect(SECURITY_THREATS.some((t) => t.currentStatus === "not_configured")).toBe(true));
  it("threat model covers prompt injection", () => expect(SECURITY_THREATS.some((t) => t.threat.includes("Prompt injection"))).toBe(true));
  it("threat model covers stale signed URLs", () => expect(SECURITY_THREATS.some((t) => t.threat.includes("stale signed URLs"))).toBe(true));
});
