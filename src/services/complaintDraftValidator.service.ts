/**
 * ComplaintDraftValidator — deterministic, no invented legal requirements.
 * Detects: unresolved placeholders, missing important facts, unconfirmed facts,
 * unresolved conflicts, high-risk, unsupported legal grounds, empty resolution, missing evidence.
 */

import type { ComplaintDraft, DocumentExtractedFact, Case } from "@/types/domain";

export interface DraftValidationWarning {
  severity: "info" | "warning" | "blocking";
  code: string;
  message: string;
  field?: string;
}

export interface DraftValidationResult {
  valid: boolean;
  warnings: DraftValidationWarning[];
  hasBlocking: boolean;
  // compat aliases
  isBlocked: boolean;
  blockingCount: number;
  warningCount: number;
  infoCount: number;
  missingChecklist: string[];
  summary: string;
}

export class ComplaintDraftValidator {
  validate(params: {
    draft: ComplaintDraft;
    kase?: Case;
    // tolerate multiple param names for caller compatibility
    extractedFacts?: DocumentExtractedFact[];
    unconfirmedFacts?: DocumentExtractedFact[] | Array<{ field: string }>;
    unresolvedConflicts?: number;
    conflictCount?: number;
    hasConflicts?: boolean;
  }): DraftValidationResult {
    const { draft, kase } = params;
    const extractedFacts = (params.extractedFacts ?? params.unconfirmedFacts ?? []) as DocumentExtractedFact[];
    const unresolvedConflicts = params.unresolvedConflicts ?? params.conflictCount ?? (params.hasConflicts ? 1 : 0);
    const warnings: DraftValidationWarning[] = [];
    const missingChecklist: string[] = [];

    // Unresolved critical placeholders → blocking
    const criticalPlaceholders = draft.placeholders.filter((p) =>
      ["complainant name", "seller address", "purchase date", "amount paid", "product/service", "legal basis", "seller", "amount", "product"].some((c) => p.toLowerCase().includes(c))
    );
    if (criticalPlaceholders.length > 0) {
      warnings.push({
        severity: "blocking",
        code: "unresolved_critical_placeholders",
        message: `Unresolved critical placeholders: ${criticalPlaceholders.join(", ")} — draft not ready for filing.`,
      });
      missingChecklist.push(`${criticalPlaceholders.length} critical placeholders unresolved`);
    } else if (draft.placeholders.length > 0) {
      warnings.push({
        severity: "warning",
        code: "unresolved_placeholders",
        message: `Draft has ${draft.placeholders.length} placeholders to review: ${draft.placeholders.join(", ")}`,
      });
      missingChecklist.push(`${draft.placeholders.length} placeholders`);
    }

    const placeholderSections = draft.sections.filter((s) => s.isPlaceholder).length;
    if (placeholderSections > 2 && warnings.every((w) => w.code !== "unresolved_critical_placeholders")) {
      warnings.push({
        severity: "warning",
        code: "many_placeholders",
        message: `${placeholderSections} sections still have placeholders.`,
      });
    }

    const facts = kase?.consumerFacts ?? {};
    const missingImportant: string[] = [];
    if (!facts.sellerOrProvider) missingImportant.push("seller details");
    if (!facts.productOrService) missingImportant.push("product/service");
    if (!facts.amountPaid) missingImportant.push("amount");
    if (!facts.purchaseDate) missingImportant.push("purchase date");
    if (missingImportant.length > 0) {
      warnings.push({
        severity: "warning",
        code: "missing_important_facts",
        message: `Missing important facts: ${missingImportant.join(", ")}`,
      });
      missingChecklist.push(`Missing: ${missingImportant.join(", ")}`);
    }

    const unconfirmed = extractedFacts.filter((f) => !(f as DocumentExtractedFact).confirmedByUser);
    if (unconfirmed.length > 0) {
      warnings.push({
        severity: "warning",
        code: "unconfirmed_extracted_facts",
        message: `${unconfirmed.length} extracted detail(s) not yet confirmed by you — review before using in draft.`,
      });
      missingChecklist.push(`${unconfirmed.length} extracted details not yet confirmed`);
    } else if (Array.isArray(params.unconfirmedFacts) && params.unconfirmedFacts.length > 0 && extractedFacts.length === 0) {
      // fallback for simple {field} array
      const count = (params.unconfirmedFacts as Array<{ field: string }>).length;
      warnings.push({
        severity: "warning",
        code: "unconfirmed_extracted_facts",
        message: `${count} extracted detail(s) not yet confirmed by you — review before using in draft.`,
      });
      missingChecklist.push(`${count} extracted details not yet confirmed`);
    }

    if (unresolvedConflicts && unresolvedConflicts > 0) {
      warnings.push({
        severity: "blocking",
        code: "unresolved_conflicts",
        message: `${unresolvedConflicts} conflict(s) require your decision before draft can be trusted.`,
      });
      missingChecklist.push(`${unresolvedConflicts} unresolved conflict(s)`);
    }

    if (draft.isHighRisk) {
      warnings.push({
        severity: "blocking",
        code: "high_risk_case",
        message: "Human legal review recommended before using this draft — high-risk indicators detected (legal notice / hearing / criminal).",
      });
      missingChecklist.push("High-risk — human review needed");
    }

    if (draft.legalGrounds.length === 0) {
      warnings.push({
        severity: "warning",
        code: "unsupported_legal_grounds",
        message: "No verified legal basis is currently available from NyayaSetu's verified sources for this part. Do not treat as specific legal provision.",
      });
      missingChecklist.push("No verified legal basis");
    }

    const resolutionSection = draft.sections.find((s) => s.heading.toLowerCase().includes("resolution"));
    if (!resolutionSection || resolutionSection.content.includes("[Add") || resolutionSection.content.trim().length < 10) {
      const hasResolution = !draft.placeholders.some((p) => p.toLowerCase().includes("resolution") || p.toLowerCase().includes("outcome")) && resolutionSection?.content && !resolutionSection.content.includes("[Add");
      if (!hasResolution && draft.placeholders.some((p) => p.includes("resolution") || p.includes("outcome") || p.toLowerCase().includes("requested"))) {
        warnings.push({
          severity: "warning",
          code: "missing_resolution",
          message: "Requested resolution is missing or placeholder — specify what you want (refund, replacement, etc.).",
        });
        missingChecklist.push("Missing requested resolution");
      } else if (!resolutionSection || resolutionSection.content.trim().length < 5) {
        warnings.push({
          severity: "warning",
          code: "missing_resolution",
          message: "Requested resolution is missing or placeholder — specify what you want (refund, replacement, etc.).",
        });
        missingChecklist.push("Missing requested resolution");
      }
    }

    if (draft.evidenceList.length === 0) {
      warnings.push({
        severity: "info",
        code: "missing_evidence_list",
        message: "Evidence list is empty — add supporting documents (invoice, payment record, photos, chats).",
      });
      missingChecklist.push("Evidence list empty");
    }

    const hasBlocking = warnings.some((w) => w.severity === "blocking");
    const valid = !hasBlocking;
    const blockingCount = warnings.filter((w) => w.severity === "blocking").length;
    const warningCount = warnings.filter((w) => w.severity === "warning").length;
    const infoCount = warnings.filter((w) => w.severity === "info").length;
    const summary = missingChecklist.length > 0 ? `Before using this draft, review: ${missingChecklist.join(" • ")}` : "Draft appears complete — still review names, dates, amounts before using.";

    return {
      valid,
      warnings,
      hasBlocking,
      isBlocked: hasBlocking,
      blockingCount,
      warningCount,
      infoCount,
      missingChecklist,
      summary,
    };
  }

  // compat helper
  getMissingChecklist(input: { draft: ComplaintDraft; unconfirmedCount?: number; conflictCount?: number }): string[] {
    const unconfirmed = Array.from({ length: input.unconfirmedCount ?? 0 }, (_, i) => ({ field: `field_${i}` }) as DocumentExtractedFact);
    const res = this.validate({
      draft: input.draft,
      unconfirmedFacts: unconfirmed as unknown as DocumentExtractedFact[],
      unresolvedConflicts: input.conflictCount,
    });
    return res.missingChecklist;
  }

  countBySeverity(result: DraftValidationResult): Record<string, number> {
    const counts: Record<string, number> = { blocking: 0, warning: 0, info: 0 };
    for (const w of result.warnings) counts[w.severity]++;
    return counts;
  }
}

export const complaintDraftValidator = new ComplaintDraftValidator();
