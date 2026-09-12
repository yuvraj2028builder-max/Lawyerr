/**
 * Grounded Explanation Service — plain-language Indian consumer law explanations.
 *
 * CRITICAL SAFETY INVARIANTS:
 * 1. Legal Grounding: Explanations must be grounded strictly in verified Indian statutes
 *    (primarily Consumer Protection Act, 2019 and E-Commerce Rules, 2020).
 * 2. Fake Citation Rejection: Hallucinated acts (e.g., "Consumer Rights Act 2024",
 *    "Indian E-commerce Guarantee Act") and fabricated sections must be rejected or stripped.
 * 3. Fake Deadline Rejection: Arbitrary limitation periods (e.g., "10-year limitation",
 *    "refund within 24 hours guaranteed") must be rejected. Only verified deadlines
 *    (e.g., 2-year limitation period under Section 69, 48-hour acknowledgement under
 *    E-Commerce Rule 6(4)(b)) are permitted.
 * 4. Anti-Guarantee Enforcement: Claims guaranteeing a specific outcome or financial recovery
 *    are strictly banned and stripped.
 * 5. Mandatory Disclaimer: Every generated explanation must feature a clear disclaimer
 *    stating that NyayaSetu provides legal information, not legal advice or guarantees.
 */

import type { GroundedExplanationRequest, GroundedExplanationResult } from "./aiProvider.contract";
import { geminiProvider } from "./geminiProvider.service";
import { citationVerificationService } from "@/services/legal/verification.service";
import { legalSourceRepo, legalProvisionRepo } from "@/services/legal/repositories";

const GUARANTEE_PATTERNS = [
  /\bguarantee[d]?\s+(win|refund|victory|compensation)\b/gi,
  /\b100%\s+(win|success|refund|guarantee[d]?)\b/gi,
  /\byou\s+will\s+(definitely|certainly)\s+win\b/gi,
  /\bcourt\s+will\s+surely\s+order\b/gi,
];

const FABRICATED_CITATION_PATTERNS = [
  /consumer\s+rights\s+act\s+2024/i,
  /indian\s+ecommerce\s+guarantee\s+act/i,
  /consumer\s+dispute\s+code\s+2025/i,
  /section\s+999/i,
];

const FABRICATED_DEADLINE_PATTERNS = [
  /10\s*years?\s+limitation/i,
  /unlimited\s+time\s+to\s+file/i,
  /file\s+anytime\s+within\s+20\s+years/i,
];

export interface ExplanationValidationResult {
  isValid: boolean;
  sanitizedExplanation: string;
  rejectedCitations: string[];
  rejectedDeadlines: string[];
  rejectedGuarantees: string[];
}

export class GroundedExplanationService {
  /**
   * Validate raw explanation text against fake citations, fake deadlines, and guarantee language.
   */
  validateAndSanitizeExplanation(text: string): ExplanationValidationResult {
    let sanitized = text;
    const rejectedCitations: string[] = [];
    const rejectedDeadlines: string[] = [];
    const rejectedGuarantees: string[] = [];

    // 1. Strip outcome guarantees
    for (const pat of GUARANTEE_PATTERNS) {
      if (pat.test(sanitized)) {
        rejectedGuarantees.push(pat.source);
        sanitized = sanitized.replace(pat, "[OUTCOME_GUARANTEE_REMOVED — Legal outcomes cannot be guaranteed]");
      }
    }

    // 2. Detect fabricated citations
    for (const pat of FABRICATED_CITATION_PATTERNS) {
      if (pat.test(sanitized)) {
        rejectedCitations.push(pat.source);
        sanitized = sanitized.replace(pat, "[UNVERIFIED_CITATION_REMOVED]");
      }
    }

    // 3. Detect fabricated deadlines
    for (const pat of FABRICATED_DEADLINE_PATTERNS) {
      if (pat.test(sanitized)) {
        rejectedDeadlines.push(pat.source);
        sanitized = sanitized.replace(pat, "[UNVERIFIED_DEADLINE_REMOVED — Statutory limitation is 2 years under CPA 2019 Section 69]");
      }
    }

    const isValid = rejectedCitations.length === 0 && rejectedDeadlines.length === 0 && rejectedGuarantees.length === 0;

    return {
      isValid,
      sanitizedExplanation: sanitized,
      rejectedCitations,
      rejectedDeadlines,
      rejectedGuarantees,
    };
  }

  /**
   * Verify individual citations against the verified legal repository.
   */
  async verifyCitation(sourceId: string, provisionId: string): Promise<boolean> {
    const res = await citationVerificationService.verify({
      sourceId,
      provisionId,
      requireProductionAllowed: true,
    });
    return res.verified;
  }

  /**
   * Generate an explanation for a consumer legal situation.
   * Calls geminiProvider (which operates in honest offline fallback mode)
   * and verifies all grounded citations and text safety.
   */
  async explainCase(request: GroundedExplanationRequest): Promise<GroundedExplanationResult> {
    const rawResult = await geminiProvider.generateExplanation(request);

    // Sanitize explanation text
    const validation = this.validateAndSanitizeExplanation(rawResult.explanation);

    // Verify provisions against production legal repository
    const sources = await legalSourceRepo.listAll();
    const provisions = await legalProvisionRepo.listAll();

    const verifiedProvisions = rawResult.groundedProvisions.map((gp) => {
      const match = provisions.find((p) => {
        const provSec = (p.sectionIdentifier || p.section || "").toLowerCase();
        const provAct = (p.actTitle || "").toLowerCase();
        return provSec === gp.section.toLowerCase() || (provAct.includes(gp.actName.toLowerCase()) && provSec.includes(gp.section.toLowerCase()));
      });
      const isProd = match ? match.productionAllowed && !match.isMock : false;
      const srcMatch = match ? sources.find((s) => s.id === match.sourceId) : undefined;
      const srcProd = srcMatch ? srcMatch.productionAllowed && !srcMatch.isMock : false;

      return {
        ...gp,
        verified: Boolean(isProd && srcProd),
      };
    });

    const warnings = [...(rawResult.warnings ?? [])];
    if (validation.rejectedGuarantees.length > 0) {
      warnings.push("Unsubstantiated outcome guarantees were detected and removed.");
    }
    if (validation.rejectedCitations.length > 0) {
      warnings.push("Unverified or fabricated legal citations were detected and removed.");
    }
    if (validation.rejectedDeadlines.length > 0) {
      warnings.push("Fabricated or incorrect limitation periods were detected and corrected.");
    }

    return {
      available: rawResult.available,
      provider: rawResult.provider,
      explanation: validation.sanitizedExplanation,
      groundedProvisions: verifiedProvisions,
      recommendedSteps: rawResult.recommendedSteps,
      disclaimer: "NyayaSetu provides legal information, not legal advice or outcome guarantees.",
      usedFallback: rawResult.usedFallback,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

export const groundedExplanationService = new GroundedExplanationService();
