/**
 * LegalRetriever — supports multiple strategies, all deterministic for now.
 * Strategies: exact_section | keyword (BM25-lite) | hybrid | semantic (stub)
 *
 * Retrieval NEVER fabricates. It only returns passages already stored via
 * ingestion. Future vector retrieval can be added behind the same interface.
 */

import type { LegalProvision, RetrievalPassage, RetrievalResult, RetrievalStrategy } from "@/types/domain";
import { normalizeText } from "./normalize";
import { legalSourceRepo, legalProvisionRepo } from "./repositories";
import type { ILegalSourceRepository, ILegalProvisionRepository } from "./repositories";

export interface RetrievalOptions {
  query: string;
  strategy?: RetrievalStrategy; // default auto
  topK?: number; // default 5
  onlyProductionAllowed?: boolean; // default false for tests, true for prod answers
  exactSectionId?: string; // if provided, exact lookup takes precedence
  sourceId?: string; // limit to source
}

export interface ILegalRetriever {
  retrieve(opts: RetrievalOptions): Promise<RetrievalResult>;
  retrieveExact(sourceId: string, sectionId: string): Promise<RetrievalPassage | null>;
  keywordSearch(query: string, topK?: number, onlyProduction?: boolean): Promise<RetrievalPassage[]>;
}

function scoreKeyword(queryNorm: string, prov: LegalProvision): number {
  // BM25-lite: token overlap + phrase bonus + title bonus
  const qTokens = queryNorm.split(/\W+/).filter(Boolean);
  const pNorm = prov.normalizedText;
  const headingNorm = (prov.heading ?? "").toLowerCase();
  let score = 0;
  for (const tok of qTokens) {
    if (pNorm.includes(tok)) score += 1;
    if (headingNorm.includes(tok)) score += 1.5;
    if (prov.sectionIdentifier.toLowerCase().includes(tok)) score += 2;
  }
  // Phrase bonus
  if (qTokens.length > 1 && pNorm.includes(queryNorm)) score += 2;
  // Normalize 0-1-ish (not calibrated, internal)
  const maxPossible = qTokens.length * 2 + 2;
  return Math.min(1, score / Math.max(1, maxPossible));
}

export class LegalRetriever implements ILegalRetriever {
  constructor(
    private sourceRepo: ILegalSourceRepository = legalSourceRepo,
    private provisionRepo: ILegalProvisionRepository = legalProvisionRepo
  ) {}

  async retrieveExact(sourceId: string, sectionId: string): Promise<RetrievalPassage | null> {
    const prov = await this.provisionRepo.getBySection(sourceId, sectionId);
    if (!prov) return null;
    const source = await this.sourceRepo.getById(prov.sourceId);
    if (!source) return null;
    return {
      source,
      provision: prov,
      relevanceScore: 1.0,
      strategy: "exact_section",
      snippet: prov.text.slice(0, 400),
      verified: source.verified && !source.isMock,
      productionAllowed: source.productionAllowed === true,
    };
  }

  async keywordSearch(query: string, topK = 5, onlyProduction = false): Promise<RetrievalPassage[]> {
    const qNorm = normalizeText(query);
    if (!qNorm) return [];
    const allProvisions = await this.provisionRepo.listAll();
    const filtered = onlyProduction ? allProvisions.filter((p) => p.productionAllowed) : allProvisions;

    const scored = await Promise.all(
      filtered.map(async (prov) => {
        const score = scoreKeyword(qNorm, prov);
        const source = await this.sourceRepo.getById(prov.sourceId);
        if (!source) return null;
        if (onlyProduction && !source.productionAllowed) return null;
        return {
          provision: prov,
          source,
          score,
        };
      })
    );

    const viable = scored.filter((x): x is NonNullable<typeof x> => !!x && x.score > 0);
    viable.sort((a, b) => b.score - a.score);
    const top = viable.slice(0, topK);
    return top.map(({ provision, source, score }) => ({
      source,
      provision,
      relevanceScore: Number(score.toFixed(3)),
      strategy: "keyword" as const,
      snippet: provision.text.slice(0, 400),
      verified: source.verified && !source.isMock,
      productionAllowed: source.productionAllowed === true,
    }));
  }

  async retrieve(opts: RetrievalOptions): Promise<RetrievalResult> {
    const query = opts.query?.trim() ?? "";
    const topK = opts.topK ?? 5;
    const onlyProd = opts.onlyProductionAllowed ?? false;
    const disclaimer = "This information is based on the sources available to NyayaSetu and is not a substitute for advice from a qualified lawyer.";

    // No query → empty honest result
    if (!query && !opts.exactSectionId) {
      return {
        passages: [],
        totalFound: 0,
        strategyUsed: "keyword",
        query,
        disclaimer,
        isMock: true,
      };
    }

    // Exact lookup has priority
    if (opts.exactSectionId && opts.sourceId) {
      const exact = await this.retrieveExact(opts.sourceId, opts.exactSectionId);
      if (exact) {
        if (onlyProd && !exact.productionAllowed) {
          return { passages: [], totalFound: 0, strategyUsed: "exact_section", query, disclaimer, isMock: false };
        }
        return { passages: [exact], totalFound: 1, strategyUsed: "exact_section", query, disclaimer, isMock: exact.source.isMock };
      }
      // fall through to keyword if not found
    }

    // Try exact section id across all sources if query looks like a section ref
    if (!opts.sourceId && opts.exactSectionId) {
      const all = await this.provisionRepo.listAll();
      const match = all.find((p) => p.sectionIdentifier.toLowerCase() === opts.exactSectionId!.toLowerCase());
      if (match) {
        const src = await this.sourceRepo.getById(match.sourceId);
        if (src) {
          if (onlyProd && !src.productionAllowed) {
            return { passages: [], totalFound: 0, strategyUsed: "exact_section", query, disclaimer, isMock: false };
          }
          return {
            passages: [
              {
                source: src,
                provision: match,
                relevanceScore: 1.0,
                strategy: "exact_section",
                snippet: match.text.slice(0, 400),
                verified: src.verified && !src.isMock,
                productionAllowed: src.productionAllowed === true,
              },
            ],
            totalFound: 1,
            strategyUsed: "exact_section",
            query,
            disclaimer,
            isMock: src.isMock,
          };
        }
      }
    }

    // Keyword search
    const passages = await this.keywordSearch(query, topK, onlyProd);
    const isMock = passages.length > 0 ? passages[0].source.isMock : false;
    // Hybrid stub: if keyword finds little, we would add semantic later — for now return keyword
    const strategy: RetrievalStrategy = opts.strategy ?? "keyword";
    return {
      passages,
      totalFound: passages.length,
      strategyUsed: strategy,
      query,
      disclaimer,
      isMock,
    };
  }
}

export const legalRetriever = new LegalRetriever();
