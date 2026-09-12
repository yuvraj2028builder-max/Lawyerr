import { describe, it, expect, beforeEach } from "vitest";
import { LegalSourceIngestionService } from "@/services/legal/ingestion.service";
import { InMemoryLegalSourceRepository, InMemoryLegalProvisionRepository } from "@/services/legal/repositories";
import { TEST_FIXTURE_SOURCE } from "@/data/testLegalFixtures";

describe("LegalSourceIngestionService", () => {
  let sourceRepo: InMemoryLegalSourceRepository;
  let provisionRepo: InMemoryLegalProvisionRepository;
  let svc: LegalSourceIngestionService;

  beforeEach(() => {
    sourceRepo = new InMemoryLegalSourceRepository();
    provisionRepo = new InMemoryLegalProvisionRepository();
    svc = new LegalSourceIngestionService(sourceRepo, provisionRepo);
  });

  it("accepts a valid TEST_FIXTURE source (isMock=true, productionAllowed=false)", async () => {
    const result = await svc.ingestSource(TEST_FIXTURE_SOURCE);
    expect(result.source.isMock).toBe(true);
    expect(result.source.productionAllowed).toBe(false);
    expect(result.source.sourceType).toBe("TEST_FIXTURE");
    expect(result.provisions.length).toBe(TEST_FIXTURE_SOURCE.sections.length);
    expect(result.source.contentHash).toBeTruthy();
    // chunk retains hierarchy
    const first = result.provisions[0];
    expect(first.sectionIdentifier).toBe("TEST-1");
    expect(first.heading).toBe("Example Provision Alpha — Synthetic");
    expect(first.contentHash).toBeTruthy();
    expect(first.productionAllowed).toBe(false);
    expect(first.isMock).toBe(true);
  });

  it("rejects mock source that claims productionAllowed=true (hard safety boundary)", async () => {
    const bad = { ...TEST_FIXTURE_SOURCE, id: "bad_1", productionAllowed: true as const };
    await expect(svc.ingestSource(bad)).rejects.toThrow(/productionAllowed/);
  });

  it("rejects TEST_FIXTURE with productionAllowed=true", async () => {
    const bad = { ...TEST_FIXTURE_SOURCE, id: "bad_2", sourceType: "TEST_FIXTURE" as const, productionAllowed: true as const, verified: true as const, isMock: false as const };
    // Even if isMock false, TEST_FIXTURE cannot be production
    await expect(svc.ingestSource(bad)).rejects.toThrow(/TEST_FIXTURE/);
  });

  it("rejects UNVERIFIED with productionAllowed=true", async () => {
    const bad = { ...TEST_FIXTURE_SOURCE, id: "bad_3", sourceType: "UNVERIFIED" as const, productionAllowed: true as const, verified: false as const };
    await expect(svc.ingestSource(bad)).rejects.toThrow(/UNVERIFIED/);
  });

  it("chunking preserves legal structure and metadata", async () => {
    const result = await svc.ingestSource(TEST_FIXTURE_SOURCE);
    const prov = result.provisions.find((p) => p.sectionIdentifier === "TEST-3")!;
    expect(prov.chapter).toBe("Chapter Test-B");
    expect(prov.actTitle).toBe("TEST ACT — NOT REAL LAW");
    expect(prov.metadata?.authority).toBe("NyayaSetu Test Authority — NOT A GOVERNMENT BODY");
  });

  it("validates sourceUrl must be http(s) if provided", async () => {
    const bad = { ...TEST_FIXTURE_SOURCE, id: "bad_4", sourceUrl: "ftp://evil.com" };
    await expect(svc.ingestSource(bad)).rejects.toThrow(/sourceUrl/);
  });

  it("warns on suspicious instruction-like content but still ingests (as DATA)", async () => {
    const result = await svc.ingestSource(TEST_FIXTURE_SOURCE);
    expect(result.warnings.some((w) => w.includes("TEST-3"))).toBe(true);
  });

  it("computes versionStatus from effective dates", async () => {
    const src = { ...TEST_FIXTURE_SOURCE, id: "ver_test", effectiveFrom: "2026-01-01" };
    const result = await svc.ingestSource(src);
    expect(result.source.versionStatus).toBe("current");
  });
});
