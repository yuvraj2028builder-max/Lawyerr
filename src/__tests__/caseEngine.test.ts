import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryCaseEngine } from "@/services/caseEngine.service";

describe("CaseEngine", () => {
  let engine: InMemoryCaseEngine;

  beforeEach(() => {
    engine = new InMemoryCaseEngine();
  });

  it("creates a case with correct defaults", async () => {
    const c = await engine.createCase({ description: "Landlord not returning deposit" });
    expect(c.id).toBeTruthy();
    expect(c.status).toBe("intake");
    expect(c.description).toBe("Landlord not returning deposit");
    expect(c.facts).toEqual([]);
  });

  it("adds a fact and updates case", async () => {
    const c = await engine.createCase({ description: "Test" });
    const fact = await engine.addFact(c.id, {
      key: "amount_involved",
      label: "Amount",
      value: 50000,
      source: "user",
      confidence: null,
      verified: true,
    });
    expect(fact.value).toBe(50000);
    const updated = await engine.getCase(c.id);
    expect(updated?.facts.length).toBe(1);
  });

  it("transitions status", async () => {
    const c = await engine.createCase({ description: "Test" });
    const updated = await engine.transitionStatus(c.id, "action_ready");
    expect(updated.status).toBe("action_ready");
  });

  it("handles missing case", async () => {
    await expect(engine.getCase("nonexistent")).resolves.toBeNull();
  });
});
