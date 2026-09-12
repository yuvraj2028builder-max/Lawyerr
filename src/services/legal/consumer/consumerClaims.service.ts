/**
 * Consumer Claims — builds LegalClaim objects from retrieved consumer passages.
 * Each claim is traceable to source+provision, never invented.
 */

import type { LegalClaim, RetrievalPassage } from "@/types/domain";
import { citationService } from "../citation.service";

export interface BuildConsumerClaimsInput {
  passages: RetrievalPassage[];
  issueTypes?: string[];
  userFacts?: Record<string, unknown>;
}

export class ConsumerClaimsService {
  buildClaims(input: BuildConsumerClaimsInput): LegalClaim[] {
    if (input.passages.length === 0) return [];

    return input.passages.slice(0, 3).map((p, idx) => {
      const isLegislative = p.provision.provisionKind === "legal_provision" || !p.provision.provisionKind;
      const baseStatement = p.provision.text.slice(0, 200).trim();
      // Plain-language explanation — not a legal conclusion
      const explanation = isLegislative
        ? `This provision from ${p.source.title} may be relevant to your situation involving ${input.issueTypes?.join(", ") || "consumer issue"}. Whether it applies depends on your specific facts.`
        : `This official procedure information from ${p.source.authority} describes how consumer grievances may be pursued.`;

      const statement = baseStatement;

      return {
        id: `consumer_claim_${p.provision.id}_${idx}`,
        statement,
        sources: [p.source],
        provisionIds: [p.provision.id],
        sourceIds: [p.source.id],
        citationText: citationService.formatCitation(p.source, p.provision, "inline"),
        citationUrl: p.source.sourceUrl || p.source.url,
        confidence: p.verified && p.productionAllowed ? "high" : "low",
        verified: p.verified && p.productionAllowed,
        isMock: p.source.isMock,
        disclaimer: p.source.disclaimer || "This is general information based on the sources shown and is not a substitute for advice from a qualified lawyer.",
        domain: "consumer_grievance",
        explanation,
        factVsLawNote: "User facts and allegations are not established facts. System interpretation is not a legal finding.",
      };
    });
  }
}

export const consumerClaimsService = new ConsumerClaimsService();
