import { describe, it, expect, beforeEach } from "vitest";
import { LegalAnswerValidator } from "@/services/legal/answerValidator.service";
import { LegalSourceIngestionService } from "@/services/legal/ingestion.service";
import { TEST_FIXTURE_SOURCE } from "@/data/testLegalFixtures";
import type { LegalClaim } from "@/types/domain";

describe("LegalAnswerValidator", () => {
  let validator: LegalAnswerValidator;

  beforeEach(async () => {
    validator = new LegalAnswerValidator();
    // Ensure corpus present
    const { legalSourceRepo, legalProvisionRepo } = await import("@/services/legal/repositories");
    await legalSourceRepo.deleteAll();
    await legalProvisionRepo.deleteAll();
    const ingestion = new LegalSourceIngestionService();
    await ingestion.ingestSource(TEST_FIXTURE_SOURCE);
  });

  it("INSUFFICIENT_GROUNDING when no claims and no passages", async () => {
    const res = await validator.validate({ claims: [], hasRetrievedPassages: false, requireProductionAllowed: true });
    expect(res.status).toBe("INSUFFICIENT_GROUNDING");
    expect(res.canShowAsVerified).toBe(false);
  });

  it("UNSAFE_MOCK_AS_VERIFIED when mock claim in production mode", async () => {
    const { legalSourceRepo } = await import("@/services/legal/repositories");
    const source = await legalSourceRepo.getById(TEST_FIXTURE_SOURCE.id!);
    const claim: LegalClaim = {
      id: "c1",
      statement: "test",
      sources: [source as never],
      provisionIds: [source!.id + "__test_1__0"],
      sourceIds: [source!.id],
      confidence: "high",
      verified: true,
      isMock: true,
      disclaimer: "t",
    };
    const res = await validator.validate({ claims: [claim], hasRetrievedPassages: true, requireProductionAllowed: true });
    expect(res.status).toBe("UNSAFE_MOCK_AS_VERIFIED");
    expect(res.canShowAsVerified).toBe(false);
  });

  it("NEEDS_VERIFICATION when partially supported", async () => {
    const { legalSourceRepo, legalProvisionRepo } = await import("@/services/legal/repositories");
    const source = await legalSourceRepo.getById(TEST_FIXTURE_SOURCE.id!);
    const provisions = await legalProvisionRepo.getBySourceId(TEST_FIXTURE_SOURCE.id!);
    const good: LegalClaim = {
      id: "good",
      statement: provisions[0].text.slice(0, 60),
      sources: [source as never],
      provisionIds: [provisions[0].id],
      sourceIds: [source!.id],
      confidence: "high",
      verified: true,
      disclaimer: "t",
    };
    const bad: LegalClaim = {
      id: "bad",
      statement: "unsupported",
      sources: [],
      confidence: "unverified",
      verified: false,
      disclaimer: "t",
    };
    const res = await validator.validate({ claims: [good, bad], hasRetrievedPassages: true, requireProductionAllowed: false });
    expect(res.status).toBe("NEEDS_VERIFICATION");
  });

  it("fabricated citation cannot become verified", async () => {
    const fabricated: LegalClaim = {
      id: "fab",
      statement: "Fabricated law section 999 says ...",
      sources: [{ id: "fake_source", title: "Fake Act", isMock: false, verified: true } as never],
      provisionIds: ["fake_provision"],
      sourceIds: ["fake_source"],
      confidence: "high",
      verified: true,
      disclaimer: "t",
    };
    const res = await validator.validate({ claims: [fabricated], hasRetrievedPassages: true, requireProductionAllowed: true });
    expect(res.canShowAsVerified).toBe(false);
    expect(res.status).not.toBe("VERIFIED");
  });

  it("mock legal content cannot become verified in production", async () => {
    const { legalSourceRepo, legalProvisionRepo } = await import("@/services/legal/repositories");
    const source = await legalSourceRepo.getById(TEST_FIXTURE_SOURCE.id!);
    const provisions = await legalProvisionRepo.getBySourceId(TEST_FIXTURE_SOURCE.id!);
    // Try to claim with mock source but require production
    const claim: LegalClaim = {
      id: "mock_claim",
      statement: provisions[0].text.slice(0, 60),
      sources: [source as never],
      provisionIds: [provisions[0].id],
      sourceIds: [source!.id],
      confidence: "high",
      verified: true,
      isMock: false, // even if claim says not mock, source is mock
      disclaimer: "t",
    };
    const res = await validator.validate({ claims: [claim], hasRetrievedPassages: true, requireProductionAllowed: true });
    // Should be insufficient because verification will fail for production
    expect(res.canShowAsVerified).toBe(false);
  });
});
