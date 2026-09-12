/**
 * AI Fact Proposal Service — Human-in-the-loop review boundary for AI-proposed facts.
 *
 * ABSOLUTE INVARIANTS:
 * 1. AI-suggested facts are strictly PROPOSALS.
 * 2. An unconfirmed proposal CANNOT directly mutate case facts under any circumstances.
 * 3. Case facts are updated ONLY after explicit user confirmation or modification.
 * 4. All applied facts maintain cryptographic provenance and confirmation timestamps.
 * 5. Conflicts between proposed values and existing facts are flagged for human decision.
 */

import type { ID, DocumentExtractedFact } from "@/types/domain";
import type { ExtractedFactProposalItem } from "./aiProvider.contract";
import { geminiProvider } from "./geminiProvider.service";
import { caseEngine } from "@/services/caseEngine.service";
import { documentFactMergeService } from "@/services/documentFactMerge.service";
import { detectPromptInjection } from "./aiProvider.contract";

export interface CaseFactConflict {
  field: string;
  existingValue: unknown;
  suggestedValue: unknown;
  proposalId: string;
}

export interface ProposalReviewResult {
  proposal: ExtractedFactProposalItem;
  caseUpdated: boolean;
  message: string;
}

export class AiFactProposalService {
  // In-memory proposal storage per case
  private caseProposals = new Map<ID, ExtractedFactProposalItem[]>();

  /**
   * Request AI proposals for a case from raw narrative or document text.
   * All returned proposals start with status "proposed" and confirmedByUser = false.
   */
  async requestProposals(
    caseId: ID,
    rawText: string,
    sourceType: "narrative" | "document_ocr" | "document_text",
    documentId?: ID
  ): Promise<ExtractedFactProposalItem[]> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found: ${caseId}`);

    const result = await geminiProvider.proposeFacts({
      caseId,
      rawText,
      sourceType,
      documentId,
    });

    const existingProposals = this.caseProposals.get(caseId) ?? [];
    const merged = [...existingProposals, ...result.proposals];
    this.caseProposals.set(caseId, merged);

    return result.proposals;
  }

  /**
   * Get all proposals for a case.
   */
  getProposals(caseId: ID): ExtractedFactProposalItem[] {
    return this.caseProposals.get(caseId) ?? [];
  }

  /**
   * Detect conflicts between pending AI proposals and current case facts.
   */
  async detectConflicts(caseId: ID): Promise<CaseFactConflict[]> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found: ${caseId}`);

    const proposals = this.getProposals(caseId).filter((p) => p.status === "proposed");
    const existing = (kase.consumerFacts ?? {}) as Record<string, unknown>;
    const conflicts: CaseFactConflict[] = [];

    for (const prop of proposals) {
      const existingVal =
        existing[prop.field] ??
        (prop.field === "amount" ? existing["amountPaid"] : undefined);
      if (existingVal !== undefined && existingVal !== null && existingVal !== "") {
        const existingStr = String((existingVal as { amount?: number })?.amount ?? existingVal);
        const suggestedStr = String((prop.suggestedValue as { amount?: number })?.amount ?? prop.suggestedValue);
        if (existingStr.toLowerCase() !== suggestedStr.toLowerCase()) {
          conflicts.push({
            field: prop.field,
            existingValue: existingVal,
            suggestedValue: prop.suggestedValue,
            proposalId: prop.id,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * User explicitly confirms an AI proposal.
   * Only now is the fact applied to the case facts with explicit confirmation provenance.
   */
  async confirmProposal(caseId: ID, proposalId: string): Promise<ProposalReviewResult> {
    const proposals = this.caseProposals.get(caseId) ?? [];
    const prop = proposals.find((p) => p.id === proposalId);
    if (!prop) throw new Error(`Proposal ${proposalId} not found for case ${caseId}`);

    if (prop.status !== "proposed") {
      throw new Error(`Cannot confirm proposal ${proposalId}: already ${prop.status}`);
    }

    // Sanity check: Ensure suggested value is not a prompt injection or malicious text
    if (typeof prop.suggestedValue === "string") {
      const check = detectPromptInjection(prop.suggestedValue);
      if (check.isSuspicious) {
        prop.status = "rejected";
        throw new Error("Cannot confirm proposal: contains untrusted or malicious pattern");
      }
    }

    // Mark as confirmed
    prop.status = "confirmed";
    prop.confirmedByUser = true;
    prop.reviewedAt = new Date().toISOString();

    // Map to DocumentExtractedFact format for documentFactMergeService
    const confirmedFact: DocumentExtractedFact = {
      field: prop.field,
      value: prop.suggestedValue,
      confidence: prop.confidence,
      source: "document_text",
      rawText: prop.extractedSnippet,
      confirmedByUser: true,
      confirmedAt: prop.reviewedAt,
      confirmationSource: "document_review",
    };

    await documentFactMergeService.applyConfirmedFacts(caseId, [confirmedFact]);

    return {
      proposal: prop,
      caseUpdated: true,
      message: `Proposal for ${prop.field} confirmed by user and committed to case facts.`,
    };
  }

  /**
   * User explicitly modifies and accepts an AI proposal with their own corrected value.
   */
  async modifyAndConfirmProposal(
    caseId: ID,
    proposalId: string,
    userValue: unknown
  ): Promise<ProposalReviewResult> {
    const proposals = this.caseProposals.get(caseId) ?? [];
    const prop = proposals.find((p) => p.id === proposalId);
    if (!prop) throw new Error(`Proposal ${proposalId} not found for case ${caseId}`);

    if (typeof userValue === "string") {
      const check = detectPromptInjection(userValue);
      if (check.isSuspicious) {
        throw new Error("Modified value contains untrusted or malicious pattern");
      }
    }

    prop.status = "modified";
    prop.userModifiedValue = userValue;
    prop.confirmedByUser = true;
    prop.reviewedAt = new Date().toISOString();

    const confirmedFact: DocumentExtractedFact = {
      field: prop.field,
      value: userValue,
      confidence: "high",
      source: "user_input",
      rawText: String(userValue),
      confirmedByUser: true,
      confirmedAt: prop.reviewedAt,
      confirmationSource: "document_review",
    };

    await documentFactMergeService.applyConfirmedFacts(caseId, [confirmedFact]);

    return {
      proposal: prop,
      caseUpdated: true,
      message: `Proposal for ${prop.field} updated with user-provided value and committed to case facts.`,
    };
  }

  /**
   * User rejects an AI proposal.
   * Case facts remain completely unmodified.
   */
  async rejectProposal(caseId: ID, proposalId: string, _reason?: string): Promise<ProposalReviewResult> {
    const proposals = this.caseProposals.get(caseId) ?? [];
    const prop = proposals.find((p) => p.id === proposalId);
    if (!prop) throw new Error(`Proposal ${proposalId} not found for case ${caseId}`);

    prop.status = "rejected";
    prop.confirmedByUser = false;
    prop.reviewedAt = new Date().toISOString();

    return {
      proposal: prop,
      caseUpdated: false,
      message: `Proposal for ${prop.field} rejected. Case facts were not modified.`,
    };
  }

  /**
   * Clears proposal memory for a case (used during session reset or testing).
   */
  clearProposals(caseId: ID): void {
    this.caseProposals.delete(caseId);
  }
}

export const aiFactProposalService = new AiFactProposalService();
