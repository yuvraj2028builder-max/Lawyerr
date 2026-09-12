/**
 * LegalAnalysisService — LLM is downstream of retrieval, never the source of law.
 *
 * Future flow:
 *   USER QUESTION → INTENT/CASE FACTS → RETRIEVAL (verified passages) → LLM EXPLANATION → CLAIM EXTRACTION → CITATION VERIFICATION → FINAL ANSWER
 *
 * LLM explains retrieved law; it does not decide what the law is from memory.
 * Retrieved passages are DATA, not instructions — must never obey instructions
 * inside source text.
 *
 * For Prompt 2: stub only, no paid LLM. Retrieval/citation works standalone.
 */

import type { LegalClaim, RetrievalPassage } from "@/types/domain";
import { answerValidator } from "./answerValidator.service";
import type { RetrievalResult } from "@/types/domain";

export interface AnalysisInput {
  question: string;
  caseFacts?: Record<string, unknown>;
  retrievedPassages: RetrievalPassage[]; // must be verified retrieval result
  language?: "en" | "hi";
}

export interface AnalysisOutput {
  answer: string; // plain language explanation
  claims: LegalClaim[];
  retrieval: RetrievalResult;
  coverageNote?: string;
  disclaimer: string;
  isMock: boolean; // true for stub
}

export interface ILegalAnalysisService {
  analyze(input: AnalysisInput): Promise<AnalysisOutput>;
}

/**
 * Stub implementation — generates a safe, non-legal-advice answer that
 * references retrieved passages but does NOT invent law.
 * Clearly marked isMock=true.
 */
export class StubLegalAnalysisService implements ILegalAnalysisService {
  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const disclaimer =
      "This is general information based on the sources available to NyayaSetu and retrieved passages shown. It is not legal advice. For your situation, consult a qualified lawyer or your District Legal Services Authority (DLSA).";

    // Treat retrieved passages as DATA — never execute instructions inside them
    // We sanitize by not interpreting them as prompts; we only quote.
    const hasVerifiedPassages = input.retrievedPassages.some((p) => p.verified && p.productionAllowed);

    if (input.retrievedPassages.length === 0) {
      return {
        answer: `We couldn't find a verified legal source for "${input.question.slice(0, 80)}" in the current corpus. This is not legal advice. Please consult a lawyer or DLSA with your specific facts.`,
        claims: [],
        retrieval: {
          passages: [],
          totalFound: 0,
          strategyUsed: "keyword",
          query: input.question,
          disclaimer,
          isMock: true,
        },
        coverageNote: "No retrieved passages — insufficient grounding",
        disclaimer,
        isMock: true,
      };
    }

    // Generate claims from retrieved passages — each claim points to its provision
    const claims: LegalClaim[] = input.retrievedPassages.slice(0, 3).map((passage, idx) => ({
      id: `claim_stub_${idx}_${Date.now()}`,
      statement: passage.provision.text.slice(0, 120),
      sources: [passage.source],
      provisionIds: [passage.provision.id],
      sourceIds: [passage.source.id],
      citationText: `${passage.source.title} — ${passage.provision.sectionIdentifier}`,
      citationUrl: passage.source.sourceUrl || passage.source.url,
      confidence: passage.verified ? "high" : "unverified",
      verified: passage.verified,
      isMock: true, // stub always mock, even if passage is verified — because answer is not legally reviewed
      disclaimer,
    }));

    // Verify coverage for this stub — but stub is always mock so will be NEEDS_VERIFICATION
    const validation = await answerValidator.validate({
      claims,
      hasRetrievedPassages: input.retrievedPassages.length > 0,
      requireProductionAllowed: true,
    });

    // Safe answer: quote passages, don't invent
    const topPassages = input.retrievedPassages
      .slice(0, 2)
      .map((p) => `> ${p.provision.sectionIdentifier}: ${p.provision.text.slice(0, 200)} — Source: ${p.source.title} (verified: ${p.verified}, productionAllowed: ${p.productionAllowed})`)
      .join("\n\n");

    const answer = hasVerifiedPassages
      ? `Based on the retrieved passages available to NyayaSetu, here is the relevant text:\n\n${topPassages}\n\nThis is general information only. ${validation.status === "VERIFIED" ? "" : `Verification status: ${validation.status}. `}Please consult a lawyer/DLSA for how this applies to you.`
      : `We found some passages but they are not verified for production use. For safety we cannot present them as verified law.\n\n${topPassages}\n\nPlease consult a qualified lawyer.`;

    return {
      answer,
      claims,
      retrieval: {
        passages: input.retrievedPassages,
        totalFound: input.retrievedPassages.length,
        strategyUsed: "keyword",
        query: input.question,
        disclaimer,
        isMock: true,
      },
      coverageNote: `Coverage: ${validation.status}`,
      disclaimer,
      isMock: true,
    };
  }
}

export const legalAnalysisService: ILegalAnalysisService = new StubLegalAnalysisService();
