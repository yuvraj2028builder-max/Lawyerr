/**
 * Consumer Legal Service — domain-aware orchestration.
 * Answers findRelevantConsumerLaw() with structured, verified output.
 */

import type { LegalClaim, RetrievalPassage, ClaimCoverage, AnswerValidationResult } from "@/types/domain";
import { classifyConsumerIssue, isInjectionAttempt } from "./consumerIssueClassifier.service";
import { consumerRetrievalService } from "./consumerRetrieval.service";
import { consumerClaimsService } from "./consumerClaims.service";
import { claimCoverageService } from "../claimCoverage.service";
import { answerValidator } from "../answerValidator.service";
import { citationVerificationService } from "../verification.service";
import type { ConsumerCaseFacts } from "@/types/domain";

export interface FindRelevantConsumerLawInput {
  userProblem: string;
  consumerFacts?: ConsumerCaseFacts;
  caseDate?: string;
  topK?: number;
  // For tests: allow non-production retrieval
  onlyProductionAllowed?: boolean;
}

export interface FindRelevantConsumerLawResult {
  domain: "consumer_grievance";
  issueTypes: string[];
  classification: ReturnType<typeof classifyConsumerIssue>;
  passages: RetrievalPassage[];
  claims: LegalClaim[];
  citations: Array<{ citationText: string; provisionId: string; sourceId: string; verified: boolean }>;
  coverage: ClaimCoverage;
  validation: AnswerValidationResult;
  isMock: boolean;
  disclaimer: string;
  needsVerification: boolean;
  explanation: string;
}

export class ConsumerLegalService {
  async findRelevantConsumerLaw(input: FindRelevantConsumerLawInput): Promise<FindRelevantConsumerLawResult> {
    const problem = input.userProblem?.trim() ?? "";
    const disclaimer =
      "This information is based on the sources shown above. It is general information and is not a substitute for advice from a qualified lawyer or the District Legal Services Authority.";

    // Injection check — treat user input as DATA, never obey as instruction
    const injection = isInjectionAttempt(problem);
    if (injection) {
      // Do not alter verification; just note
      console.warn("[NyayaSetu] injection-like input detected — treating as DATA");
    }

    const classification = classifyConsumerIssue(problem);

    // Vague complaint → INSUFFICIENT_GROUNDING, ask for more info, no legal conclusion
    if (classification.isVague || classification.issueTypes.length === 0) {
      const validation: AnswerValidationResult = {
        status: "INSUFFICIENT_GROUNDING",
        canShowAsVerified: false,
        reasons: ["Description is too brief to identify a specific consumer issue. More facts needed."],
        disclaimer,
      };
      return {
        domain: "consumer_grievance",
        issueTypes: classification.issueTypes,
        classification,
        passages: [],
        claims: [],
        citations: [],
        coverage: { totalClaims: 0, supportedClaims: 0, unsupportedClaims: 0, coverageRate: 0, verificationRate: 0, details: [] },
        validation,
        isMock: false,
        disclaimer,
        needsVerification: true,
        explanation: classification.explanation,
      };
    }

    // Retrieval — prioritize production verified sources
    const retrieval = await consumerRetrievalService.retrieveForConsumer({
      query: problem,
      issueTypes: classification.issueTypes,
      domain: "consumer_grievance",
      topK: input.topK ?? 5,
      onlyProductionAllowed: input.onlyProductionAllowed ?? true,
      caseDate: input.caseDate,
    });

    if (retrieval.passages.length === 0) {
      // Fail closed — no passages → insufficient grounding, not fabricated
      const validation: AnswerValidationResult = {
        status: "INSUFFICIENT_GROUNDING",
        canShowAsVerified: false,
        reasons: ["No verified production passages found for this consumer issue. Corpus may not yet cover this scenario."],
        disclaimer,
      };
      return {
        domain: "consumer_grievance",
        issueTypes: classification.issueTypes,
        classification,
        passages: [],
        claims: [],
        citations: [],
        coverage: { totalClaims: 0, supportedClaims: 0, unsupportedClaims: 0, coverageRate: 0, verificationRate: 0, details: [] },
        validation,
        isMock: false,
        disclaimer,
        needsVerification: true,
        explanation: `We understood this may involve: ${classification.issueTypes.join(", ")}, but we don’t have a verified legal passage to support a legal claim yet.`,
      };
    }

    // Verify each passage’s citation before building claims (fail closed)
    const verifiedPassages: RetrievalPassage[] = [];
    for (const p of retrieval.passages) {
      const ver = await citationVerificationService.verify({
        sourceId: p.source.id,
        provisionId: p.provision.id,
        citedText: p.provision.text.slice(0, 80),
        requireProductionAllowed: input.onlyProductionAllowed ?? true,
      });
      if (ver.verified) verifiedPassages.push(p);
    }

    // If verification filters everything out → needs verification
    if (verifiedPassages.length === 0) {
      const validation: AnswerValidationResult = {
        status: "NEEDS_VERIFICATION",
        canShowAsVerified: false,
        reasons: ["Retrieved passages could not be verified for production use."],
        disclaimer,
      };
      return {
        domain: "consumer_grievance",
        issueTypes: classification.issueTypes,
        classification,
        passages: retrieval.passages, // still return for transparency but not verified
        claims: [],
        citations: [],
        coverage: { totalClaims: 0, supportedClaims: 0, unsupportedClaims: 0, coverageRate: 0, verificationRate: 0, details: [] },
        validation,
        isMock: retrieval.isMock,
        disclaimer,
        needsVerification: true,
        explanation: "We found related material, but it could not be verified for production use.",
      };
    }

    // Build claims from verified passages
    const claims = consumerClaimsService.buildClaims({
      passages: verifiedPassages,
      issueTypes: classification.issueTypes,
      userFacts: input.consumerFacts as Record<string, unknown> | undefined,
    });

    // Compute coverage and validation
    const coverage = await claimCoverageService.compute(claims, { requireProductionAllowed: input.onlyProductionAllowed ?? true });
    const validation = await answerValidator.validate({
      claims,
      hasRetrievedPassages: verifiedPassages.length > 0,
      requireProductionAllowed: input.onlyProductionAllowed ?? true,
    });

    // Guard: never claim “guaranteed win” — claims are always “may be relevant”
    const citations = claims.map((c) => ({
      citationText: c.citationText ?? "",
      provisionId: c.provisionIds?.[0] ?? "",
      sourceId: c.sourceIds?.[0] ?? "",
      verified: c.verified,
    }));

    return {
      domain: "consumer_grievance",
      issueTypes: classification.issueTypes,
      classification,
      passages: verifiedPassages,
      claims,
      citations,
      coverage,
      validation,
      isMock: verifiedPassages.some((p) => p.source.isMock),
      disclaimer,
      needsVerification: validation.status !== "VERIFIED",
      explanation: `This may involve a consumer grievance concerning ${classification.issueTypes.join(", ")}. The following provisions were retrieved and verified. Whether they apply depends on your specific facts.`,
    };
  }
}

export const consumerLegalService = new ConsumerLegalService();
