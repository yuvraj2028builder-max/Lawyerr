/**
 * ActionPlanService — generates structured, source-traceable action plans.
 * Prompt 1: interface + safe mock. Never invent legal deadlines.
 */

import type { ActionPlan, Case, ID } from "@/types/domain";
import { DEMO_DISCLAIMER } from "@/data/demoFixtures";

export interface GenerateActionPlanInput {
  case: Case;
}

export interface IActionPlanService {
  generate(input: GenerateActionPlanInput): Promise<ActionPlan>;
  /** Honest fallback when facts are too sparse for a real plan. */
  generateNeedsInformation(input: GenerateActionPlanInput): Promise<ActionPlan>;
  updateStatus(planId: ID, actionId: ID, status: ActionPlan["items"][number]["status"]): Promise<ActionPlan>;
}

/**
 * Per-category evidence/date wording. The rental/tenancy vocabulary below
 * belongs ONLY to tenancy categories — a consumer case must never see it.
 * (Regression: the old generic template leaked rental text into every case.)
 */
const CATEGORY_CONTENT: Record<string, { proof: string; dates: string }> = {
  consumer_complaint: {
    proof: "Keep your invoice, order details, photos of the issue, and messages with the seller together in one folder.",
    dates: "Note key dates — when you bought, when the problem appeared, and when you contacted the seller.",
  },
  security_deposit: {
    proof: "Save rent agreement, payment proof, and any messages about the issue in one folder.",
    dates: "Note key dates — when you paid, when you left, when you asked for money back.",
  },
  rent_dispute: {
    proof: "Save your tenancy agreement, rent receipts, and any messages with the other party in one folder.",
    dates: "Note key dates — when the tenancy started, when the issue arose, and what was communicated since.",
  },
  salary_delay: {
    proof: "Save your appointment letter, payslips, bank statements showing missing salary, and messages with your employer in one folder.",
    dates: "Note key dates — pay cycles missed, when you last followed up, and any written promises.",
  },
  cheque_bounce: {
    proof: "Save the cheque copy, bank return memo, and any messages about the payment in one folder.",
    dates: "Note key dates — when the cheque was given, when it bounced, and when you notified the other party.",
  },
  legal_notice: {
    proof: "Keep the notice itself, its envelope/postmark, and any related documents together. Do not lose the original.",
    dates: "Note every date on the notice — especially any reply deadline. Talk to a lawyer or DLSA quickly.",
  },
};

const NEUTRAL_CONTENT = {
  proof: "Keep any bills, receipts, photos, and messages about the issue together in one folder.",
  dates: "Note key dates — when it happened, who was involved, and what you have asked for so far.",
};

function contentFor(category: string | null): { proof: string; dates: string } {
  if (category && category in CATEGORY_CONTENT) return CATEGORY_CONTENT[category];
  return NEUTRAL_CONTENT;
}

class MockActionPlanService implements IActionPlanService {
  async generate(input: GenerateActionPlanInput): Promise<ActionPlan> {
    const c = input.case;
    const content = contentFor(c.problemCategory);
    const now = new Date().toISOString();
    // Honest mock: structure without fake legal claims
    const plan: ActionPlan = {
      id: `plan_${Math.random().toString(36).slice(2, 9)}`,
      caseId: c.id,
      createdAt: now,
      updatedAt: now,
      summary:
        c.isDemo
          ? "This is a demo action plan showing NyayaSetu's structure. Real plans will be grounded in verified legal sources."
          : "Based on what you've shared, here are careful next steps. As verified legal information is not yet connected, this plan focuses on evidence and careful communication — not legal deadlines.",
      items: [
        {
          id: "act_today_1",
          caseId: c.id,
          priority: "today",
          title: "Keep all proof in one place",
          description: content.proof,
          status: "pending",
          isLegalAdvice: false,
        },
        {
          id: "act_today_2",
          caseId: c.id,
          priority: "today",
          title: "Write down what happened with dates",
          description: content.dates,
          status: "pending",
          isLegalAdvice: false,
        },
        {
          id: "act_next_1",
          caseId: c.id,
          priority: "next",
          title: "Send (or save) a calm written request",
          description: "If you haven't already, send a polite written message stating the amount and asking for a clear reply date. Keep it saved.",
          status: "pending",
          isLegalAdvice: false,
        },
        {
          id: "act_if_1",
          caseId: c.id,
          priority: "if_no_response",
          title: "Decide next step if no reply",
          description: "If there's no response, we can help you explore mediation, legal-aid, or lawyer options — honestly and without pressure.",
          status: "pending",
          isLegalAdvice: false,
        },
      ],
      disclaimer: DEMO_DISCLAIMER,
      isMock: true,
      sourceTraceIds: [],
    };
    return plan;
  }

  async generateNeedsInformation(input: GenerateActionPlanInput): Promise<ActionPlan> {
    const c = input.case;
    const now = new Date().toISOString();
    return {
      id: `plan_${Math.random().toString(36).slice(2, 9)}`,
      caseId: c.id,
      status: "needs_information",
      createdAt: now,
      updatedAt: now,
      summary: "Not enough information yet — tell us a little more and we'll build your next steps.",
      items: [
        {
          id: "act_info_1",
          caseId: c.id,
          priority: "today",
          title: "Share what you bought and what went wrong",
          description: "Add the product or service, the seller, the amount involved, and what happened after you contacted them. Then we'll build your plan.",
          status: "pending",
          isLegalAdvice: false,
        },
      ],
      disclaimer: DEMO_DISCLAIMER,
      isMock: true,
      sourceTraceIds: [],
    };
  }

  async updateStatus(planId: ID, _actionId: ID, _status: ActionPlan["items"][number]["status"]): Promise<ActionPlan> {
    // In-memory no-op for mock; real impl persists
    throw new Error(`Mock: updateStatus not persisted (plan ${planId}). Wire to CaseEngine in next milestone.`);
  }
}

export const actionPlanService: IActionPlanService = new MockActionPlanService();
