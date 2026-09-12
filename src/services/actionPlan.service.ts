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
  updateStatus(planId: ID, actionId: ID, status: ActionPlan["items"][number]["status"]): Promise<ActionPlan>;
}

class MockActionPlanService implements IActionPlanService {
  async generate(input: GenerateActionPlanInput): Promise<ActionPlan> {
    const c = input.case;
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
          description: "Save rent agreement, payment proof, and any messages about the issue in one folder.",
          status: "pending",
          isLegalAdvice: false,
        },
        {
          id: "act_today_2",
          caseId: c.id,
          priority: "today",
          title: "Write down what happened with dates",
          description: "Note key dates — when you paid, when you left, when you asked for money back.",
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

  async updateStatus(planId: ID, _actionId: ID, _status: ActionPlan["items"][number]["status"]): Promise<ActionPlan> {
    // In-memory no-op for mock; real impl persists
    throw new Error(`Mock: updateStatus not persisted (plan ${planId}). Wire to CaseEngine in next milestone.`);
  }
}

export const actionPlanService: IActionPlanService = new MockActionPlanService();
