import { describe, it, expect, beforeEach } from "vitest";
import { LegalRetriever } from "@/services/legal/retriever.service";
import { LegalSourceIngestionService } from "@/services/legal/ingestion.service";
import { InMemoryLegalSourceRepository, InMemoryLegalProvisionRepository } from "@/services/legal/repositories";
import { TEST_FIXTURE_SOURCE } from "@/data/testLegalFixtures";

describe("LegalRetriever", () => {
  let sourceRepo: InMemoryLegalSourceRepository;
  let provisionRepo: InMemoryLegalProvisionRepository;
  let retriever: LegalRetriever;
  let ingestion: LegalSourceIngestionService;

  beforeEach(async () => {
    sourceRepo = new InMemoryLegalSourceRepository();
    provisionRepo = new InMemoryLegalProvisionRepository();
    ingestion = new LegalSourceIngestionService(sourceRepo, provisionRepo);
    retriever = new LegalRetriever(sourceRepo, provisionRepo);
    await ingestion.ingestSource(TEST_FIXTURE_SOURCE);
  });

  it("retrieves relevant test fixture when querying unique tokens (zinnia quilted → TEST-1)", async () => {
    const result = await retriever.retrieve({ query: "zinnia quilted" });
    expect(result.passages.length).toBeGreaterThan(0);
    expect(result.passages[0].provision.sectionIdentifier).toBe("TEST-1");
    expect(result.passages[0].relevanceScore).toBeGreaterThan(0);
    expect(result.passages[0].source.isMock).toBe(true);
  });

  it("ranks irrelevant content lower (marmalade beta should hit TEST-2 first)", async () => {
    const result = await retriever.retrieve({ query: "marmalade beta" });
    expect(result.passages[0].provision.sectionIdentifier).toBe("TEST-2");
    // Ensure TEST-1 is not top for this query
    if (result.passages.length > 1) {
      expect(result.passages[1].provision.sectionIdentifier).not.toBe("TEST-2");
    }
  });

  it("exact section lookup works with relevance 1.0", async () => {
    const srcId = TEST_FIXTURE_SOURCE.id!;
    const passage = await retriever.retrieveExact(srcId, "TEST-SECTION-42");
    expect(passage).not.toBeNull();
    expect(passage!.provision.sectionIdentifier).toBe("TEST-SECTION-42");
    expect(passage!.relevanceScore).toBe(1.0);
    expect(passage!.strategy).toBe("exact_section");
  });

  it("exact lookup returns null for missing section", async () => {
    const passage = await retriever.retrieveExact(TEST_FIXTURE_SOURCE.id!, "NONEXISTENT");
    expect(passage).toBeNull();
  });

  it("onlyProductionAllowed filters out test fixtures", async () => {
    const result = await retriever.retrieve({ query: "zinnia", onlyProductionAllowed: true });
    expect(result.passages.length).toBe(0);
  });

  it("returns empty honest result for irrelevant query", async () => {
    const result = await retriever.retrieve({ query: "completely unrelated query xyz123" });
    // May return 0 or low-score passages, but should not hallucinate
    // Our scorer returns 0 for no token overlap → empty
    expect(result.passages.length).toBe(0);
    expect(result.query).toBe("completely unrelated query xyz123");
  });

  it("does not expose fake scores as calibrated — scores are internal 0-1", async () => {
    const result = await retriever.retrieve({ query: "zinnia" });
    result.passages.forEach((p) => {
      expect(p.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(p.relevanceScore).toBeLessThanOrEqual(1);
    });
  });
});
