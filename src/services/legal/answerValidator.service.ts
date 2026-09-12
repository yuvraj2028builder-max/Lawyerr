/**
 * LegalAnswerValidator — decides if answer can be shown as verified law.
 *
 * Considers:
 * - does answer contain legal claims?
 * - are those claims linked to sources/provisions?
 * - are citations verified & productionAllowed?
 * - any unsupported claims?
 * - insufficient evidence?
 *
 * Returns safe status: VERIFIED | NEEDS_VERIFICATION | INSUFFICIENT_GROUNDING | UNSAFE_MOCK_AS_VERIFIED
 *
 * Mock content MUST NEVER pass as VERIFIED (hard boundary).
 */

import type { LegalClaim, ClaimCoverage, AnswerValidationResult } from "@/types/domain";
import { claimCoverageService } from "./claimCoverage.service";

export interface ValidateAnswerInput {
  claims: LegalClaim[];
  hasRetrievedPassages: boolean;
  requireProductionAllowed?: boolean;
}

export interface IAnswerValidator {
  validate(input: ValidateAnswerInput): Promise<AnswerValidationResult>;
}

export class LegalAnswerValidator implements IAnswerValidator {
  async validate(input: ValidateAnswerInput): Promise<AnswerValidationResult> {
    const requireProd = input.requireProductionAllowed ?? true;
    const claims = input.claims ?? [];
    const disclaimer = "This information is based on the sources available to NyayaSetu and is not a substitute for advice from a qualified lawyer.";

    // Hard safety: any claim with isMock true cannot be VERIFIED if production required
    const hasMockClaim = claims.some((c) => c.isMock === true);
    if (requireProd && hasMockClaim) {
      return {
        status: "UNSAFE_MOCK_AS_VERIFIED",
        canShowAsVerified: false,
        reasons: ["Answer contains mock/test claims that cannot be shown as verified law"],
        disclaimer,
      };
    }

    if (claims.length === 0) {
      if (!input.hasRetrievedPassages) {
        return {
          status: "INSUFFICIENT_GROUNDING",
          canShowAsVerified: false,
          reasons: ["No legal claims and no retrieved passages — insufficient grounding"],
          disclaimer,
        };
      }
      // No claims but has passages — treat as general info, needs verification
      return {
        status: "NEEDS_VERIFICATION",
        canShowAsVerified: false,
        reasons: ["Answer has no structured claims linked to sources"],
        disclaimer,
      };
    }

    const coverage: ClaimCoverage = await claimCoverageService.compute(claims, { requireProductionAllowed: requireProd });

    if (coverage.supportedClaims === coverage.totalClaims && coverage.totalClaims > 0) {
      // Fully supported — but still check no mock slipped through
      return {
        status: "VERIFIED",
        canShowAsVerified: true,
        reasons: ["All claims are linked to verified production sources"],
        coverage,
        disclaimer,
      };
    }

    if (coverage.supportedClaims > 0 && coverage.unsupportedClaims > 0) {
      return {
        status: "NEEDS_VERIFICATION",
        canShowAsVerified: false,
        reasons: [`Partial coverage: ${coverage.supportedClaims}/${coverage.totalClaims} claims verified`],
        coverage,
        disclaimer,
      };
    }

    // No supported claims
    return {
      status: "INSUFFICIENT_GROUNDING",
      canShowAsVerified: false,
      reasons: [`No claims are supported by verified sources (${coverage.unsupportedClaims} unsupported)`],
      coverage,
      disclaimer,
    };
  }
}

export const answerValidator = new LegalAnswerValidator();
