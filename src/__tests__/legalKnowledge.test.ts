import { describe, it, expect } from "vitest";
import { MockLegalKnowledgeService } from "@/services/legalKnowledge.service";

describe("MockLegalKnowledgeService safety", () => {
  it("never returns verified legal claims", async () => {
    const svc = new MockLegalKnowledgeService();
    const result = await svc.search({ query: "security deposit law section" });
    expect(result.isMock).toBe(true);
    expect(result.confidence).toBe("unverified");
    expect(result.claims).toEqual([]);
    expect(result.disclaimer).toContain("not legal advice");
    expect(result.note).toContain("[MOCK]");
  });

  it("verify returns unverified claim", async () => {
    const svc = new MockLegalKnowledgeService();
    const claim = await svc.verify("Section XYZ says...");
    expect(claim.verified).toBe(false);
    expect(claim.confidence).toBe("unverified");
  });

  it("cite marks mock sources", () => {
    const svc = new MockLegalKnowledgeService();
    const source = {
      id: "1",
      title: "Test",
      citation: "Test citation",
      jurisdiction: "IN" as const,
      type: "statute" as const,
      retrievedAt: new Date().toISOString(),
      confidence: "unverified" as const,
      verified: false,
      isMock: true,
    };
    const c = svc.cite(source);
    expect(c.citationText).toContain("DEMO — NOT VERIFIED");
  });
});
