import { describe, it, expect } from "vitest";
import { privacyService } from "@/services/privacy.service";

describe("PrivacyService", () => {
  it("flags sensitive fields", () => {
    const r = privacyService.validateNoSensitiveData({ aadhaar: "123", description: "hello" });
    expect(r.ok).toBe(false);
    expect(r.flaggedKeys).toContain("aadhaar");
  });

  it("passes clean input", () => {
    const r = privacyService.validateNoSensitiveData({ description: "rent issue", amount: 50000 });
    expect(r.ok).toBe(true);
  });

  it("forbidden fields never empty", () => {
    expect(privacyService.forbiddenFields().length).toBeGreaterThan(0);
  });
});
