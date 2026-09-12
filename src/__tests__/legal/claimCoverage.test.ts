import { describe, it, expect, beforeEach } from "vitest";
import { LegalSourceIngestionService } from "@/services/legal/ingestion.service";
import { ClaimCoverageService } from "@/services/legal/claimCoverage.service";
import { TEST_FIXTURE_SOURCE } from "@/data/testLegalFixtures";
import type { LegalClaim } from "@/types/domain";

describe("ClaimCoverage", () => {
  let svc: ClaimCoverageService;
  let sourceId: string;
  let provisionId: string;

  beforeEach(async () => {
    svc = new ClaimCoverageService();
    const ingestionGlobal = new LegalSourceIngestionService();
    const { legalSourceRepo, legalProvisionRepo } = await import("@/services/legal/repositories");
    await legalSourceRepo.deleteAll();
    await legalProvisionRepo.deleteAll();
    const resultGlobal = await ingestionGlobal.ingestSource(TEST_FIXTURE_SOURCE);
    sourceId = resultGlobal.source.id;
    provisionId = resultGlobal.provisions[0].id;
  });

  it("fully supported claims (all verified in test mode)", async () => {
    const { legalSourceRepo, legalProvisionRepo } = await import("@/services/legal/repositories");
    const globalSource = await legalSourceRepo.getById(sourceId);
    const prov = await legalProvisionRepo.getById(provisionId);
    const claim: LegalClaim = {
      id: "claim_1",
      statement: prov!.text.slice(0, 80),
      sources: [globalSource as never],
      provisionIds: [provisionId],
      sourceIds: [sourceId],
      confidence: "high",
      verified: true,
      disclaimer: "test",
    };
    // In non-production mode, test fixture can verify
    const coverage = await svc.compute([claim], { requireProductionAllowed: false });
    expect(coverage.totalClaims).toBe(1);
    expect(coverage.supportedClaims).toBe(1);
    expect(coverage.coverageRate).toBe(1);
  });

  it("partially supported answer", async () => {
    const { legalSourceRepo, legalProvisionRepo } = await import("@/services/legal/repositories");
    const globalSource = await legalSourceRepo.getById(sourceId);
    const prov = await legalProvisionRepo.getById(provisionId);
    const goodClaim: LegalClaim = {
      id: "good",
      statement: prov!.text.slice(0, 60),
      sources: [globalSource as never],
      provisionIds: [provisionId],
      sourceIds: [sourceId],
      confidence: "high",
      verified: true,
      disclaimer: "t",
    };
    const badClaim: LegalClaim = {
      id: "bad",
      statement: "Fabricated claim with no source",
      sources: [],
      confidence: "unverified",
      verified: false,
      disclaimer: "t",
    };
    const coverage = await svc.compute([goodClaim, badClaim], { requireProductionAllowed: false });
    expect(coverage.totalClaims).toBe(2);
    expect(coverage.supportedClaims).toBe(1);
    expect(coverage.unsupportedClaims).toBe(1);
    expect(coverage.coverageRate).toBe(0.5);
  });

  it("unsupported claim (no sources)", async () => {
    const badClaim: LegalClaim = {
      id: "bad",
      statement: "No grounding",
      sources: [],
      confidence: "unverified",
      verified: false,
      disclaimer: "t",
    };
    const coverage = await svc.compute([badClaim], { requireProductionAllowed: false });
    expect(coverage.supportedClaims).toBe(0);
    expect(coverage.coverageRate).toBe(0);
  });

  it("production mode: mock claims are never supported", async () => {
    const { legalSourceRepo } = await import("@/services/legal/repositories");
    const globalSource = await legalSourceRepo.getById(sourceId);
    const mockClaim: LegalClaim = {
      id: "mock",
      statement: "anything",
      sources: [globalSource as never],
      provisionIds: [provisionId],
      sourceIds: [sourceId],
      confidence: "high",
      verified: true,
      isMock: true,
      disclaimer: "t",
    };
    const coverage = await svc.compute([mockClaim], { requireProductionAllowed: true });
    // Even though source exists, production check will fail for mock
    expect(coverage.supportedClaims).toBe(0);
  });
});
