/**
 * LegalKnowledgeService — abstraction for future verified legal retrieval.
 *
 * CRITICAL SAFETY:
 * - Never return fake citations, sections, or case law.
 * - Every result must carry `isMock`, `verified`, `confidence`, source metadata.
 * - Callers must render disclaimer when isMock === true.
 *
 * Real implementation will later query:
 *   - Primary statute DB (India Code, etc.)
 *   - Vector retrieval with citation validation
 *   - Confidence scoring
 */

import type { LegalSource, LegalClaim, RetrievalConfidence, RetrievalResult, RetrievalPassage } from "@/types/domain";

// ─── Request / Response Types ─────────────────────────────────────────────────

export interface LegalSearchParams {
  query: string;
  problemCategory?: string;
  jurisdiction?: "IN" | "IN-State";
  language?: "en" | "hi";
  // Prompt 2: allow caller to request only production-verified passages
  onlyProductionAllowed?: boolean;
  topK?: number;
}

export interface LegalSearchResult {
  claims: LegalClaim[];
  sources: LegalSource[];
  confidence: RetrievalConfidence;
  /** Human-readable note if retrieval unavailable */
  note?: string;
  isMock: boolean;
  disclaimer: string;
  // Prompt 2 — structured retrieval
  retrieval?: RetrievalResult;
  passages?: RetrievalPassage[];
}

export interface LegalRetrieveParams {
  sourceId: string;
}

export type CitationStyle = "inline" | "footnote";

export interface CitationResult {
  citationText: string;
  source: LegalSource;
  style: CitationStyle;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ILegalKnowledgeService {
  /** Search verified legal sources */
  search(params: LegalSearchParams): Promise<LegalSearchResult>;
  /** Retrieve a specific primary source by ID */
  retrieve(params: LegalRetrieveParams): Promise<LegalSource | null>;
  /** Format citation */
  cite(source: LegalSource, style?: CitationStyle): CitationResult;
  /** Verify a claim against trusted sources */
  verify(claim: string): Promise<LegalClaim>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const LEGAL_DISCLAIMER =
  "I don't have verified legal information for this yet. This is general information only, not legal advice. Please consult a qualified lawyer or your District Legal Services Authority (DLSA) for your situation.";

export const MOCK_LEGAL_NOTE =
  "[MOCK] Legal retrieval is not yet connected to verified primary sources. This placeholder shows the interface shape. Do not treat as legal advice.";

// ─── Mock Implementation ──────────────────────────────────────────────────────
// Clearly labeled, impossible to confuse with real data.

export class MockLegalKnowledgeService implements ILegalKnowledgeService {
  async search(params: LegalSearchParams): Promise<LegalSearchResult> {
    // Intentionally return empty verified results + honest note
    // Do NOT fabricate section numbers or citations.
    return {
      claims: [],
      sources: [],
      confidence: "unverified",
      note: params.query
        ? `${MOCK_LEGAL_NOTE} Query received: "${params.query.slice(0, 80)}". Real search will return statute excerpts with URLs.`
        : MOCK_LEGAL_NOTE,
      isMock: true,
      disclaimer: LEGAL_DISCLAIMER,
    };
  }

  async retrieve(_params: LegalRetrieveParams): Promise<LegalSource | null> {
    // No real retrieval yet — be honest
    return null;
  }

  cite(source: LegalSource, style: CitationStyle = "inline"): CitationResult {
    if (source.isMock) {
      return {
        citationText: `[DEMO — NOT VERIFIED] ${source.citation}`,
        source,
        style,
      };
    }
    return {
      citationText: source.citation,
      source,
      style,
    };
  }

  async verify(claim: string): Promise<LegalClaim> {
    return {
      id: `claim_mock_${Date.now()}`,
      statement: claim,
      sources: [],
      confidence: "unverified",
      verified: false,
      disclaimer: LEGAL_DISCLAIMER,
    };
  }
}

// ─── Real (retriever-backed) Implementation ─────────────────────────────────
import { legalRetriever } from "./legal/retriever.service";
import { legalSourceRepo } from "./legal/repositories";
import { citationService } from "./legal/citation.service";
import { citationVerificationService } from "./legal/verification.service";
import { ensureLegalCorpusInitialized } from "./legal/init";

export class RetrieverBackedLegalKnowledgeService implements ILegalKnowledgeService {
  async search(params: LegalSearchParams): Promise<LegalSearchResult> {
    await ensureLegalCorpusInitialized();

    // If query is empty, return honest empty (preserve mock note behavior for backward compat)
    const q = params.query?.trim() ?? "";
    if (!q) {
      return {
        claims: [],
        sources: [],
        confidence: "unverified",
        note: MOCK_LEGAL_NOTE,
        isMock: true,
        disclaimer: LEGAL_DISCLAIMER,
      };
    }

    const retrieval = await legalRetriever.retrieve({
      query: q,
      topK: params.topK ?? 5,
      onlyProductionAllowed: params.onlyProductionAllowed ?? false,
    });

    // If no passages found — honest about absence, do NOT fabricate
    if (retrieval.passages.length === 0) {
      const allSources = await legalSourceRepo.listAll();
      const hasOnlyTestFixture = allSources.length > 0 && allSources.every((s) => s.sourceType === "TEST_FIXTURE");
      const note = hasOnlyTestFixture
        ? `[NO VERIFIED LEGAL SOURCES] No production legal corpus is currently loaded. Only synthetic test fixtures are present (not real law). Query: "${q.slice(0, 80)}". This is not legal advice.`
        : `${MOCK_LEGAL_NOTE} Query: "${q.slice(0, 80)}". No passages matched. This is not legal advice.`;
      return {
        claims: [],
        sources: [],
        confidence: "unverified",
        note,
        isMock: true,
        disclaimer: LEGAL_DISCLAIMER,
        retrieval,
        passages: [],
      };
    }

    // Build claims from passages — each passage becomes a claim verifiable to its provision
    const sources = retrieval.passages.map((p) => p.source);
    const uniqueSources = Array.from(new Map(sources.map((s) => [s.id, s])).values());

    // Determine confidence: high if any passage is verified + productionAllowed, else low
    const hasProductionVerified = retrieval.passages.some((p) => p.verified && p.productionAllowed);
    const isMock = retrieval.isMock || retrieval.passages.some((p) => p.source.isMock);
    const confidence: RetrievalConfidence = hasProductionVerified ? "high" : isMock ? "unverified" : "low";

    // Claims are derived from passages — statement = provision text snippet
    const claims: LegalClaim[] = retrieval.passages.slice(0, 3).map((p, idx) => ({
      id: `claim_${p.provision.id}_${idx}`,
      statement: p.provision.text.slice(0, 180),
      sources: [p.source],
      provisionIds: [p.provision.id],
      sourceIds: [p.source.id],
      citationText: citationService.formatCitation(p.source, p.provision, "inline"),
      citationUrl: p.source.sourceUrl || p.source.url,
      confidence: p.verified ? "high" : "unverified",
      verified: p.verified,
      isMock: p.source.isMock,
      disclaimer: LEGAL_DISCLAIMER,
    }));

    return {
      claims,
      sources: uniqueSources,
      confidence,
      note: isMock
        ? `Retrieved ${retrieval.passages.length} passage(s) from synthetic test fixtures (NOT REAL LAW). Production legal corpus not yet loaded.`
        : `Retrieved ${retrieval.passages.length} passage(s) from corpus.`,
      isMock,
      disclaimer: LEGAL_DISCLAIMER,
      retrieval,
      passages: retrieval.passages,
    };
  }

  async retrieve(params: LegalRetrieveParams): Promise<LegalSource | null> {
    await ensureLegalCorpusInitialized();
    return (await legalSourceRepo.getById(params.sourceId)) ?? null;
  }

  cite(source: LegalSource, style: CitationStyle = "inline"): CitationResult {
    // Delegate to citationService if we have a provision; else fallback to mock logic
    if (source.isMock) {
      return {
        citationText: `[TEST FIXTURE — NOT LAW] ${source.citation}`,
        source,
        style,
      };
    }
    return {
      citationText: source.citation,
      source,
      style,
    };
  }

  async verify(claim: string): Promise<LegalClaim> {
    await ensureLegalCorpusInitialized();
    // Attempt retrieval to verify claim statement against stored provisions
    const retrieval = await legalRetriever.retrieve({ query: claim, topK: 3, onlyProductionAllowed: false });
    if (retrieval.passages.length === 0) {
      return {
        id: `claim_mock_${Date.now()}`,
        statement: claim,
        sources: [],
        confidence: "unverified",
        verified: false,
        disclaimer: LEGAL_DISCLAIMER,
      };
    }
    // If any passage text contains the claim (normalized), consider verification attempt
    const normClaim = claim.toLowerCase().trim();
    const top = retrieval.passages[0];
    const normProv = top.provision.normalizedText;
    const isTextMatch = normProv.includes(normClaim.slice(0, 60)) || normClaim.includes(normProv.slice(0, 60));
    if (isTextMatch) {
      const ver = await citationVerificationService.verify({
        sourceId: top.source.id,
        provisionId: top.provision.id,
        citedText: claim,
        requireProductionAllowed: false, // for generic verify, allow test fixture
      });
      return {
        id: `claim_${top.provision.id}`,
        statement: claim,
        sources: [top.source],
        provisionIds: [top.provision.id],
        sourceIds: [top.source.id],
        confidence: ver.verified ? "high" : "low",
        verified: ver.verified,
        isMock: top.source.isMock,
        disclaimer: LEGAL_DISCLAIMER,
      };
    }
    return {
      id: `claim_unverified_${Date.now()}`,
      statement: claim,
      sources: retrieval.passages.slice(0, 1).map((p) => p.source),
      confidence: "low",
      verified: false,
      disclaimer: LEGAL_DISCLAIMER,
    };
  }
}

// Singleton for app use — real retriever-backed service
// Mock class is still exported for tests that explicitly test mock safety
export const legalKnowledgeService: ILegalKnowledgeService = new RetrieverBackedLegalKnowledgeService();
