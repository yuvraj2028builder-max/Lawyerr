/**
 * API boundaries — typed contracts for future server routes.
 * Only mock local implementations for now. No fake network.
 *
 * Intended routes (server will implement later):
 *   POST   /api/cases
 *   GET    /api/cases/:id
 *   POST   /api/cases/:id/messages
 *   POST   /api/cases/:id/documents
 *   GET    /api/cases/:id/actions
 *   GET    /api/cases/:id/deadlines
 *   POST   /api/legal/search
 *   POST   /api/legal/analyze
 */

import type { Case, CaseMessage, DocumentRef, ActionPlan, Deadline } from "@/types/domain";
import { caseEngine } from "./caseEngine.service";
import { legalKnowledgeService, type LegalSearchParams, type LegalSearchResult } from "./legalKnowledge.service";
import { actionPlanService } from "./actionPlan.service";

// ─── Typed API surface ────────────────────────────────────────────────────────

export const api = {
  // Cases
  async createCase(input: { description: string; title?: string }): Promise<Case> {
    return caseEngine.createCase(input);
  },
  async getCase(id: string): Promise<Case | null> {
    return caseEngine.getCase(id);
  },
  async addMessage(caseId: string, content: string, role: CaseMessage["role"] = "user"): Promise<CaseMessage> {
    return caseEngine.addMessage(caseId, { role, content });
  },

  // Documents (mock)
  async listDocuments(_caseId: string): Promise<DocumentRef[]> {
    return [];
  },

  // Actions
  async getActionPlan(caseId: string): Promise<ActionPlan | null> {
    const c = await caseEngine.getCase(caseId);
    if (!c) return null;
    if (c.actionPlan) return c.actionPlan;
    return actionPlanService.generate({ case: c });
  },

  async getDeadlines(caseId: string): Promise<Deadline[]> {
    const c = await caseEngine.getCase(caseId);
    return c?.deadlines ?? [];
  },

  // Legal
  async legalSearch(params: LegalSearchParams): Promise<LegalSearchResult> {
    return legalKnowledgeService.search(params);
  },
};

// Error envelope for UI
export function toApiError(e: unknown): { message: string; retryable: boolean } {
  if (e instanceof Error) return { message: e.message, retryable: false };
  return { message: "Something went wrong. Please try again.", retryable: true };
}
