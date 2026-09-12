/**
 * Consumer Complaint Draft Service — template-based, uses confirmed facts + verified legal passages.
 * Never invents dates, order numbers, names, amounts, legal sections, deadlines, jurisdiction, etc.
 */

import type { ConsumerCaseFacts, ComplaintDraft, ComplaintDraftSection, LegalGround, Case, ID } from "@/types/domain";

export interface GenerateDraftInput {
  caseId: ID;
  kase: Case;
  facts?: ConsumerCaseFacts;
  confirmedDocumentFacts?: Array<{ field: string; value: unknown; rawText: string }>;
  verifiedLegalGrounds?: LegalGround[];
  desiredOutcome?: string;
  evidenceList?: string[];
  isHighRisk?: boolean;
}

function placeholder(label: string): string {
  return `[Add ${label}]`;
}

export class ConsumerComplaintDraftService {
  async generate(input: GenerateDraftInput): Promise<ComplaintDraft> {
    const now = new Date().toISOString();
    const facts: ConsumerCaseFacts = input.facts ?? {};
    const isHighRisk = !!input.isHighRisk || this.detectHighRisk(facts, input.kase);

    if (isHighRisk) {
      return {
        id: `draft_${input.caseId}_${Date.now()}`,
        caseId: input.caseId,
        createdAt: now,
        updatedAt: now,
        title: "Consumer Complaint Draft — Human Review Recommended",
        sections: [
          { heading: "Safety Notice", content: "This case involves a legal notice, court summons, hearing, criminal allegation, or potential risk. Human legal review is recommended before using this draft. This draft is limited and not a confident consumer complaint." },
          { heading: "What You Told Us", content: facts.problemDescription ?? placeholder("problem description") },
        ],
        evidenceList: input.evidenceList ?? [],
        legalGrounds: [],
        warnings: [{ id: `warn_${Date.now()}`, message: "Human legal review recommended before using this draft due to higher-risk indicators.", severity: "blocked" }],
        isHighRisk: true,
        disclaimer: "This draft is general information, not legal advice. Have a qualified lawyer review before use.",
        safetyBanner: "DRAFT — REVIEW BEFORE USING — Human legal review recommended. NyayaSetu generated this from your confirmed information and verified sources.",
        placeholders: ["High-risk case — human review needed"],
      };
    }

    const placeholders: string[] = [];
    const sections: ComplaintDraftSection[] = [];

    // 1. Complainant - editable
    sections.push({ heading: "1. Complainant", content: placeholder("complainant name and contact"), editable: true, fieldKey: "complainantName" });
    placeholders.push("complainant name");
    sections.push({ heading: "1a. Complainant Address", content: placeholder("complainant address"), editable: true, fieldKey: "complainantAddress", isPlaceholder: true });

    // 2. Seller / Service Provider - editable
    const seller = facts.sellerOrProvider ?? (input.confirmedDocumentFacts?.find((f) => f.field === "seller")?.value as string | undefined);
    sections.push({
      heading: "2. Seller / Service Provider",
      content: seller ? `${seller}` : placeholder("seller / service provider name and address if known"),
      isPlaceholder: !seller,
      editable: true,
      fieldKey: "sellerName",
    });
    if (!seller) placeholders.push("seller address");
    sections.push({
      heading: "2a. Seller Address",
      content: placeholder("seller address"),
      editable: true,
      fieldKey: "sellerAddress",
      isPlaceholder: !facts.sellerOrProvider,
    });

    // 3. Purchase / Service Details
    const amount = facts.amountPaid?.amount ?? (input.confirmedDocumentFacts?.find((f) => f.field === "amount")?.value as number | undefined);
    const product = facts.productOrService ?? input.confirmedDocumentFacts?.find((f) => f.field === "product")?.value as string | undefined;
    const purchaseDate = facts.purchaseDate ?? input.confirmedDocumentFacts?.find((f) => f.field === "purchaseDate")?.value as string | undefined;
    const orderId = input.confirmedDocumentFacts?.find((f) => f.field === "orderId")?.value as string | undefined;

    const purchaseSection =
      `Product/Service: ${product ?? placeholder("product/service")}\n` +
      `Amount paid: ${amount ? `₹${amount}` : placeholder("amount paid")}\n` +
      `Purchase date: ${purchaseDate ?? placeholder("purchase date")}\n` +
      `Order ID: ${orderId ?? placeholder("order ID")}\n` +
      `Seller: ${seller ?? placeholder("seller")}`;

    if (!product) placeholders.push("product/service");
    if (!amount) placeholders.push("amount paid");
    if (!purchaseDate) placeholders.push("purchase date");
    if (!orderId) placeholders.push("order ID");

    sections.push({ heading: "3. Purchase / Service Details", content: purchaseSection, editable: true, fieldKey: "purchaseDetails" });
    // Add separate editable sub-sections for granular editing
    sections.push({ heading: "3a. Product/Service", content: product ?? placeholder("product/service"), editable: true, fieldKey: "productOrService", isPlaceholder: !product });
    sections.push({ heading: "3b. Amount Paid", content: amount ? `₹${amount}` : placeholder("amount paid"), editable: true, fieldKey: "amount", isPlaceholder: !amount });
    sections.push({ heading: "3c. Purchase Date", content: purchaseDate ?? placeholder("purchase date"), editable: true, fieldKey: "purchaseDate", isPlaceholder: !purchaseDate });
    sections.push({ heading: "3d. Order Number", content: orderId ?? placeholder("order number"), editable: true, fieldKey: "orderNumber", isPlaceholder: !orderId });

    // 4. What Happened - editable complaint history
    sections.push({
      heading: "4. What Happened",
      content: facts.problemDescription ?? input.kase.description ?? placeholder("what happened, with dates"),
      editable: true,
      fieldKey: "complaintHistory",
    });
    if (!facts.problemDescription) placeholders.push("what happened");

    // 5. Problem
    const problem = facts.deliveryStatus === "defective" ? "The product was defective/damaged on delivery." : facts.problemDescription ?? "Problem as described above.";
    sections.push({ heading: "5. Problem", content: problem, editable: true, fieldKey: "problemDescription" });

    // 6. Steps Already Taken - editable seller response / complaint history
    const steps = facts.sellerResponse ? `You contacted the seller. Seller response: ${facts.sellerResponse}.` : "Steps taken: " + placeholder("steps already taken, e.g., contacted seller on date");
    sections.push({ heading: "6. Steps Already Taken", content: steps, editable: true, fieldKey: "sellerResponse" });
    if (!facts.sellerResponse) placeholders.push("steps already taken");

    // 7. Evidence - editable
    const evidenceList = input.evidenceList ?? [];
    sections.push({
      heading: "7. Evidence",
      content: evidenceList.length > 0 ? evidenceList.map((e) => `- ${e}`).join("\n") : placeholder("list of attached evidence (invoice, payment record, photos, chats)"),
      isPlaceholder: evidenceList.length === 0,
      editable: true,
      fieldKey: "evidenceList",
    });
    if (evidenceList.length === 0) placeholders.push("evidence list");

    // 8. Resolution Requested - editable requestedResolution
    const desired = facts.desiredOutcome ?? facts.desiredOutcomes?.[0] ?? input.desiredOutcome ?? "appropriate resolution as per law";
    sections.push({
      heading: "8. Resolution Requested",
      content: `I request: ${desired}.`,
      editable: true,
      fieldKey: "requestedResolution",
    });

    // 9. Legal Basis — only verified
    const legalGrounds = (input.verifiedLegalGrounds ?? []).filter((g) => g.verificationStatus === "verified");
    if (legalGrounds.length > 0) {
      const legalContent = legalGrounds.map((g) => `${g.citation} — ${g.claim.slice(0, 120)} [View source: ${g.sourceUrl ?? g.sourceId}]`).join("\n\n");
      sections.push({ heading: "9. Legal Basis", content: legalContent });
    } else {
      sections.push({ heading: "9. Legal Basis", content: "Legal basis unavailable from NyayaSetu's current verified sources.", isPlaceholder: true });
      placeholders.push("legal basis (verified sources not available for this part)");
    }

    // 10. Documents Attached - editable evidence list
    sections.push({
      heading: "10. Documents Attached",
      content: evidenceList.length > 0 ? evidenceList.join(", ") : placeholder("list of documents attached"),
      editable: true,
      fieldKey: "evidenceList",
    });

    // 11. Declaration - editable declarationText
    sections.push({ heading: "11. Declaration", content: "I declare that the information above is true to the best of my knowledge. I have reviewed names, dates, amounts, and facts before sending or filing.", editable: true, fieldKey: "declarationText" });

    const warnings = [];
    if (legalGrounds.length === 0) {
      warnings.push({ id: `warn_${Date.now()}`, message: "No verified legal basis is currently available for this part of the complaint from NyayaSetu's sources. Do not treat general information as specific legal provision.", severity: "info" as const });
    }

    return {
      id: `draft_${input.caseId}_${Date.now()}`,
      caseId: input.caseId,
      createdAt: now,
      updatedAt: now,
      title: "Consumer Complaint Draft",
      sections,
      evidenceList,
      legalGrounds,
      warnings,
      isHighRisk: false,
      disclaimer: "This draft was generated from information in your case and verified legal sources currently available. Check names, dates, amounts, addresses, facts and requested relief before sending or filing. This is not a guarantee of legal outcome.",
      safetyBanner: "DRAFT — REVIEW BEFORE USING\n\nNyayaSetu generated this document from information in your case and verified legal sources currently available to it.\n\nCheck names, dates, amounts, addresses, facts and requested relief before sending or filing.\n\nThis is not a guarantee of legal outcome.",
      placeholders,
    };
  }

  /** Update a draft section (draft-only edit, does not mutate case facts) */
  updateDraftSection(draft: ComplaintDraft, fieldKey: string, newContent: string): ComplaintDraft {
    const now = new Date().toISOString();
    const updatedSections = draft.sections.map((s) =>
      s.fieldKey === fieldKey ? { ...s, content: newContent, isPlaceholder: newContent.includes("[Add") } : s
    );
    const editedFields = { ...(draft.editedFields ?? {}), [fieldKey]: newContent };
    // Recompute placeholders
    const placeholders = updatedSections.filter((s) => s.isPlaceholder).map((s) => s.fieldKey ?? s.heading);
    return { ...draft, sections: updatedSections, editedFields, placeholders, updatedAt: now, lastEditedAt: now };
  }

  /** Explicitly save draft edits to case facts — preserves provenance and timeline */
  async saveDraftEditsToCaseFacts(
    caseId: ID,
    editedFields: Record<string, string>,
    opts?: { source?: string }
  ): Promise<void> {
    const { caseEngine } = await import("@/services/caseEngine.service");
    const { timelineService } = await import("@/services/timeline.service");
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found: ${caseId}`);
    const facts = { ...(kase.consumerFacts ?? {}) } as Record<string, unknown>;
    const now = new Date().toISOString();
    const source = opts?.source ?? "complaint_draft_edit";

    for (const [key, value] of Object.entries(editedFields)) {
      const prev = facts[key];
      // Map draft fields to consumerFacts keys
      const map: Record<string, string> = {
        sellerName: "sellerOrProvider",
        sellerAddress: "sellerOrProvider",
        productOrService: "productOrService",
        amount: "amountPaid",
        purchaseDate: "purchaseDate",
        orderNumber: "orderId",
        complaintHistory: "problemDescription",
        sellerResponse: "sellerResponse",
        requestedResolution: "desiredOutcome",
      };
      const targetKey = map[key] ?? key;
      if (targetKey === "amountPaid") {
        const num = parseFloat(value.replace(/[₹,]/g, ""));
        if (!isNaN(num)) facts[targetKey] = { amount: num, currency: "INR" } as unknown;
        else facts[targetKey] = value;
      } else {
        facts[targetKey] = value;
      }

      await timelineService.addEvent({
        caseId,
        type: "fact_updated",
        title: `Fact updated from draft: ${targetKey}`,
        description: `Draft edit "${value.slice(0, 80)}" saved to case facts (source: ${source})`,
        source: "user_reported",
        metadata: { field: targetKey, previousValue: prev, newValue: facts[targetKey], source, editedField: key },
      });
    }
    // Include edit timestamp in consumerFacts provenance via timeline is enough; we also store raw
    await caseEngine.updateCase(caseId, { consumerFacts: facts as ConsumerCaseFacts });
    // Also update draft lastEditedAt
    void now;
  }

  private detectHighRisk(facts: ConsumerCaseFacts, kase: Case): boolean {
    const text = `${facts.problemDescription ?? ""} ${kase.description ?? ""} ${facts.sellerResponse ?? ""}`.toLowerCase();
    return (
      text.includes("legal notice") ||
      text.includes("court summons") ||
      text.includes("hearing") ||
      text.includes("case number") ||
      text.includes("criminal") ||
      text.includes("arrest") ||
      text.includes("domestic violence") ||
      text.includes("immediate physical danger") ||
      text.includes("violence") ||
      text.includes("threats") ||
      text.includes("kidnapping") ||
      text.includes("self-harm")
    );
  }
}

export const complaintDraftService = new ConsumerComplaintDraftService();
