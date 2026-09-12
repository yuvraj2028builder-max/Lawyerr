/**
 * Legal corpus initialization — ingests TEST FIXTURE + real consumer production corpus.
 * Real Indian law corpus uses exact official text from authoritative sources (indiacode, consumeraffairs).
 * Test fixture remains synthetic and never production-allowed.
 */

import { ingestionService } from "./ingestion.service";
import { legalSourceRepo } from "./repositories";
import { TEST_FIXTURE_SOURCE } from "@/data/testLegalFixtures";
import {
  CPA_2019_SOURCE,
  ECOMMERCE_RULES_2020_SOURCE,
  DIRECT_SELLING_RULES_2021_SOURCE,
  NCH_EJAGRITI_PROCEDURE_SOURCE,
  DEPT_CONSUMER_AFFAIRS_PROCEDURE_SOURCE,
} from "@/data/consumerCorpus";

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureLegalCorpusInitialized(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const existing = await legalSourceRepo.listAll();
    if (existing.length > 0) {
      initialized = true;
      return;
    }
    // Ingest synthetic test fixture (clearly labelled, not law)
    try {
      await ingestionService.ingestSource(TEST_FIXTURE_SOURCE);
    } catch (e) {
      console.warn("[NyayaSetu] Failed to ingest test fixture", e);
    }
    // Ingest real consumer production corpus — exact official text, verified
    const productionSources = [
      CPA_2019_SOURCE,
      ECOMMERCE_RULES_2020_SOURCE,
      DIRECT_SELLING_RULES_2021_SOURCE,
      NCH_EJAGRITI_PROCEDURE_SOURCE,
      DEPT_CONSUMER_AFFAIRS_PROCEDURE_SOURCE,
    ];
    for (const src of productionSources) {
      try {
        await ingestionService.ingestSource(src);
      } catch (e) {
        console.warn(`[NyayaSetu] Failed to ingest ${src.id}`, e);
      }
    }
    initialized = true;
  })();

  return initPromise;
}

// For tests: reset flag
export function __resetInit(): void {
  initialized = false;
  initPromise = null;
}
