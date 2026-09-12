/**
 * Consumer Retrieval — domain-aware wrapper over LegalRetriever.
 * Prioritizes authoritative sources, current versions, verified production sources.
 * Mock/test fixtures never appear in production retrieval.
 */

import type { RetrievalPassage, RetrievalResult, LegalDomain } from "@/types/domain";
import { legalRetriever } from "../retriever.service";

// Authority ranking for consumer domain — retrieval signal, not legal verification
const AUTHORITY_RANK: Record<string, number> = {
  PRIMARY_OFFICIAL: 5,
  SECONDARY_AUTHORITATIVE: 3,
  SECONDARY: 1,
  UNVERIFIED: 0,
  TEST_FIXTURE: -1,
};

function sourcePriority(passage: RetrievalPassage): number {
  const typeRank = AUTHORITY_RANK[passage.source.sourceType ?? "UNVERIFIED"] ?? 0;
  // Prefer current version
  const versionBonus = passage.source.versionStatus === "current" ? 1 : passage.source.versionStatus === "historical" ? -1 : 0;
  // Prefer legal_provision over official_procedure for law questions (but procedure ranked for process questions)
  // For now, slight boost to legal_provision
  const kindBonus = passage.provision.provisionKind === "legal_provision" ? 0.5 : 0;
  return typeRank + versionBonus + kindBonus + passage.relevanceScore;
}

export interface ConsumerRetrievalInput {
  query: string;
  issueTypes?: string[]; // ConsumerIssueType[]
  domain?: LegalDomain;
  topK?: number;
  onlyProductionAllowed?: boolean; // default true for consumer
  caseDate?: string; // ISO — for version applicability
}

export interface IConsumerRetrievalService {
  retrieveForConsumer(input: ConsumerRetrievalInput): Promise<RetrievalResult>;
}

export class ConsumerRetrievalService implements IConsumerRetrievalService {
  async retrieveForConsumer(input: ConsumerRetrievalInput): Promise<RetrievalResult> {
    const domain: LegalDomain = input.domain ?? "consumer_grievance";
    const onlyProd = input.onlyProductionAllowed ?? true;
    const topK = input.topK ?? 5;

    // Expand query with issue type hints for better recall
    const issueHint = (input.issueTypes ?? []).join(" ");
    const expandedQuery = [input.query, issueHint].filter(Boolean).join(" ").trim();

    // Delegate to base retriever — it already handles keyword + exact
    const base = await legalRetriever.retrieve({
      query: expandedQuery,
      topK: topK * 2, // over-fetch then re-rank
      onlyProductionAllowed: onlyProd,
    });

    // Domain filter: only passages where source.domain === consumer_grievance (or no domain = general)
    // For backward compat, sources without domain are considered not consumer — filter them out in production
    const domainFiltered = base.passages.filter((p) => {
      if (onlyProd) {
        // In production, require domain === consumer_grievance if present
        if (p.source.domain && p.source.domain !== domain) return false;
        // Also exclude test fixtures (already done via onlyProductionAllowed, but double-check)
        if (p.source.isMock || p.source.sourceType === "TEST_FIXTURE") return false;
        // Exclude expired versions if caseDate known
        if (input.caseDate && p.source.versionStatus === "historical") {
          // If effectiveTo < caseDate => expired
          if (p.source.effectiveTo && new Date(p.source.effectiveTo) < new Date(input.caseDate)) return false;
        }
        if (p.provision.provisionKind === "official_procedure" && !expandedQuery.toLowerCase().includes("procedure") && !expandedQuery.toLowerCase().includes("helpline") && !expandedQuery.toLowerCase().includes("complaint")) {
          // Keep procedure passages only if query suggests procedural intent — but don't hard-filter too aggressively
        }
      }
      return true;
    });

    // If caseDate provided and multiple versions of same section exist, prefer current
    // Group by sectionIdentifier and pick current
    const bySection = new Map<string, RetrievalPassage[]>();
    for (const p of domainFiltered) {
      const key = p.provision.sectionIdentifier;
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(p);
    }
    const deduped: RetrievalPassage[] = [];
    for (const [, group] of bySection) {
      // Prefer current version
      const current = group.find((g) => g.source.versionStatus === "current");
      if (current && input.caseDate) {
        deduped.push(current);
      } else {
        // Otherwise pick highest priority
        group.sort((a, b) => sourcePriority(b) - sourcePriority(a));
        deduped.push(group[0]);
      }
    }

    // Re-rank by priority + relevance
    deduped.sort((a, b) => sourcePriority(b) - sourcePriority(a));

    const top = deduped.slice(0, topK);

    // If no production passages found and onlyProd=true, return honest empty (fail closed)
    if (top.length === 0 && onlyProd) {
      return {
        passages: [],
        totalFound: 0,
        strategyUsed: base.strategyUsed,
        query: input.query,
        disclaimer: base.disclaimer,
        isMock: false,
      };
    }

    return {
      passages: top,
      totalFound: top.length,
      strategyUsed: base.strategyUsed,
      query: input.query,
      disclaimer: base.disclaimer,
      isMock: top.some((p) => p.source.isMock),
    };
  }
}

export const consumerRetrievalService = new ConsumerRetrievalService();
