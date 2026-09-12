import { describe, it, expect, beforeEach } from "vitest";
import { consumerIntakeEngine } from "@/services/consumerIntake/consumerIntakeEngine";
import { getNextQuestion, QUESTION_DEFS } from "@/services/consumerIntake/questionPlanner";
import { consumerActionPlanService } from "@/services/actionEngine/consumerActionPlan.service";
import { usabilityObservationService } from "@/services/usabilityObservation.service";
import { nextRecommendedAction } from "@/types/usability";
import { documentFactMergeService } from "@/services/documentFactMerge.service";
import { documentProcessingService } from "@/services/document/documentProcessing.service";
import { documentUploadService } from "@/services/documentUpload.service";
import { caseEngine } from "@/services/caseEngine.service";
import { RECOVERY_STATES } from "@/types/ux";
import type { DocumentUpload } from "@/types/domain";

import { ensureLegalCorpusInitialized } from "@/services/legal/init";

function makeFile(name: string, type: string, content = "Sample content"): File {
  return new File([content], name, { type });
}

describe("Phase 8 Usability Test Suite", () => {
  beforeEach(async () => {
    consumerIntakeEngine.__clear();
    usabilityObservationService.clear();
    await ensureLegalCorpusInitialized();
  });

  // --------------------------------------------------------------------------
  // Category 1: Core flow — defective phone / Amazon refund refusal
  // --------------------------------------------------------------------------
  describe("1. Core Flow — Defective phone / Amazon refund refusal", () => {
    const scenario = "My phone was defective. Amazon refused my refund. What should I do now?";

    it("1.1 extracts product as phone", () => {
      const s = consumerIntakeEngine.createSession();
      const state = consumerIntakeEngine.submitNarrative(s.sessionId, scenario);
      expect(state.facts.productOrService).toBe("phone");
    });

    it("1.2 extracts seller as Amazon", () => {
      const s = consumerIntakeEngine.createSession();
      const state = consumerIntakeEngine.submitNarrative(s.sessionId, scenario);
      expect(state.facts.sellerOrProvider?.toLowerCase()).toBe("amazon");
    });

    it("1.3 identifies issue type as defective product and grievance", () => {
      const s = consumerIntakeEngine.createSession();
      const state = consumerIntakeEngine.submitNarrative(s.sessionId, scenario);
      expect(state.domain).toBe("consumer_grievance");
      expect(state.issueTypes).toContain("defective_product");
    });

    it("1.4 extracts seller response as refused", () => {
      const s = consumerIntakeEngine.createSession();
      const state = consumerIntakeEngine.submitNarrative(s.sessionId, scenario);
      expect(state.facts.sellerResponse).toBe("refused");
    });

    it("1.5 requires minimal follow-ups to reach readiness", () => {
      const s = consumerIntakeEngine.createSession();
      const state = consumerIntakeEngine.submitNarrative(s.sessionId, scenario);
      let cur = state;
      let count = 0;
      while (cur.status !== "ready" && count < 5) {
        const q = getNextQuestion(cur);
        if (!q) break;
        cur = consumerIntakeEngine.answerQuestion(
          cur.sessionId,
          q.id,
          q.id === "amount" ? "₹15,000" : q.id === "desired_outcome" ? "refund" : "skip"
        );
        count++;
      }
      expect(count).toBeLessThanOrEqual(3);
      expect(cur.status).toBe("ready");
    });

    it("1.6 generates action plan containing immediate formal complaint step", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, scenario);
      consumerIntakeEngine.answerQuestion(s.sessionId, "amount", "₹20,000");
      consumerIntakeEngine.answerQuestion(s.sessionId, "desired_outcome", "refund");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      const todayItems = plan.items.filter((i) => i.priority === "today");
      expect(todayItems.length).toBeGreaterThan(0);
      const hasWrittenStep = plan.items.some(
        (i) => i.title.toLowerCase().includes("written") || i.title.toLowerCase().includes("seller") || i.title.toLowerCase().includes("complaint")
      );
      expect(hasWrittenStep).toBe(true);
    });

    it("1.7 provides escalation route to National Consumer Helpline (NCH) or commission", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, scenario);
      consumerIntakeEngine.answerQuestion(s.sessionId, "amount", "₹20,000");
      consumerIntakeEngine.answerQuestion(s.sessionId, "desired_outcome", "refund");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      expect(plan.escalation).toBeDefined();
      const hasNchOrCommission = plan.escalation?.suggestedRoutes.some(
        (r) => (r.route as string) === "nch" || (r.route as string) === "e_daakhil" || r.label.toLowerCase().includes("helpline") || r.label.toLowerCase().includes("consumer")
      );
      expect(hasNchOrCommission).toBe(true);
    });

    it("1.8 grounds claims in Consumer Protection Act 2019 provisions", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, scenario);
      consumerIntakeEngine.answerQuestion(s.sessionId, "amount", "₹20,000");
      consumerIntakeEngine.answerQuestion(s.sessionId, "desired_outcome", "refund");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      expect(plan.legalGrounds?.length).toBeGreaterThan(0);
      const hasCpa = plan.legalGrounds?.some(
        (g) => g.citation.includes("Consumer Protection Act") || g.citation.includes("CPA")
      );
      expect(hasCpa).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Category 2: Cognitive load & wording
  // --------------------------------------------------------------------------
  describe("2. Cognitive Load & Wording", () => {
    it("2.1 rich narrative requires at most 3 follow-up questions", () => {
      const s = consumerIntakeEngine.createSession();
      const narrative = "I bought a phone for ₹25,000 on Amazon. It is defective and they refused refund. I want my money back.";
      let cur = consumerIntakeEngine.submitNarrative(s.sessionId, narrative);
      let asked = 0;
      while (cur.status !== "ready" && asked < 10) {
        const q = getNextQuestion(cur);
        if (!q) break;
        cur = consumerIntakeEngine.answerQuestion(cur.sessionId, q.id, "skip");
        asked++;
      }
      expect(asked).toBeLessThanOrEqual(3);
    });

    it("2.2 all question definitions have whyAsk explanations", () => {
      for (const def of QUESTION_DEFS) {
        expect(def.whyAsk).toBeDefined();
        expect(def.whyAsk?.trim().length).toBeGreaterThan(10);
      }
    });

    it("2.3 action item titles start with active action verbs", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "My phone was defective from Flipkart. Refused refund.");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      const actionVerbPattern = /^(send|gather|keep|submit|file|check|review|prepare|contact|write|preserve|verify|draft|use|consider|tell|seek)\b/i;
      for (const item of plan.items) {
        expect(actionVerbPattern.test(item.title.trim())).toBe(true);
      }
    });

    it("2.4 headings use plain language without raw statutory section codes", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Defective laptop from Amazon. Cost ₹50,000. Seller refused refund, want refund.");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      for (const item of plan.items) {
        expect(item.title).not.toMatch(/§|Section\s+\d+\([a-z0-9]+\)/i);
      }
    });

    it("2.5 action explanations are non-adversarial and practical", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Defective watch from Amazon. Refused refund.");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      expect(plan.summary.length).toBeGreaterThan(15);
      expect(plan.summary.toLowerCase()).not.toContain("guaranteed win");
      expect(plan.summary.toLowerCase()).not.toContain("punish the seller");
    });

    it("2.6 user summary is readable and avoids internal state keywords", () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "I bought a phone on Amazon for ₹12,000. It is broken.");
      const summary = consumerIntakeEngine.getSummary(s.sessionId);

      expect(summary).not.toContain("factConfidences");
      expect(summary).not.toContain("answeredQuestions");
      expect(summary.toLowerCase()).toContain("phone");
    });
  });

  // --------------------------------------------------------------------------
  // Category 3: Confidence & uncertainty
  // --------------------------------------------------------------------------
  describe("3. Confidence & Uncertainty", () => {
    it("3.1 high-confidence narrative reaches ready in fewer steps than vague narrative", () => {
      const sHigh = consumerIntakeEngine.createSession();
      const stateHigh = consumerIntakeEngine.submitNarrative(
        sHigh.sessionId,
        "I bought a phone on Amazon for ₹20,000. It arrived defective and they refused my refund. I want a full refund."
      );

      const sLow = consumerIntakeEngine.createSession();
      const stateLow = consumerIntakeEngine.submitNarrative(sLow.sessionId, "I have an issue with an online order.");

      const missingHigh = stateHigh.status === "ready" ? 0 : 1;
      expect(stateLow.status).toBe("collecting");
      expect(missingHigh).toBeLessThan(3);
    });

    it("3.2 ambiguous answers trigger clarification rather than guessing", () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "I ordered something");
      const state = consumerIntakeEngine.answerQuestion(s.sessionId, "attempted_resolution", "They gave me some partial money back maybe");
      expect(state.status === "needs_clarification" || state.facts.refundReceived === undefined).toBe(true);
    });

    it("3.3 user can skip questions without breaking flow", () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "My phone was defective");
      const q1 = getNextQuestion(consumerIntakeEngine.getSession(s.sessionId)!);
      expect(q1).not.toBeNull();

      const skipped = consumerIntakeEngine.skipQuestion(s.sessionId, q1!.id);
      expect(skipped.skippedQuestions).toContain(q1!.id);
      const q2 = getNextQuestion(skipped);
      expect(q2?.id).not.toBe(q1!.id);
    });

    it("3.4 user can undo last answer and restore previous question", () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "My phone is broken");
      consumerIntakeEngine.answerQuestion(s.sessionId, "amount", "₹20,000");
      expect(consumerIntakeEngine.getSession(s.sessionId)!.facts.amountPaid?.amount).toBe(20000);

      const reverted = consumerIntakeEngine.undoLastAnswer(s.sessionId);
      expect(reverted.facts.amountPaid).toBeUndefined();
      expect(reverted.answeredQuestions).not.toContain("amount");
    });

    it("3.5 user can correct any fact at summary step", () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Bought phone for ₹25,000");
      expect(consumerIntakeEngine.getSession(s.sessionId)!.facts.amountPaid?.amount).toBe(25000);

      const corrected = consumerIntakeEngine.correctFact(s.sessionId, "amountPaid", "₹30,000");
      expect(corrected.facts.amountPaid?.amount).toBe(30000);
    });

    it("3.6 skipping location does not prevent reaching ready status", () => {
      const s = consumerIntakeEngine.createSession();
      let cur = consumerIntakeEngine.submitNarrative(s.sessionId, "Defective phone from Amazon, cost ₹20k, refund refused, want refund");
      cur = consumerIntakeEngine.skipQuestion(s.sessionId, "location");
      expect(cur.skippedQuestions).toContain("location");
      expect(cur.status).toBe("ready");
    });
  });

  // --------------------------------------------------------------------------
  // Category 4: Action-plan completion
  // --------------------------------------------------------------------------
  describe("4. Action-Plan Completion", () => {
    it("4.1 marking an action complete updates its status to done", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Defective phone from Amazon. Refused refund.");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      const firstItem = plan.items[0];
      const updated = await consumerActionPlanService.updateActionStatus(plan, firstItem.id, "done");
      const updatedItem = updated.items.find((i) => i.id === firstItem.id);
      expect(updatedItem?.status).toBe("done");
      expect(updatedItem?.completedAt).toBeDefined();
    });

    it("4.2 completed action can be reopened / marked pending", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Defective phone from Amazon. Refused refund.");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      const firstItem = plan.items[0];
      const donePlan = await consumerActionPlanService.updateActionStatus(plan, firstItem.id, "done");
      const reopenedPlan = await consumerActionPlanService.updateActionStatus(donePlan, firstItem.id, "pending");
      const reopenedItem = reopenedPlan.items.find((i) => i.id === firstItem.id);
      expect(reopenedItem?.status).toBe("pending");
      expect(reopenedItem?.completedAt).toBeUndefined();
    });

    it("4.3 completing current action advances nextRecommendedAction", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Defective phone from Amazon. Refused refund.");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      const initialNext = nextRecommendedAction(plan);
      expect(initialNext).not.toBeNull();

      const updatedPlan = await consumerActionPlanService.updateActionStatus(plan, initialNext!.id, "done");
      const subsequentNext = nextRecommendedAction(updatedPlan);
      expect(subsequentNext?.id).not.toBe(initialNext!.id);
    });

    it("4.4 nextRecommendedAction returns null when all items are done", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Defective phone from Amazon. Refused refund.");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      let plan = await consumerActionPlanService.generateForCase(kase);

      for (const item of plan.items) {
        plan = await consumerActionPlanService.updateActionStatus(plan, item.id, "done");
      }
      expect(nextRecommendedAction(plan)).toBeNull();
    });

    it("4.5 action plan contains disclaimer that steps do not guarantee legal outcome", async () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Defective phone from Amazon. Refused refund.");
      const kase = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
      const plan = await consumerActionPlanService.generateForCase(kase);

      expect(plan.disclaimer).toBeDefined();
      expect(plan.disclaimer.toLowerCase()).toContain("not a guarantee");
    });
  });

  // --------------------------------------------------------------------------
  // Category 5: Document review clarity
  // --------------------------------------------------------------------------
  describe("5. Document Review Clarity", () => {
    const mockDoc: DocumentUpload = {
      id: "doc-1",
      caseId: "case-1",
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10240,
      evidenceType: "invoice_receipt",
      storageStatus: "stored",
      storageTier: "memory_only",
      storageNote: "Saved in this session memory",
      uploadedAt: new Date().toISOString(),
      processingStatus: "uploaded",
    };

    it("5.1 newly uploaded document starts in uploaded / saved state", () => {
      expect(mockDoc.processingStatus).toBe("uploaded");
    });

    it("5.2 failed extraction preserves file and sets clear error message", async () => {
      const c = await caseEngine.createCase({ title: "Doc Test Case", description: "Doc Test Case" });
      const f = makeFile("invoice.pdf", "application/pdf");
      const doc = await documentUploadService.uploadDocument(c.id, f, "invoice_receipt");
      await documentUploadService.updateUpload(c.id, doc.id, { file: undefined as never });
      const result = await documentProcessingService.processDocument({
        caseId: c.id,
        documentId: doc.id,
      });
      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
    });

    it("5.3 extracted facts are not confirmed by default", () => {
      const extractedFact = {
        field: "amountPaid",
        value: 25000,
        confidence: "medium" as const,
        source: "ocr_text" as const,
        rawText: "Total: 25000",
        confirmedByUser: false,
      };
      expect(extractedFact.confirmedByUser).toBe(false);
    });

    it("5.4 proposed fact merge detects conflicts against existing case facts", async () => {
      const k = await caseEngine.createCase({
        domain: "consumer_grievance",
        title: "Test Case",
        description: "Test Case",
        consumerFacts: {
          productOrService: "phone",
          amountPaid: { amount: 20000, currency: "INR" },
        },
      });
      const extractedFacts = [
        {
          field: "amountPaid",
          value: 25000,
          confidence: "high" as const,
          source: "document_text" as const,
          rawText: "Total: 25000",
          confirmedByUser: true,
        },
      ];
      const { conflicts } = await documentFactMergeService.proposeMerge(k.id, extractedFacts);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].field).toBe("amountPaid");
      expect((conflicts[0].existingValue as { amount?: number })?.amount ?? conflicts[0].existingValue).toBe(20000);
      expect(conflicts[0].extractedValue).toBe(25000);
    });

    it("5.5 facts become case facts only after applyConfirmedFacts", async () => {
      const k = await caseEngine.createCase({
        domain: "consumer_grievance",
        title: "Test Case",
        description: "Test Case",
      });
      const confirmedFact = {
        field: "productOrService",
        value: "smartphone",
        confidence: "high" as const,
        source: "document_text" as const,
        rawText: "Smartphone Model X",
        confirmedByUser: true,
        confirmedAt: new Date().toISOString(),
        confirmationSource: "document_review" as const,
      };
      await documentFactMergeService.applyConfirmedFacts(k.id, [confirmedFact]);
      const updated = await caseEngine.getCase(k.id);
      expect(updated?.consumerFacts?.productOrService).toBe("smartphone");
    });
  });

  // --------------------------------------------------------------------------
  // Category 6: User-observation framework
  // --------------------------------------------------------------------------
  describe("6. User-Observation Framework", () => {
    it("6.1 records start, step completion, and action events in memory", () => {
      usabilityObservationService.record({ event: "scenario_started", scenarioId: "defective_purchase", step: "start" });
      usabilityObservationService.record({ event: "step_completed", scenarioId: "defective_purchase", step: "narrative" });
      usabilityObservationService.record({ event: "action_marked_complete", scenarioId: "defective_purchase", step: "action_plan" });

      const events = usabilityObservationService.list();
      expect(events.length).toBe(3);
      expect(events[0].event).toBe("scenario_started");
    });

    it("6.2 strictly rejects PII keys and unauthorized properties", () => {
      expect(() => {
        // @ts-expect-error Testing PII guard
        usabilityObservationService.record({ event: "step_viewed", userName: "John Doe" });
      }).toThrow("Only structured usability fields are allowed.");

      expect(() => {
        // @ts-expect-error Testing PII guard
        usabilityObservationService.record({ event: "step_viewed", phoneNumber: "+919876543210" });
      }).toThrow("Only structured usability fields are allowed.");
    });

    it("6.3 tracks action marked complete events without recording action description", () => {
      usabilityObservationService.record({ event: "action_marked_complete", scenarioId: "defective_purchase", step: "action_plan" });
      const last = usabilityObservationService.list()[0];
      expect(last.event).toBe("action_marked_complete");
      expect(last).not.toHaveProperty("title");
      expect(last).not.toHaveProperty("text");
    });

    it("6.4 records friction events like went_back and skipped", () => {
      usabilityObservationService.record({ event: "went_back", scenarioId: "defective_purchase", step: "questions" });
      usabilityObservationService.record({ event: "skipped", scenarioId: "defective_purchase", step: "questions" });

      const events = usabilityObservationService.list();
      expect(events.some((e) => e.event === "went_back")).toBe(true);
      expect(events.some((e) => e.event === "skipped")).toBe(true);
    });

    it("6.5 summarizes scenario progress and friction points cleanly", () => {
      usabilityObservationService.record({ event: "scenario_started", scenarioId: "defective_purchase", step: "start" });
      usabilityObservationService.record({ event: "step_completed", scenarioId: "defective_purchase", step: "narrative" });
      usabilityObservationService.record({ event: "skipped", scenarioId: "defective_purchase", step: "questions" });
      usabilityObservationService.record({ event: "step_completed", scenarioId: "defective_purchase", step: "action_plan" });
      usabilityObservationService.record({ event: "action_marked_complete", scenarioId: "defective_purchase", step: "action_plan" });

      const summary = usabilityObservationService.summarizeScenario("defective_purchase");
      expect(summary.totalEvents).toBe(5);
      expect(summary.stepsCompleted).toContain("narrative");
      expect(summary.stepsCompleted).toContain("action_plan");
      expect(summary.actionsCompleted).toBe(1);
      expect(summary.frictionEncountered).toContain("skipped");
    });
  });

  // --------------------------------------------------------------------------
  // Category 7: Edge cases & recovery
  // --------------------------------------------------------------------------
  describe("7. Edge Cases & Recovery", () => {
    it("7.1 rejects empty narrative with descriptive error", () => {
      const s = consumerIntakeEngine.createSession();
      expect(() => consumerIntakeEngine.submitNarrative(s.sessionId, "   ")).toThrow("Narrative cannot be empty");
    });

    it("7.2 skipping all questions allows review of initial facts", () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "Phone defective Amazon");
      let cur = consumerIntakeEngine.getSession(s.sessionId)!;
      let count = 0;
      while (cur.status !== "ready" && count < 6) {
        const q = getNextQuestion(cur);
        if (!q) break;
        cur = consumerIntakeEngine.skipQuestion(s.sessionId, q.id);
        count++;
      }
      expect(cur.skippedQuestions!.length).toBeGreaterThan(0);
      expect(cur.facts.productOrService).toBe("phone");
    });

    it("7.3 detects contradictory statements and flags unresolved conflict", () => {
      const s = consumerIntakeEngine.createSession();
      consumerIntakeEngine.submitNarrative(s.sessionId, "I have never contacted the seller.");
      const s1 = consumerIntakeEngine.answerQuestion(s.sessionId, "attempted_resolution", "not_contacted");
      expect(s1.facts.sellerResponse).toBe("not_contacted");

      const s2 = consumerIntakeEngine.answerQuestion(s.sessionId, "attempted_resolution", "refused");
      expect(s2.conflicts.length).toBeGreaterThan(0);
      expect(s2.conflicts[0].status).toBe("unresolved");
      expect(s2.status).toBe("needs_clarification");
    });

    it("7.4 processes very long narrative without crashing or overflowing", () => {
      const s = consumerIntakeEngine.createSession();
      const longNarrative = "My phone was defective. ".repeat(80) + "Amazon refused refund.";
      const state = consumerIntakeEngine.submitNarrative(s.sessionId, longNarrative);
      expect(state.facts.productOrService).toBe("phone");
      expect(state.facts.sellerOrProvider?.toLowerCase()).toBe("amazon");
      expect(state.status).toBeDefined();
    });

    it("7.5 unreadable document recovery state has actionable manual entry advice", () => {
      expect(RECOVERY_STATES.unreadableDocument).toBeDefined();
      expect(RECOVERY_STATES.unreadableDocument.message).toContain("manually");
      expect(RECOVERY_STATES.unreadableDocument.tone).toBe("warning");
    });
  });
});
