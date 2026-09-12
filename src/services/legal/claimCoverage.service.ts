/**
 * ClaimCoverage — how many claims are actually grounded in verified sources.
 * Terminology: source coverage / citation coverage / verification coverage.
 * Never called “accuracy”.
 */

import type { LegalClaim, ClaimCoverage } from "@/types/domain";
import { citationVerificationService } from "./verification.service";

export interface ICoverageService {
  compute(claims: LegalClaim[], opts?: { requireProductionAllowed?: boolean }): Promise<ClaimCoverage>;
}

export class ClaimCoverageService implements ICoverageService {
  async compute(claims: LegalClaim[], opts: { requireProductionAllowed?: boolean } = {}): Promise<ClaimCoverage> {
    const requireProd = opts.requireProductionAllowed ?? false;
    if (claims.length === 0) {
      return {
        totalClaims: 0,
        supportedClaims: 0,
        unsupportedClaims: 0,
        coverageRate: 0,
        verificationRate: 0,
        details: [],
      };
    }

    const details: ClaimCoverage["details"] = [];
    let supported = 0;

    for (const claim of claims) {
      // A claim is supported if it has at least one source and that source verifies
      if (!claim.sources || claim.sources.length === 0 || !claim.provisionIds || claim.provisionIds.length === 0) {
        details.push({ claimId: claim.id, verified: false, reason: "No sources/provisions linked" });
        continue;
      }

      // Verify each provision linkage
      let anyVerified = false;
      let lastReason: string | undefined;
      for (let i = 0; i < claim.sources.length; i++) {
        const src = claim.sources[i];
        const provId = claim.provisionIds[i] ?? claim.provisionIds[0];
        if (!provId) continue;
        const res = await citationVerificationService.verify({
          sourceId: src.id,
          provisionId: provId,
          citedText: claim.statement, // optional: we check if claim statement matches provision? For now we verify linkage only; full text match is for citation verification tests
          requireProductionAllowed: requireProd,
        });
        if (res.verified) {
          anyVerified = true;
          break;
        } else {
          lastReason = res.reason;
        }
      }

      // Also check explicit claim.verified flag — but verification service is source of truth
      if (anyVerified && claim.verified) {
        supported++;
        details.push({ claimId: claim.id, verified: true });
      } else if (anyVerified && !claim.verified) {
        // source verifies but claim says unverified — count as unsupported for safety
        details.push({ claimId: claim.id, verified: false, reason: "Claim marked unverified despite source" });
      } else {
        details.push({ claimId: claim.id, verified: false, reason: lastReason ?? "No verified source" });
      }
    }

    const total = claims.length;
    const unsupported = total - supported;
    const coverageRate = total > 0 ? supported / total : 0;
    // verificationRate same as coverageRate for now; distinction will matter when we add partial verification
    return {
      totalClaims: total,
      supportedClaims: supported,
      unsupportedClaims: unsupported,
      coverageRate: Number(coverageRate.toFixed(3)),
      verificationRate: Number(coverageRate.toFixed(3)),
      details,
    };
  }
}

export const claimCoverageService = new ClaimCoverageService();
