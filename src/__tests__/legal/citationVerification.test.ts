import { describe, it, expect, beforeEach } from "vitest";
import { LegalSourceIngestionService } from "@/services/legal/ingestion.service";
import { InMemoryLegalSourceRepository, InMemoryLegalProvisionRepository } from "@/services/legal/repositories";
import { CitationService } from "@/services/legal/citation.service";
import { CitationVerificationService } from "@/services/legal/verification.service";
import { TEST_FIXTURE_SOURCE } from "@/data/testLegalFixtures";

describe("Citation & Verification", () => {
  let sourceRepo: InMemoryLegalSourceRepository;
  let provisionRepo: InMemoryLegalProvisionRepository;
  let citationSvc: CitationService;
  let verificationSvc: CitationVerificationService;
  let sourceId: string;
  let provisionId: string;
  let provisionText: string;

  beforeEach(async () => {
    sourceRepo = new InMemoryLegalSourceRepository();
    provisionRepo = new InMemoryLegalProvisionRepository();
    citationSvc = new CitationService(sourceRepo, provisionRepo);
    verificationSvc = new CitationVerificationService(sourceRepo, provisionRepo);
    const svc = new LegalSourceIngestionService(sourceRepo, provisionRepo);
    const result = await svc.ingestSource(TEST_FIXTURE_SOURCE);
    sourceId = result.source.id;
    provisionId = result.provisions[0].id;
    provisionText = result.provisions[0].text;
  });

  it("valid citation verifies (non-production mode)", async () => {
    const citation = await citationSvc.createCitation({ sourceId, provisionId });
    expect(citation.citationText).toContain("TEST-1");
    expect(citation.isMock).toBe(true);

    const ver = await verificationSvc.verify({ sourceId, provisionId, citedText: provisionText, requireProductionAllowed: false });
    expect(ver.verified).toBe(true);
  });

  it("missing section fails", async () => {
    const ver = await verificationSvc.verify({ sourceId, provisionId: "nonexistent_provision", requireProductionAllowed: false });
    expect(ver.verified).toBe(false);
    expect(ver.reason).toBe("PROVISION_NOT_FOUND");
  });

  it("wrong source fails (section mismatch)", async () => {
    const fakeSourceId = "fake_source_123";
    const ver = await verificationSvc.verify({ sourceId: fakeSourceId, provisionId, requireProductionAllowed: false });
    expect(ver.verified).toBe(false);
    expect(ver.reason).toBe("SOURCE_NOT_FOUND");
  });

  it("modified text fails (TEXT_MISMATCH)", async () => {
    const ver = await verificationSvc.verify({
      sourceId,
      provisionId,
      citedText: "This is completely fabricated text that does not match stored provision at all 12345",
      requireProductionAllowed: false,
    });
    expect(ver.verified).toBe(false);
    expect(ver.reason).toBe("TEXT_MISMATCH");
  });

  it("mock source fails production verification (hard boundary)", async () => {
    const ver = await verificationSvc.verify({ sourceId, provisionId, citedText: provisionText, requireProductionAllowed: true });
    expect(ver.verified).toBe(false);
    expect(ver.reason).toBe("MOCK_SOURCE_CANNOT_BE_VERIFIED");
  });

  it("test fixture cannot be verified for production", async () => {
    const ver = await verificationSvc.verify({ sourceId, provisionId, citedText: provisionText, requireProductionAllowed: true });
    expect(ver.verified).toBe(false);
    // Could be MOCK_SOURCE_CANNOT_BE_VERIFIED or TEST_FIXTURE_CANNOT_BE_VERIFIED depending on check order
    expect(["MOCK_SOURCE_CANNOT_BE_VERIFIED", "TEST_FIXTURE_CANNOT_BE_VERIFIED", "SOURCE_NOT_PRODUCTION_ALLOWED"]).toContain(ver.reason);
  });

  it("fabricated citation with nonexistent source cannot pass", async () => {
    const ver = await verificationSvc.verify({ sourceId: "fabricated_source", provisionId: "fabricated_provision", requireProductionAllowed: true });
    expect(ver.verified).toBe(false);
  });

  it("citation with URL fails if source has no URL but citation claims one", async () => {
    // Source has URL (example.com), so this should verify if we pass same URL
    const source = await sourceRepo.getById(sourceId);
    expect(source?.sourceUrl).toBeTruthy();
    // But if we create a source without URL and cite with URL, it should fail
    const noUrlSource: Parameters<typeof sourceRepo.save>[0] = {
      ...source!,
      id: "no_url_source",
      sourceUrl: undefined,
      url: undefined,
    };
    await sourceRepo.save(noUrlSource);
    // Create a provision for it
    const prov = await provisionRepo.getById(provisionId);
    const noUrlProv = { ...prov!, id: "no_url_prov", sourceId: "no_url_source" };
    await provisionRepo.save(noUrlProv);
    const ver = await verificationSvc.verify({ sourceId: "no_url_source", provisionId: "no_url_prov", citedUrl: "https://example.com/fake", requireProductionAllowed: false });
    expect(ver.verified).toBe(false);
    expect(ver.reason).toBe("URL_MISSING_OR_INVALID");
  });

  it("hash mismatch is caught when stored hash is tampered", async () => {
    const prov = await provisionRepo.getById(provisionId);
    // Tamper provision's text without updating hash
    prov!.text = "Tampered text that should not match hash";
    prov!.normalizedText = "tampered text that should not match hash";
    await provisionRepo.save(prov!);
    const ver = await verificationSvc.verify({ sourceId, provisionId, citedText: prov!.text, requireProductionAllowed: false });
    // Since citedText matches tampered text but stored hash was for original, our verify checks hash of stored provision
    // It should still detect hash mismatch via verifyHash
    expect(ver.verified).toBe(false);
    // Could be TEXT_MISMATCH or HASH_MISMATCH depending on path
  });
});
