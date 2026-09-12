/**
 * Consumer Action Plan Service — deterministic, grounded, fail-closed.
 * Turns structured facts + verified legal retrieval into 3-7 useful actions.
 * No LLM, no invented law.
 */

import type {
  ConsumerCaseFacts,
  ConsumerIssueType,
  ConsumerEvidenceType,
  ConsumerDesiredOutcome,
  RetrievalPassage,
  ActionPlan,
  ActionItem,
  EvidenceTask,
  LegalGround,
  ActionWarning,
  Deadline,
  ID,
} from "@/types/domain";
import { escalationService } from "@/services/escalation.service";
import { timelineService } from "@/services/timeline.service";

export interface GenerateConsumerActionPlanInput {
  caseId: ID;
  facts: ConsumerCaseFacts;
  issueTypes: ConsumerIssueType[];
  evidenceTypes: ConsumerEvidenceType[];
  desiredOutcomes: ConsumerDesiredOutcome[];
  verifiedPassages: RetrievalPassage[]; // only verified production passages
  allPassages?: RetrievalPassage[]; // for transparency (including unverified)
  isDemo?: boolean;
  currentPlanVersion?: number;
  hasLegalNotice?: boolean;
  isHighRisk?: boolean;
  isEmergency?: boolean;
}

function hashFacts(facts: ConsumerCaseFacts): string {
  return JSON.stringify(facts).slice(0, 64);
}

function isUrgent(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("summons") || lower.includes("court") || lower.includes("legal notice") || lower.includes("hearing") || lower.includes("notice");
}

export class ConsumerActionPlanService {
  async generate(input: GenerateConsumerActionPlanInput): Promise<ActionPlan> {
    const now = new Date().toISOString();
    const version = (input.currentPlanVersion ?? 0) + 1;
    const factsVersion = hashFacts(input.facts);

    // Emergency / higher risk handling — route to human help, not normal plan
    if (input.isEmergency) {
      return this.emergencyPlan(input, now, version, factsVersion);
    }

    if (input.hasLegalNotice || isUrgent(JSON.stringify(input.facts))) {
      return this.legalNoticePlan(input, now, version, factsVersion);
    }

    // Insufficient facts — fail safely, needs_information
    const hasCore = !!input.facts.productOrService || !!input.facts.problemDescription;
    const hasIssue = input.issueTypes.length > 0;
    if (!hasCore && !hasIssue) {
      return this.needsInformationPlan(input, now, version, factsVersion);
    }

    // Domain check — if no consumer issue and no product, insufficient
    if (input.issueTypes.length === 0 && !input.facts.productOrService && !input.facts.problemDescription) {
      return this.needsInformationPlan(input, now, version, factsVersion);
    }

    // Determine if we have any verified legal grounds
    const hasVerified = input.verifiedPassages.length > 0 && input.verifiedPassages.every((p) => p.verified && p.productionAllowed);
    const hasAnyVerified = input.verifiedPassages.length > 0;

    // Build legal grounds from verified passages — traceable
    const legalGrounds: LegalGround[] = input.verifiedPassages
      .filter((p) => p.verified && p.productionAllowed && !p.source.isMock && p.source.sourceType !== "TEST_FIXTURE")
      .slice(0, 3)
      .map((p) => ({
        claim: p.provision.text.slice(0, 180),
        sourceId: p.source.id,
        provisionId: p.provision.id,
        citation: `${p.source.title} — ${p.provision.sectionIdentifier}`,
        sourceType: p.source.sourceType === "PRIMARY_OFFICIAL" ? (p.provision.provisionKind === "legal_provision" ? "rule" as const : "statute" as const) : "official_procedure" as const,
        verificationStatus: "verified" as const,
        supportsAction: true,
        provisionKind: p.provision.provisionKind,
        sourceUrl: p.source.sourceUrl || p.source.url,
      }));

    // If no verified grounds, warn but still provide practical steps (fail closed — no fake legal claim)
    const warnings: ActionWarning[] = [];
    if (!hasVerified) {
      warnings.push({
        id: `warn_${Date.now()}_1`,
        message: "Legal grounding unavailable for this specific claim. The steps below are practical suggestions that don't require a legal conclusion.",
        severity: hasAnyVerified ? "warning" : "info",
      });
    }

    // Evidence tasks — important vs helpful vs optional
    const evidenceTasks = this.buildEvidenceTasks(input);

    // Actions — deterministic rules
    const actions = this.buildActions(input, legalGrounds, hasVerified);

    // Deadlines — only if verified source contains time limit (48 hours / one month)
    const deadlines = this.buildDeadlines(input.verifiedPassages, input.caseId);

    // Escalation — use existing service but map to consumer
    const escalation = await escalationService.assess({
      id: input.caseId,
      userId: "local_user",
      createdAt: now,
      updatedAt: now,
      status: "action_ready",
      problemCategory: "consumer_complaint",
      problemCategoryConfidence: 0.9,
      title: input.facts.productOrService ?? "Consumer case",
      description: input.facts.problemDescription ?? "",
      facts: [],
      entities: [],
      money: input.facts.amountPaid ?? null,
      documents: [],
      evidence: [],
      deadlines,
      analysis: null,
      actionPlan: null,
      escalation: null,
    } as never);

    // Determine status
    let status: ActionPlan["status"] = "grounded";
    if (!hasCore) status = "needs_information";
    else if (!hasVerified && actions.some((a) => a.isLegalRequirement)) status = "blocked";
    else if (warnings.some((w) => w.severity === "blocked")) status = "blocked";
    else if (hasVerified) status = "grounded";
    else status = "draft";

    // Summary — generated from structured facts, not invented
    const summary = this.buildSummary(input);

    const plan: ActionPlan = {
      id: `plan_${input.caseId}_${version}`,
      caseId: input.caseId,
      status,
      createdAt: now,
      updatedAt: now,
      generatedAt: now,
      planVersion: version,
      basedOnFactsVersion: factsVersion,
      summary,
      items: actions,
      actions,
      evidenceTasks,
      legalGrounds,
      warnings,
      deadlines: deadlines.length > 0 ? deadlines : undefined,
      escalation,
      disclaimer: "This is general information based on the facts you provided and verified sources. It is not a guarantee of outcome or a substitute for advice from a qualified lawyer.",
      isMock: !!input.isDemo || !hasVerified,
      sourceTraceIds: legalGrounds.map((g) => g.sourceId),
      humanReviewRecommended: isUrgent(JSON.stringify(input.facts)) || (input.facts.amountPaid?.amount ?? 0) > 100000,
      higherRisk: isUrgent(JSON.stringify(input.facts)),
    };

    // Timeline: plan_generated / plan_regenerated
    try {
      const type = version > 1 ? "plan_regenerated" : "plan_generated";
      const title = version > 1 ? `Action plan updated to v${version}` : "Action plan generated";
      await timelineService.addEvent({
        caseId: input.caseId,
        type: type as never,
        title,
        description: summary.slice(0, 120),
        source: "system",
        metadata: { planVersion: version, status, isMock: plan.isMock },
      });
    } catch {
      // non-fatal
    }

    return plan;
  }

  private buildSummary(input: GenerateConsumerActionPlanInput): string {
    const parts: string[] = [];
    if (input.facts.productOrService) {
      const amt = input.facts.amountPaid ? ` for ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(input.facts.amountPaid.amount)}` : "";
      parts.push(`You bought ${input.facts.productOrService}${amt}${input.facts.sellerOrProvider ? ` from ${input.facts.sellerOrProvider}` : ""}.`);
    }
    if (input.facts.deliveryStatus === "defective") parts.push("It arrived defective/damaged.");
    if (input.facts.deliveryStatus === "not_delivered") parts.push("It was not delivered.");
    const sellerResp = input.facts.sellerResponse;
    if (sellerResp === "refused") parts.push("You contacted the seller, but they refused your requested resolution.");
    else if (sellerResp === "no response") parts.push("You contacted the seller but have received no response.");
    else if (sellerResp === "not_contacted") parts.push("You have not contacted the seller yet.");
    if (input.desiredOutcomes[0] === "refund") parts.push("You want a refund.");
    else if (input.desiredOutcomes[0] === "replacement") parts.push("You want a replacement.");
    else if (input.desiredOutcomes[0]) parts.push(`You want: ${input.desiredOutcomes[0]}.`);
    const base = parts.join(" ") || input.facts.problemDescription || "Consumer issue described.";
    const issue = input.issueTypes.length > 0 ? ` This appears to involve ${input.issueTypes.join(", ")}.` : "";
    return base + issue;
  }

  private buildEvidenceTasks(input: GenerateConsumerActionPlanInput): EvidenceTask[] {
    const have = new Set(input.evidenceTypes);
    const tasks: EvidenceTask[] = [
      {
        id: "ev_invoice",
        label: "Invoice / receipt",
        description: "Proof of purchase, order ID and amount",
        requiredLevel: "important",
        status: have.has("invoice_receipt") ? "available" : "missing",
      },
      {
        id: "ev_order",
        label: "Order / delivery details",
        description: "Order confirmation, delivery tracking, date",
        requiredLevel: "important",
        status: have.has("payment_record") || have.has("invoice_receipt") ? "available" : "missing",
      },
      {
        id: "ev_defect",
        label: "Photos / videos of defect",
        description: "Clear photos showing the defect or damage",
        requiredLevel: input.issueTypes.includes("defective_product") ? "important" : "helpful",
        status: have.has("photos_videos") ? "available" : "missing",
      },
      {
        id: "ev_chat",
        label: "Seller messages / chats",
        description: "Screenshots of seller refusing or acknowledging",
        requiredLevel: input.facts.sellerResponse === "refused" || input.facts.writtenComplaintMade ? "important" : "helpful",
        status: have.has("screenshots_chats") || have.has("emails") ? "available" : "missing",
      },
      {
        id: "ev_payment",
        label: "Payment record",
        description: "Bank/UPI record showing payment",
        requiredLevel: "helpful",
        status: have.has("payment_record") ? "available" : "missing",
      },
      {
        id: "ev_warranty",
        label: "Warranty / terms",
        description: "Warranty card or terms if applicable",
        requiredLevel: input.issueTypes.includes("warranty_issue") ? "important" : "optional",
        status: have.has("agreement_terms") ? "available" : "unknown",
      },
    ];
    // Only return 4-6 tasks, prioritize important
    return tasks.filter((t) => t.requiredLevel !== "optional" || have.has(t.label as never)).slice(0, 6);
  }

  private buildActions(input: GenerateConsumerActionPlanInput, legalGrounds: LegalGround[], _hasVerified: boolean): ActionItem[] {
    const actions: ActionItem[] = [];
    const now = new Date().toISOString();
    let order = 1;

    const add = (a: Omit<ActionItem, "id" | "caseId" | "order" | "createdAt" | "updatedAt"> & { id?: string }) => {
      actions.push({
        id: a.id ?? `act_${input.caseId}_${order}`,
        caseId: input.caseId,
        order: order++,
        createdAt: now,
        updatedAt: now,
        ...a,
      } as ActionItem);
    };

    // Check for specific provisions to ground actions
    const hasGrievanceProvision = input.verifiedPassages.some((p) => p.provision.sectionIdentifier.includes("6(4)") || p.provision.text.toLowerCase().includes("grievance officer"));

    // NOW — preserve evidence (practical, not legal requirement)
    add({
      title: "Gather your proof",
      description: "Keep your invoice, order details, photos of the defect and messages with the seller together in one folder.",
      category: "preserve_evidence",
      priority: "today",
      status: "pending",
      isLegalAdvice: false,
      isLegalRequirement: false,
      confidence: "high",
    });

    // NOW — send written complaint or keep refusal (depending on seller response)
    if (input.facts.sellerResponse === "refused") {
      add({
        title: "Keep proof of seller's refusal",
        description: "Save the seller’s message refusing refund/replacement and the date you received it.",
        category: "preserve_evidence",
        priority: "today",
        status: "pending",
        isLegalAdvice: false,
        isLegalRequirement: false,
        confidence: "high",
      });
    } else if (!input.facts.writtenComplaintMade || input.facts.sellerResponse === "not_contacted" || !input.facts.sellerResponse) {
      add({
        title: "Send a written complaint to the seller",
        description: hasGrievanceProvision
          ? "Clearly state what you bought, what went wrong, and what resolution you want. The seller’s grievance officer should acknowledge within 48 hours and redress within one month (Consumer Protection (E-Commerce) Rules, 2020 — Rule 6(4)(b)). Keep proof you sent it."
          : "Clearly state what you bought, what went wrong, and what resolution you want (e.g., refund). Give the seller a reasonable opportunity to respond and keep proof you sent it.",
        category: "send_notice",
        priority: "today",
        status: "pending",
        isLegalAdvice: false,
        isLegalRequirement: hasGrievanceProvision,
        confidence: hasGrievanceProvision ? "high" : "medium",
        sourceRefs: hasGrievanceProvision ? legalGrounds.filter((g) => g.provisionId?.includes("6(4)")).map((g) => g.sourceId) : [],
      });
    }

    // NEXT — keep response / follow up
    add({
      title: "Keep the response",
      description: "Save the seller’s reply or proof that no response was received (screenshots, emails).",
      category: "follow_up",
      priority: "next",
      status: "pending",
      isLegalAdvice: false,
      isLegalRequirement: false,
      confidence: "high",
    });

    // IF UNRESOLVED — official grievance route (only if seller contacted and unresolved)
    const sellerContacted = input.facts.sellerResponse === "refused" || input.facts.sellerResponse === "no response" || input.facts.writtenComplaintMade;
    if (sellerContacted) {
      const hasOfficialProcedure = input.verifiedPassages.some((p) => p.provision.provisionKind === "official_procedure");
      add({
        title: "Use the appropriate consumer grievance route if not resolved",
        description: hasOfficialProcedure
          ? "If the seller doesn’t resolve it, you may use the National Consumer Helpline (consumerhelpline.gov.in) or E-Jagriti (e-jagriti.gov.in) as per official procedure. Keep the complaint/reference number."
          : "If the seller doesn’t resolve it, consider the appropriate official consumer grievance route for your situation and keep the reference number.",
        category: "file_grievance",
        priority: "if_no_response",
        status: "pending",
        isLegalAdvice: false,
        isLegalRequirement: false,
        confidence: hasOfficialProcedure ? "high" : "medium",
        sourceRefs: hasOfficialProcedure ? legalGrounds.filter((g) => g.provisionKind === "official_procedure").map((g) => g.sourceId) : [],
      });
    }

    // IF CONTINUES — escalation (only if amount large or repeated refusal)
    const largeAmount = (input.facts.amountPaid?.amount ?? 0) > 50000;
    if (sellerContacted && (largeAmount || input.issueTypes.includes("defective_product"))) {
      add({
        title: "Consider escalation if needed",
        description: "If the grievance remains unresolved, you may explore escalation to the appropriate consumer forum/process. Keep all records organized.",
        category: "escalate",
        priority: "if_no_response",
        status: "pending",
        isLegalAdvice: false,
        isLegalRequirement: false,
        confidence: "medium",
      });
    }

    // Filter to 3-7 actions
    return actions.slice(0, 7);
  }

  private buildDeadlines(passages: RetrievalPassage[], caseId: string): Deadline[] {
    const deadlines: Deadline[] = [];
    const now = Date.now();
    for (const p of passages) {
      const txt = p.provision.text.toLowerCase();
      if (txt.includes("within forty-eight hours") || txt.includes("within 48 hours")) {
        deadlines.push({
          id: `dl_${caseId}_48h`,
          caseId,
          label: "Seller grievance officer should acknowledge within 48 hours (Rule 6(4)(b))",
          kind: "response_due",
          date: new Date(now + 48 * 3600 * 1000).toISOString(),
          isEstimated: true,
          urgency: "upcoming",
          source: "legal_source",
          relatedActionId: undefined,
        });
      }
      if (txt.includes("within one month") || txt.includes("within a month")) {
        deadlines.push({
          id: `dl_${caseId}_1m`,
          caseId,
          label: "Seller should redress complaint within one month (Rule 6(4)(b))",
          kind: "response_due",
          date: new Date(now + 30 * 24 * 3600 * 1000).toISOString(),
          isEstimated: true,
          urgency: "upcoming",
          source: "legal_source",
        });
      }
    }
    // De-duplicate by label
    return Array.from(new Map(deadlines.map((d) => [d.label, d])).values());
  }

  private needsInformationPlan(input: GenerateConsumerActionPlanInput, now: string, version: number, factsVersion: string): ActionPlan {
    return {
      id: `plan_${input.caseId}_${version}`,
      caseId: input.caseId,
      status: "needs_information",
      createdAt: now,
      updatedAt: now,
      generatedAt: now,
      planVersion: version,
      basedOnFactsVersion: factsVersion,
      summary: "I need a little more information before I can build a useful action plan.",
      items: [
        {
          id: `act_${input.caseId}_1`,
          caseId: input.caseId,
          order: 1,
          title: "Tell us what you bought and what went wrong",
          description: "Share product/service, seller, amount, and what happened after you contacted them.",
          category: "other",
          priority: "today",
          status: "pending",
          isLegalAdvice: false,
          confidence: "high",
          createdAt: now,
          updatedAt: now,
        },
      ],
      evidenceTasks: [],
      legalGrounds: [],
      warnings: [{ id: `warn_${Date.now()}`, message: "Not enough facts to build a grounded plan. Please complete the intake questions.", severity: "info" }],
      disclaimer: "This is general information. It is not legal advice.",
      isMock: true,
      sourceTraceIds: [],
    };
  }

  private legalNoticePlan(input: GenerateConsumerActionPlanInput, now: string, version: number, factsVersion: string): ActionPlan {
    return {
      id: `plan_${input.caseId}_${version}`,
      caseId: input.caseId,
      status: "blocked",
      createdAt: now,
      updatedAt: now,
      generatedAt: now,
      planVersion: version,
      basedOnFactsVersion: factsVersion,
      summary: "This involves a legal notice or commission matter. The appropriate next step may be different and is higher risk.",
      items: [
        {
          id: `act_${input.caseId}_1`,
          caseId: input.caseId,
          order: 1,
          title: "Seek human review promptly",
          description: "Because a legal notice/commission hearing is involved, consider contacting a lawyer or legal aid quickly. Keep all notices and case numbers safe.",
          category: "escalate",
          priority: "today",
          status: "pending",
          isLegalAdvice: false,
          confidence: "high",
          createdAt: now,
          updatedAt: now,
        },
      ],
      evidenceTasks: [],
      legalGrounds: [],
      warnings: [{ id: `warn_${Date.now()}`, message: "Higher risk: legal notice/commission matter detected. This plan is limited and human review is recommended.", severity: "warning" }],
      disclaimer: "This is general information, not legal advice. For notices/commission matters, seek qualified legal help promptly.",
      isMock: true,
      sourceTraceIds: [],
      humanReviewRecommended: true,
      higherRisk: true,
    };
  }

  private emergencyPlan(input: GenerateConsumerActionPlanInput, now: string, version: number, factsVersion: string): ActionPlan {
    return {
      id: `plan_${input.caseId}_${version}`,
      caseId: input.caseId,
      status: "blocked",
      createdAt: now,
      updatedAt: now,
      generatedAt: now,
      planVersion: version,
      basedOnFactsVersion: factsVersion,
      summary: "If there is immediate physical danger, please seek emergency help first.",
      items: [
        {
          id: `act_${input.caseId}_1`,
          caseId: input.caseId,
          order: 1,
          title: "Seek emergency help if needed",
          description: "If you are in immediate danger, contact emergency services or a trusted person right away.",
          category: "other",
          priority: "today",
          status: "pending",
          isLegalAdvice: false,
          confidence: "high",
          createdAt: now,
          updatedAt: now,
        },
      ],
      evidenceTasks: [],
      legalGrounds: [],
      warnings: [{ id: `warn_${Date.now()}`, message: "This is not an emergency system. For immediate danger, contact emergency services.", severity: "blocked" }],
      disclaimer: "Not an emergency system.",
      isMock: true,
      sourceTraceIds: [],
      higherRisk: true,
    };
  }

  // Update status for UI completion — also records timeline
  async updateActionStatus(plan: ActionPlan, actionId: string, status: ActionPlan["items"][number]["status"]): Promise<ActionPlan> {
    const item = plan.items.find((a) => a.id === actionId);
    if (!item) throw new Error(`Action not found: ${actionId}`);
    const prev = item.status;
    item.status = status;
    item.updatedAt = new Date().toISOString();
    plan.updatedAt = new Date().toISOString();
    try {
      const isCompleted = status === "done" && prev !== "done";
      const isReopened = status !== "done" && prev === "done";
      await timelineService.addEvent({
        caseId: plan.caseId,
        type: isCompleted ? "action_completed" : isReopened ? "action_reopened" : "action_completed",
        title: isCompleted ? `You marked "${item.title}" as completed` : isReopened ? `You reopened "${item.title}"` : `Action "${item.title}" updated to ${status}`,
        description: item.description.slice(0, 120),
        source: "system",
        metadata: { actionId, status, prevStatus: prev },
      });
    } catch {
      // non-fatal
    }
    return plan;
  }
}

export const consumerActionPlanService = new ConsumerActionPlanService();
