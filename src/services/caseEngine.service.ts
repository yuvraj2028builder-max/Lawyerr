/**
 * CaseEngine — owns Case lifecycle, in-memory for now.
 * Later backed by API / Firestore with minimal PII retention.
 *
 * Responsibilities:
 * - create / get / update / delete Case
 * - append messages
 * - attach facts/entities
 * - transition status
 */

import type { Case, CaseMessage, CaseFact, CaseStatus, ID } from "@/types/domain";

export interface ICaseEngine {
  createCase(input: Partial<Case> & { description: string }): Promise<Case>;
  getCase(id: ID): Promise<Case | null>;
  listCases(userId: ID): Promise<Case[]>;
  updateCase(id: ID, patch: Partial<Case>): Promise<Case>;
  deleteCase(id: ID): Promise<void>;
  addMessage(caseId: ID, message: Omit<CaseMessage, "id" | "caseId" | "createdAt">): Promise<CaseMessage>;
  addFact(caseId: ID, fact: Omit<CaseFact, "id">): Promise<CaseFact>;
  transitionStatus(caseId: ID, status: CaseStatus): Promise<Case>;
}

// In-memory store — safe for foundation, no persistence claims
class InMemoryCaseEngine implements ICaseEngine {
  private cases = new Map<ID, Case>();
  private messages = new Map<ID, CaseMessage[]>();

  private genId(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
  }

  async createCase(input: Partial<Case> & { description: string }): Promise<Case> {
    const now = new Date().toISOString();
    const id = this.genId("case");
    const c: Case = {
      id,
      userId: input.userId ?? "local_user",
      createdAt: now,
      updatedAt: now,
      status: "intake",
      problemCategory: input.problemCategory ?? null,
      problemCategoryConfidence: null,
      title: (input.title ?? input.description.slice(0, 60)) || "New case",
      description: input.description,
      facts: input.facts ?? [],
      entities: input.entities ?? [],
      money: input.money ?? null,
      documents: [],
      evidence: [],
      deadlines: [],
      analysis: null,
      actionPlan: null,
      escalation: null,
      domain: input.domain,
      consumerFacts: input.consumerFacts,
      consumerIssueTypes: input.consumerIssueTypes,
      timeline: input.timeline ?? [],
      verifiedDeadlines: input.verifiedDeadlines ?? [],
      documentUploads: input.documentUploads ?? [],
      complaintDraft: input.complaintDraft,
      isDemo: input.isDemo ?? false,
    };
    this.cases.set(id, c);
    this.messages.set(id, []);
    return c;
  }

  async getCase(id: ID): Promise<Case | null> {
    return this.cases.get(id) ?? null;
  }

  async listCases(userId: ID): Promise<Case[]> {
    return Array.from(this.cases.values()).filter((c) => c.userId === userId);
  }

  async updateCase(id: ID, patch: Partial<Case>): Promise<Case> {
    const existing = this.cases.get(id);
    if (!existing) throw new Error(`Case not found: ${id}`);
    const updated: Case = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.cases.set(id, updated);
    return updated;
  }

  async deleteCase(id: ID): Promise<void> {
    this.cases.delete(id);
    this.messages.delete(id);
  }

  async addMessage(
    caseId: ID,
    message: Omit<CaseMessage, "id" | "caseId" | "createdAt">
  ): Promise<CaseMessage> {
    const msg: CaseMessage = {
      id: this.genId("msg"),
      caseId,
      createdAt: new Date().toISOString(),
      ...message,
    };
    const list = this.messages.get(caseId) ?? [];
    list.push(msg);
    this.messages.set(caseId, list);
    // also bump case updatedAt
    const c = this.cases.get(caseId);
    if (c) this.cases.set(caseId, { ...c, updatedAt: msg.createdAt });
    return msg;
  }

  async addFact(caseId: ID, fact: Omit<CaseFact, "id">): Promise<CaseFact> {
    const c = this.cases.get(caseId);
    if (!c) throw new Error(`Case not found: ${caseId}`);
    const f: CaseFact = { id: this.genId("fact"), ...fact };
    const updated = { ...c, facts: [...c.facts, f], updatedAt: new Date().toISOString() };
    this.cases.set(caseId, updated);
    return f;
  }

  async transitionStatus(caseId: ID, status: CaseStatus): Promise<Case> {
    return this.updateCase(caseId, { status });
  }

  // For testing / demo
  __getMessages(caseId: ID): CaseMessage[] {
    return this.messages.get(caseId) ?? [];
  }
  __clear() {
    this.cases.clear();
    this.messages.clear();
  }
  __seed(cases: Case[]) {
    cases.forEach((c) => {
      this.cases.set(c.id, c);
      if (!this.messages.has(c.id)) this.messages.set(c.id, []);
    });
  }
}

export const caseEngine: ICaseEngine & { __seed(cases: Case[]): void; __clear(): void; __getMessages(id: ID): CaseMessage[] } =
  new InMemoryCaseEngine() as unknown as InMemoryCaseEngine & { __seed: (cases: Case[]) => void; __clear: () => void; __getMessages: (id: ID) => CaseMessage[] };

// Also export class for testing
export { InMemoryCaseEngine };
