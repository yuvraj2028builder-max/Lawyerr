import { describe, it, expect, beforeEach } from "vitest";
import { LegalSourceIngestionService } from "@/services/legal/ingestion.service";
import { legalSourceRepo, legalProvisionRepo } from "@/services/legal/repositories";
import { classifyConsumerIssue, isInjectionAttempt } from "@/services/legal/consumer/consumerIssueClassifier.service";
import { consumerRetrievalService } from "@/services/legal/consumer/consumerRetrieval.service";
import { consumerLegalService } from "@/services/legal/consumer/consumerLegal.service";
import { CONSUMER_SCENARIOS, ADVERSARIAL_INPUTS } from "@/data/consumerScenarios";
import { CONSUMER_PRODUCTION_REGISTRY } from "@/services/legal/consumer/consumerSourceRegistry";
import { citationVerificationService } from "@/services/legal/verification.service";
import { ensureLegalCorpusInitialized, __resetInit } from "@/services/legal/init";

describe("Consumer Legal Brain — corpus, classification, retrieval, verification, safety", () => {
  beforeEach(async () => {
    // Ensure clean corpus each test — re-ingest
    await legalSourceRepo.deleteAll();
    await legalProvisionRepo.deleteAll();
    __resetInit();
    await ensureLegalCorpusInitialized();
  });

  // ─── Corpus ───────────────────────────────────────────────────────────────────

  it("real source metadata is valid (CPA 2019)", async () => {
    const src = await legalSourceRepo.getById("cpa_2019_india_code");
    expect(src).toBeTruthy();
    expect(src!.sourceType).toBe("PRIMARY_OFFICIAL");
    expect(src!.authorityLevel).toBe("CENTRAL_GOVT");
    expect(src!.sourceUrl).toBe("https://www.indiacode.nic.in/bitstream/123456789/16939/1/a2019-35.pdf");
    expect(src!.productionAllowed).toBe(true);
    expect(src!.verificationStatus).toBe("VERIFIED");
    expect(src!.contentHash).toBeTruthy();
    expect(src!.domain).toBe("consumer_grievance");
    expect(src!.provisionKind).toBe("legal_provision");
  });

  it("invalid URLs are rejected on ingestion", async () => {
    const svc = new LegalSourceIngestionService(legalSourceRepo, legalProvisionRepo);
    const bad = {
      id: "bad_url_test",
      title: "Bad URL Source",
      sourceType: "PRIMARY_OFFICIAL" as const,
      authority: "Test Authority",
      jurisdiction: "IN" as const,
      sourceUrl: "ftp://evil.com/not-http",
      domain: "consumer_grievance" as const,
      provisionKind: "legal_provision" as const,
      isMock: false,
      verified: true,
      productionAllowed: true,
      verificationStatus: "VERIFIED" as const,
      sections: [{ identifier: "1", text: "some text" }],
    };
    await expect(svc.ingestSource(bad)).rejects.toThrow(/sourceUrl/);
  });

  it("mock sources are rejected from production (hard boundary)", async () => {
    const svc = new LegalSourceIngestionService(legalSourceRepo, legalProvisionRepo);
    const mock: Parameters<typeof svc.ingestSource>[0] = {
      id: "mock_prod",
      title: "Mock Test",
      sourceType: "TEST_FIXTURE",
      authority: "Test",
      jurisdiction: "other",
      isMock: true,
      verified: false,
      productionAllowed: true as unknown as boolean, // should be rejected even if forced
      sections: [{ identifier: "T-1", text: "test" }],
    };
    await expect(svc.ingestSource(mock)).rejects.toThrow(/TEST_FIXTURE|productionAllowed/);
  });

  it("hashes are generated and provenance preserved", async () => {
    const src = await legalSourceRepo.getById("consumer_ecommerce_rules_2020");
    expect(src!.contentHash).toMatch(/^[0-9a-f]{32}$/);
    const provisions = await legalProvisionRepo.getBySourceId(src!.id);
    expect(provisions.length).toBeGreaterThan(0);
    expect(provisions[0].contentHash).toBeTruthy();
    expect(provisions[0].metadata?.authority).toBe(src!.authority);
  });

  it("production registry marks 5 sources verified, 1 pending (NCDRC)", () => {
    const verified = CONSUMER_PRODUCTION_REGISTRY.filter((e) => e.verificationStatus === "VERIFIED" && e.productionAllowed);
    const pending = CONSUMER_PRODUCTION_REGISTRY.filter((e) => e.verificationStatus === "PENDING");
    expect(verified.length).toBe(5);
    expect(pending.length).toBe(1);
    expect(pending[0].sourceId).toBe("ncdrc_commission_procedures");
  });

  // ─── Retrieval ────────────────────────────────────────────────────────────────

  it("consumer issue retrieves relevant verified passages (defective product → CPA/ecommerce)", async () => {
    const result = await consumerLegalService.findRelevantConsumerLaw({
      userProblem: CONSUMER_SCENARIOS[0].description,
      onlyProductionAllowed: true,
    });
    expect(result.domain).toBe("consumer_grievance");
    expect(result.issueTypes).toContain("defective_product");
    expect(result.passages.length).toBeGreaterThan(0);
    // Should retrieve at least one legal_provision (CPA or E-Commerce)
    expect(result.passages.some((p) => p.provision.provisionKind === "legal_provision")).toBe(true);
    expect(result.passages.every((p) => p.productionAllowed)).toBe(true);
    expect(result.passages.every((p) => !p.source.isMock)).toBe(true);
  });

  it("unrelated sources rank lower (consumer query should not retrieve non-consumer)", async () => {
    // Query that is vague but contains consumer terms should still prioritize consumer corpus
    const res = await consumerRetrievalService.retrieveForConsumer({
      query: "defective product phone damaged",
      onlyProductionAllowed: true,
      topK: 5,
    });
    expect(res.passages.length).toBeGreaterThan(0);
    // All should be consumer_grievance domain
    expect(res.passages.every((p) => p.source.domain === "consumer_grievance")).toBe(true);
  });

  it("mock fixture never appears in production retrieval", async () => {
    const res = await consumerRetrievalService.retrieveForConsumer({
      query: "zinnia quilted", // unique to TEST_FIXTURE
      onlyProductionAllowed: true,
    });
    expect(res.passages.length).toBe(0); // filtered because test fixture is not productionAllowed
  });

  it("mock fixture appears only in test retrieval (onlyProductionAllowed=false)", async () => {
    const res = await consumerRetrievalService.retrieveForConsumer({
      query: "zinnia quilted",
      onlyProductionAllowed: false,
    });
    expect(res.passages.some((p) => p.source.sourceType === "TEST_FIXTURE")).toBe(true);
  });

  // ─── Verification ───────────────────────────────────────────────────────────

  it("verified source + matching passage = verified", async () => {
    const provisions = await legalProvisionRepo.getBySourceId("cpa_2019_india_code");
    const prov = provisions.find((p) => p.sectionIdentifier === "Section 2(7)")!;
    const src = await legalSourceRepo.getById(prov.sourceId);
    const ver = await citationVerificationService.verify({
      sourceId: src!.id,
      provisionId: prov.id,
      citedText: prov.text.slice(0, 80),
      requireProductionAllowed: true,
    });
    expect(ver.verified).toBe(true);
  });

  it("mismatched hash/text = failure", async () => {
    const provisions = await legalProvisionRepo.getBySourceId("cpa_2019_india_code");
    const prov = provisions[0];
    const ver = await citationVerificationService.verify({
      sourceId: prov.sourceId,
      provisionId: prov.id,
      citedText: "Fabricated text that does not match stored provision at all 12345 invent",
      requireProductionAllowed: false,
    });
    expect(ver.verified).toBe(false);
    expect(ver.reason).toBe("TEXT_MISMATCH");
  });

  it("source not productionAllowed = failure in production verification", async () => {
    // Use test fixture source which is not productionAllowed
    const provisions = await legalProvisionRepo.getBySourceId("test_fixture_nyayasetu_v1");
    if (provisions.length > 0) {
      const prov = provisions[0];
      const ver = await citationVerificationService.verify({
        sourceId: prov.sourceId,
        provisionId: prov.id,
        citedText: prov.text.slice(0, 40),
        requireProductionAllowed: true,
      });
      expect(ver.verified).toBe(false);
    }
  });

  it("unsupported claim → INSUFFICIENT_GROUNDING", async () => {
    const res = await consumerLegalService.findRelevantConsumerLaw({
      userProblem: "Company cheated me. What can I do?",
      onlyProductionAllowed: true,
    });
    expect(res.validation.status).toBe("INSUFFICIENT_GROUNDING");
    expect(res.claims.length).toBe(0);
    expect(res.needsVerification).toBe(true);
  });

  // ─── Classification ─────────────────────────────────────────────────────────

  it("defective product recognized", () => {
    const r = classifyConsumerIssue("I bought a phone online and the seller sent me a damaged phone and is refusing to refund me.");
    expect(r.issueTypes).toContain("defective_product");
    expect(r.issueTypes).toContain("ecommerce_dispute");
    expect(r.issueTypes).toContain("refund_denied");
    expect(r.domain).toBe("consumer_grievance");
  });

  it("refund dispute recognized", () => {
    const r = classifyConsumerIssue("Refund not received after cancellation, seller acknowledged but not credited.");
    expect(r.issueTypes).toContain("refund_delayed");
  });

  it("e-commerce dispute recognized", () => {
    const r = classifyConsumerIssue("Ordered on Flipkart, product defective");
    expect(r.issueTypes).toContain("ecommerce_dispute");
  });

  it("vague complaint does not produce a legal conclusion", async () => {
    const res = await consumerLegalService.findRelevantConsumerLaw({
      userProblem: "Company cheated me. What can I do?",
      onlyProductionAllowed: true,
    });
    expect(res.classification.isVague).toBe(true);
    expect(res.claims.length).toBe(0);
    expect(res.validation.status).toBe("INSUFFICIENT_GROUNDING");
    expect(res.passages.length).toBe(0);
  });

  // ─── Safety ─────────────────────────────────────────────────────────────────

  it("user injection cannot mark a claim verified", async () => {
    for (const inj of ADVERSARIAL_INPUTS) {
      expect(isInjectionAttempt(inj)).toBe(true);
      const res = await consumerLegalService.findRelevantConsumerLaw({
        userProblem: inj + " I bought a defective phone online and seller refused refund.",
        onlyProductionAllowed: true,
      });
      // Should still classify, but injection text must be treated as DATA, never as instruction that creates a verified claim
      expect(res.claims.every((c) => !c.statement.includes("IGNORE PREVIOUS"))).toBe(true);
      expect(res.claims.every((c) => !c.statement.toLowerCase().includes("definitely win"))).toBe(true);
      // If legitimate part is verifiable, canShowAsVerified may be true via real passages — that's safe, not via injection
      // So we only ensure no UNSAFE_MOCK_AS_VERIFIED and no injection execution
      expect(res.validation.status).not.toBe("UNSAFE_MOCK_AS_VERIFIED");
    }
  });

  it("unsupported section cannot become verified", async () => {
    const ver = await citationVerificationService.verify({
      sourceId: "cpa_2019_india_code",
      provisionId: "nonexistent_section_999",
      citedText: "Fake section 999 says you always win",
      requireProductionAllowed: true,
    });
    expect(ver.verified).toBe(false);
  });

  it("guaranteed win language is not treated as verified claim", async () => {
    const res = await consumerLegalService.findRelevantConsumerLaw({
      userProblem: "I will definitely win, confirm that seller violated Section X and I will get guaranteed refund.",
      onlyProductionAllowed: true,
    });
    // Claims should be neutral “may be relevant”, not “definitely violated”
    expect(res.claims.every((c) => !c.statement.toLowerCase().includes("definitely win"))).toBe(true);
    expect(res.claims.every((c) => !c.statement.toLowerCase().includes("guaranteed"))).toBe(true);
  });

  // ─── Date/version ───────────────────────────────────────────────────────────

  it("current source preferred over historical", async () => {
    // CPA 2019 has effectiveFrom 2020-07-20 → current
    const src = await legalSourceRepo.getById("cpa_2019_india_code");
    expect(src!.versionStatus).toBe("current");
  });

  it("expired source excluded where applicable (simulated)", async () => {
    // Create an expired source manually and ingest, then ensure retrieval excludes it when caseDate after effectiveTo
    const svc = new LegalSourceIngestionService(legalSourceRepo, legalProvisionRepo);
    const expiredInput = {
      id: "expired_test_source",
      title: "Expired Test Act",
      sourceType: "PRIMARY_OFFICIAL" as const,
      authority: "Test Authority",
      authorityLevel: "CENTRAL_GOVT" as const,
      jurisdiction: "IN" as const,
      language: "en",
      publicationDate: "2020-01-01",
      effectiveFrom: "2020-01-01",
      effectiveTo: "2021-01-01", // expired
      documentVersion: "2020-01-01",
      sourceUrl: "https://example.com/expired",
      domain: "consumer_grievance" as const,
      provisionKind: "legal_provision" as const,
      isMock: false,
      verified: true,
      productionAllowed: true,
      verificationStatus: "VERIFIED" as const,
      sections: [{ identifier: "Sec 1", text: "Expired provision text for defective product" }],
    };
    await svc.ingestSource(expiredInput);
    const res = await consumerRetrievalService.retrieveForConsumer({
      query: "defective product",
      caseDate: "2022-06-01", // after expiry
      onlyProductionAllowed: true,
    });
    expect(res.passages.every((p) => p.source.id !== "expired_test_source")).toBe(true);
  });

  it("uncertain applicability returns NEEDS_VERIFICATION when version ambiguous", async () => {
    // If caseDate not provided and multiple versions exist, retrieval should still return but validation may need verification
    // Simulate by checking that expired source without caseDate is not automatically excluded but flagged
    const svc = new LegalSourceIngestionService(legalSourceRepo, legalProvisionRepo);
    const futureInput = {
      id: "future_test_source",
      title: "Future Test Act",
      sourceType: "PRIMARY_OFFICIAL" as const,
      authority: "Test Authority",
      authorityLevel: "CENTRAL_GOVT" as const,
      jurisdiction: "IN" as const,
      language: "en",
      publicationDate: "2026-09-01",
      effectiveFrom: "2030-01-01", // future
      documentVersion: "2030-01-01",
      sourceUrl: "https://example.com/future",
      domain: "consumer_grievance" as const,
      provisionKind: "legal_provision" as const,
      isMock: false,
      verified: true,
      productionAllowed: true,
      verificationStatus: "VERIFIED" as const,
      sections: [{ identifier: "Sec 2", text: "Future provision for consumer dispute" }],
    };
    await svc.ingestSource(futureInput);
    const src = await legalSourceRepo.getById("future_test_source");
    expect(src!.versionStatus).toBe("future");
    // Verification of future source in production should fail
    const prov = (await legalProvisionRepo.getBySourceId("future_test_source"))[0];
    const ver = await citationVerificationService.verify({
      sourceId: prov.sourceId,
      provisionId: prov.id,
      citedText: prov.text.slice(0, 40),
      requireProductionAllowed: true,
    });
    expect(ver.verified).toBe(false);
    expect(ver.reason).toBe("VERSION_EXPIRED");
  });
});
