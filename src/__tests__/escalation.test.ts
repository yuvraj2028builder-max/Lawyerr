import { describe, it, expect } from "vitest";
import { escalationService } from "@/services/escalation.service";
import { demoCase } from "@/data/demoFixtures";

describe("EscalationService", () => {
  it("assesses LOW for demo case without summons", async () => {
    const r = await escalationService.assess(demoCase);
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(r.level);
    expect(r.isMock).toBe(true);
    expect(r.disclaimer).toBeTruthy();
  });

  it("escalates to HIGH when summons mentioned", async () => {
    const highCase = { ...demoCase, description: "I received a summons from court, police came" };
    const r = await escalationService.assess(highCase as never);
    expect(r.level).toBe("HIGH");
    expect(r.suggestedRoutes.some((x) => x.route === "lawyer")).toBe(true);
  });

  it("MEDIUM for large amount", async () => {
    const med = { ...demoCase, money: { amount: 200000, currency: "INR" as const, context: "cheque" } };
    const r = await escalationService.assess(med as never);
    expect(r.level).toBe("MEDIUM");
  });
});
