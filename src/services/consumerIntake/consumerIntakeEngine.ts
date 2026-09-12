/**
 * Consumer Intake Engine — progressive, deterministic, conversational.
 * Turns “What happened?” into structured ConsumerCaseFacts.
 * No LLM. All extraction is rule-based and preserves raw text.
 */

import type {
  ConsumerIntakeState,
  ConsumerIntakeStep,
  ConsumerCaseFacts,
  LegalDomain,
  FactConfidence,
  IntakeConflict,
  ConsumerAnsweredQuestion,
  MoneyAmount,
} from "@/types/domain";
import { classifyConsumerIssue } from "@/services/legal/consumer/consumerIssueClassifier.service";
import { detectDomain } from "@/services/consumerIntake/extraction";
import * as EX from "@/services/consumerIntake/extraction";
import * as NORM from "@/services/consumerIntake/normalization";
import { timelineService } from "@/services/timeline.service";
import { getNextQuestion, computeMissingFacts, shouldBeReady } from "@/services/consumerIntake/questionPlanner";
import { caseEngine } from "@/services/caseEngine.service";

function genId(): string {
  return `intake_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class ConsumerIntakeEngine {
  private sessions = new Map<string, ConsumerIntakeState>();

  createSession(): ConsumerIntakeState {
    const id = genId();
    const state: ConsumerIntakeState = {
      sessionId: id,
      status: "collecting",
      facts: {},
      factConfidences: {},
      factRawTexts: {},
      issueTypes: [],
      domain: "general",
      consumerFlowApplicable: true,
      missingFacts: [],
      answeredQuestions: [],
      skippedQuestions: [],
      conflicts: [],
      evidenceTypes: [],
      desiredOutcomes: [],
      confidence: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.sessions.set(id, state);
    return state;
  }

  getSession(id: string): ConsumerIntakeState | null {
    return this.sessions.get(id) ?? null;
  }

  /** Narrative first — preserve raw, extract facts deterministically */
  submitNarrative(sessionId: string, narrative: string): ConsumerIntakeState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Session not found: ${sessionId}`);
    const raw = narrative.trim();
    if (!raw) throw new Error("Narrative cannot be empty");

    state.userNarrative = raw;
    state.userNarrativeRaw = raw;
    state.facts.problemDescription = raw;
    state.factConfidences.problemDescription = "explicit";
    state.factRawTexts.problemDescription = raw;

    // Deterministic extraction
    this.extractFromText(state, raw);

    // Domain boundary
    const domainRes = detectDomain(raw);
    state.domain = domainRes.domain;
    if (domainRes.domain !== "consumer_grievance" && domainRes.domain !== "general") {
      state.consumerFlowApplicable = false;
      state.domainReason = domainRes.reason;
      state.status = "needs_clarification";
    } else {
      // Classify consumer issue
      const classification = classifyConsumerIssue(raw);
      state.issueTypes = classification.issueTypes;
      state.consumerFlowApplicable = classification.domain === "consumer_grievance" || domainRes.domain === "consumer_grievance" || raw.toLowerCase().includes("refund") || raw.toLowerCase().includes("product") || raw.toLowerCase().includes("seller");
      // If classifier says general and no consumer keywords, treat as not consumer
      if (classification.domain === "general" && domainRes.domain === "general" && !raw.toLowerCase().includes("consumer")) {
        // Check for rental/employment etc already handled above; if still general, keep collecting but mark vague
        if (classification.isVague) {
          state.consumerFlowApplicable = true; // still allow consumer flow to ask more
        }
      }
      // Update domain if classifier found consumer
      if (classification.issueTypes.length > 0) {
        state.domain = "consumer_grievance";
        state.consumerFlowApplicable = true;
      }
    }

    this.recompute(state);
    this.sessions.set(sessionId, state);
    return { ...state };
  }

  private extractFromText(state: ConsumerIntakeState, text: string): void {
    // Money
    const money = EX.extractMoney(text);
    if (money && !state.facts.amountPaid) {
      state.facts.amountPaid = money.value;
      state.factConfidences.amountPaid = money.confidence;
      state.factRawTexts.amountPaid = money.raw;
    }

    // Product/service
    const prod = EX.extractProductOrService(text);
    if (prod && !state.facts.productOrService) {
      state.facts.productOrService = prod.value;
      state.factConfidences.productOrService = prod.confidence;
      state.factRawTexts.productOrService = prod.raw;
    }

    // Seller
    const seller = EX.extractSeller(text);
    if (seller && !state.facts.sellerOrProvider) {
      state.facts.sellerOrProvider = seller.value;
      state.factConfidences.sellerOrProvider = seller.confidence;
      state.factRawTexts.sellerOrProvider = seller.raw;
    }

    // Purchase channel
    const channel = EX.extractPurchaseChannel(text);
    if (channel && !state.facts.purchaseChannel) {
      state.facts.purchaseChannel = channel.value as ConsumerCaseFacts["purchaseChannel"];
      state.factConfidences.purchaseChannel = channel.confidence;
      state.factRawTexts.purchaseChannel = channel.raw;
    }

    // Delivery status
    const delivery = EX.extractDeliveryStatus(text);
    if (delivery && !state.facts.deliveryStatus) {
      state.facts.deliveryStatus = delivery.value as ConsumerCaseFacts["deliveryStatus"];
      state.factConfidences.deliveryStatus = delivery.confidence;
      state.factRawTexts.deliveryStatus = delivery.raw;
    }

    // Payment method
    const pm = EX.extractPaymentMethod(text);
    if (pm && !state.facts.paymentMethod) {
      state.facts.paymentMethod = pm.value;
      state.factConfidences.paymentMethod = pm.confidence;
      state.factRawTexts.paymentMethod = pm.raw;
    }

    // Refund status
    const refund = EX.extractRefundStatus(text);
    if (refund.refundRequested && state.facts.refundRequested === undefined) {
      state.facts.refundRequested = refund.refundRequested.value;
      state.factConfidences.refundRequested = refund.refundRequested.confidence;
      state.factRawTexts.refundRequested = refund.refundRequested.raw;
    }
    if (refund.refundReceived && state.facts.refundReceived === undefined) {
      // Ambiguous: if "some refund" or partial, mark ambiguous and require clarification
      if (refund.refundReceived.confidence === "ambiguous") {
        state.facts.refundReceived = undefined; // don't set, need clarification
      } else {
        state.facts.refundReceived = refund.refundReceived.value;
        state.factConfidences.refundReceived = refund.refundReceived.confidence;
        state.factRawTexts.refundReceived = refund.refundReceived.raw;
      }
    }

    // Seller response
    const resp = EX.extractSellerResponse(text);
    if (resp && !state.facts.sellerResponse) {
      state.facts.sellerResponse = resp.value;
      state.factConfidences.sellerResponse = resp.confidence;
      state.factRawTexts.sellerResponse = resp.raw;
    }

    // Written complaint
    const written = EX.extractWrittenComplaint(text);
    if (written && state.facts.writtenComplaintMade === undefined) {
      state.facts.writtenComplaintMade = written.value;
      state.factConfidences.writtenComplaintMade = written.confidence;
      state.factRawTexts.writtenComplaintMade = written.raw;
    }

    // Date
    const dateRes = EX.extractPurchaseDate(text);
    if (dateRes.date && !state.facts.purchaseDate) {
      state.facts.purchaseDate = dateRes.date.value;
      state.factConfidences.purchaseDate = dateRes.date.confidence;
      state.factRawTexts.purchaseDate = dateRes.date.raw;
    } else if (dateRes.relative && !state.facts.relativeDateMention) {
      state.facts.relativeDateMention = dateRes.relative.value;
      state.factConfidences.relativeDateMention = dateRes.relative.confidence;
      state.factRawTexts.relativeDateMention = dateRes.relative.raw;
    }

    // Desired outcome
    const desired = EX.extractDesiredOutcome(text);
    if (desired && state.desiredOutcomes.length === 0) {
      const norm = NORM.normalizeDesiredOutcome(desired.raw);
      const outcome = (norm?.normalized as ConsumerCaseFacts["desiredOutcome"]) || (desired.value as ConsumerCaseFacts["desiredOutcome"]);
      if (outcome) {
        state.desiredOutcomes = [outcome as never];
        state.facts.desiredOutcome = outcome as never;
        state.factConfidences.desiredOutcome = desired.confidence;
        state.factRawTexts.desiredOutcome = desired.raw;
      }
    }

    // Evidence
    const ev = EX.extractEvidenceTypes(text);
    if (ev && state.evidenceTypes.length === 0) {
      state.evidenceTypes = ev.value as ConsumerIntakeState["evidenceTypes"];
      state.facts.evidenceTypes = ev.value as ConsumerCaseFacts["evidenceTypes"];
      state.factConfidences.evidenceTypes = ev.confidence;
      state.factRawTexts.evidenceTypes = ev.raw;
    }

    // Location
    const loc = EX.extractLocation(text);
    if (loc && !state.facts.location) {
      state.facts.location = loc.value;
      state.facts.stateOrUT = loc.value;
      state.factConfidences.location = loc.confidence;
      state.factRawTexts.location = loc.raw;
    }
  }

  /** Answer a specific step question — handles normalization, contradiction, ambiguity */
  answerQuestion(sessionId: string, step: ConsumerIntakeStep, rawAnswer: string): ConsumerIntakeState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Session not found`);

    const trimmed = rawAnswer.trim();
    if (!trimmed) throw new Error("Answer cannot be empty");

    // Check for injection — treat as DATA, not instruction (logged via analytics, not executed)
    const lower = trimmed.toLowerCase();
    void lower.includes("ignore previous instructions");

    // Resolve which fact field this step maps to
    const questionDef = this.getQuestionDef(step);
    const field = questionDef?.key ?? step;

    // Contradiction detection
    const existingRaw = state.factRawTexts[field as keyof ConsumerCaseFacts];
    const existingVal = (state.facts as Record<string, unknown>)[field];

    // Normalize based on step
    let normalized: unknown = trimmed;
    let confidence: FactConfidence = "explicit";
    let shouldSetFact = true;

    if (step === "amount") {
      const norm = NORM.normalizeMoneyAnswer(trimmed);
      if (norm) {
        normalized = { amount: norm.normalized, currency: "INR" as const };
        confidence = norm.confidence;
      } else {
        // Try extraction as fallback
        const ex = EX.extractMoney(trimmed);
        if (ex) {
          normalized = ex.value;
          confidence = ex.confidence;
        } else {
          // Could not parse — mark ambiguous, ask clarification later
          confidence = "ambiguous";
          shouldSetFact = false;
        }
      }
    } else if (step === "attempted_resolution") {
      // Normalize yes/no for seller response
      const norm = NORM.normalizeYesNo(trimmed);
      if (norm && trimmed.toLowerCase().includes("contact")) {
        // Generic yes/no for contacted
        // We'll map to sellerResponse
        if (norm.normalized === false && lower.includes("haven't") || lower.includes("not contact")) {
          normalized = "not_contacted";
        }
      }
      // Also check for specific responses
      const resp = EX.extractSellerResponse(trimmed);
      if (resp) {
        normalized = resp.value;
        confidence = resp.confidence;
      } else if (norm) {
        // If yes/no without detail, ask follow-up
        confidence = "ambiguous";
      }
    } else if (step === "evidence") {
      const norm = NORM.normalizeEvidence(trimmed);
      if (norm) {
        normalized = norm.normalized;
        confidence = norm.confidence as FactConfidence;
        // This maps to evidenceTypes, not a single fact
      }
    } else if (step === "desired_outcome") {
      const norm = NORM.normalizeDesiredOutcome(trimmed);
      if (norm) {
        normalized = norm.normalized;
        confidence = norm.confidence as FactConfidence;
      }
    } else if (step === "purchase_date") {
      const dateRes = EX.extractPurchaseDate(trimmed);
      if (dateRes.date) {
        normalized = dateRes.date.value;
        confidence = dateRes.date.confidence;
      } else if (dateRes.relative) {
        normalized = dateRes.relative.value;
        confidence = "ambiguous";
        // Store as relative
      }
    }

    // Ambiguity: "They gave me some money back" for refund
    if (step === "attempted_resolution" && lower.includes("some") && (lower.includes("refund") || lower.includes("money back"))) {
      confidence = "ambiguous";
      shouldSetFact = false;
      // Will trigger clarification question
      state.status = "needs_clarification";
    }

    // Contradiction: if earlier value exists and new normalized differs significantly
    if (existingRaw && shouldSetFact) {
      const newValStr = JSON.stringify(normalized);
      const oldValStr = JSON.stringify(existingVal);
      if (newValStr !== oldValStr) {
        const conflict: IntakeConflict = {
          field,
          earlierValue: existingVal,
          laterValue: normalized,
          earlierRaw: String(existingRaw),
          laterRaw: trimmed,
          status: "unresolved",
          message: `Earlier you said "${existingRaw}" but now said "${trimmed}" — which is correct?`,
          timestamp: nowIso(),
        };
        state.conflicts.push(conflict);
        // Mark answer with contradiction
        const answered: ConsumerAnsweredQuestion = {
          step,
          questionId: step,
          questionText: questionDef?.question ?? step,
          rawAnswer: trimmed,
          normalizedValue: normalized,
          confidence: "ambiguous",
          timestamp: nowIso(),
          wasContradiction: true,
        };
        state.answeredQuestions.push(answered);
        state.status = "needs_clarification";
        state.updatedAt = nowIso();
        this.sessions.set(sessionId, state);
        return { ...state };
      }
    }

    // Record answer
    const answered: ConsumerAnsweredQuestion = {
      step,
      questionId: step,
      questionText: questionDef?.question ?? step,
      rawAnswer: trimmed,
      normalizedValue: normalized,
      confidence,
      timestamp: nowIso(),
    };
    state.answeredQuestions.push(answered);

    if (shouldSetFact) {
      // Map step to fact
      this.setFactFromAnswer(state, step, normalized, trimmed, confidence);
    } else {
      // Ambiguous — keep missing and mark needs clarification
      state.status = "needs_clarification";
    }

    // Re-run extraction on raw answer to catch additional facts
    this.extractFromText(state, trimmed);

    this.recompute(state);
    this.sessions.set(sessionId, state);
    return { ...state };
  }

  private setFactFromAnswer(state: ConsumerIntakeState, step: ConsumerIntakeStep, normalized: unknown, raw: string, confidence: FactConfidence): void {
    switch (step) {
      case "product_or_service":
        state.facts.productOrService = String(normalized);
        state.factConfidences.productOrService = confidence;
        state.factRawTexts.productOrService = raw;
        break;
      case "seller_or_provider":
        state.facts.sellerOrProvider = String(normalized);
        state.factConfidences.sellerOrProvider = confidence;
        state.factRawTexts.sellerOrProvider = raw;
        break;
      case "purchase_date":
        if (typeof normalized === "string" && /^\d{4}-\d{2}-\d{2}/.test(normalized)) {
          state.facts.purchaseDate = normalized;
          state.factConfidences.purchaseDate = confidence;
          state.factRawTexts.purchaseDate = raw;
        } else if (typeof normalized === "string") {
          state.facts.relativeDateMention = normalized;
          state.factConfidences.relativeDateMention = "ambiguous";
          state.factRawTexts.relativeDateMention = raw;
        }
        break;
      case "amount":
        if (normalized && typeof normalized === "object" && "amount" in (normalized as Record<string, unknown>)) {
          state.facts.amountPaid = normalized as MoneyAmount;
          state.factConfidences.amountPaid = confidence;
          state.factRawTexts.amountPaid = raw;
        }
        break;
      case "what_went_wrong": {
        const val = String(normalized);
        // Map choice values to deliveryStatus
        if (["defective", "not_delivered", "poor_service", "misleading", "other"].includes(val)) {
          if (val === "defective") state.facts.deliveryStatus = "defective";
          else if (val === "not_delivered") state.facts.deliveryStatus = "not_delivered";
          else state.facts.problemDescription = (state.facts.problemDescription || "") + ` ${val}`;
          state.factConfidences.deliveryStatus = confidence;
          state.factRawTexts.deliveryStatus = raw;
        } else {
          state.facts.problemDescription = raw;
          state.factConfidences.problemDescription = confidence;
          state.factRawTexts.problemDescription = raw;
        }
        break;
      }
      case "attempted_resolution": {
        const val = String(normalized);
        if (["refused", "no response", "acknowledged", "not_contacted"].includes(val)) {
          state.facts.sellerResponse = val;
          state.factConfidences.sellerResponse = confidence;
          state.factRawTexts.sellerResponse = raw;
          state.facts.writtenComplaintMade = val !== "not_contacted";
        } else {
          state.facts.sellerResponse = val;
          state.factConfidences.sellerResponse = confidence;
          state.factRawTexts.sellerResponse = raw;
        }
        break;
      }
      case "desired_outcome":
        state.desiredOutcomes = [String(normalized) as ConsumerIntakeState["desiredOutcomes"][number]];
        state.facts.desiredOutcome = String(normalized) as ConsumerCaseFacts["desiredOutcome"];
        state.factConfidences.desiredOutcome = confidence;
        state.factRawTexts.desiredOutcome = raw;
        break;
      case "evidence": {
        const arr = Array.isArray(normalized) ? (normalized as string[]) : [String(normalized)];
        state.evidenceTypes = arr as ConsumerIntakeState["evidenceTypes"];
        state.facts.evidenceTypes = arr as ConsumerCaseFacts["evidenceTypes"];
        state.factConfidences.evidenceTypes = confidence;
        state.factRawTexts.evidenceTypes = raw;
        break;
      }
      case "location":
        state.facts.location = String(normalized);
        state.facts.stateOrUT = String(normalized);
        state.factConfidences.location = confidence;
        state.factRawTexts.location = raw;
        break;
      case "problem":
        state.facts.problemDescription = String(normalized);
        state.factConfidences.problemDescription = confidence;
        state.factRawTexts.problemDescription = raw;
        break;
    }
  }

  private getQuestionDef(step: ConsumerIntakeStep): { question: string; key: string } | null {
    // Minimal mapping for contradiction handling
    const map: Record<string, { question: string; key: string }> = {
      problem: { question: "Tell us what happened", key: "problemDescription" },
      product_or_service: { question: "What did you buy?", key: "productOrService" },
      seller_or_provider: { question: "Who did you buy it from?", key: "sellerOrProvider" },
      purchase_date: { question: "When did you buy it?", key: "purchaseDate" },
      amount: { question: "How much did you pay?", key: "amountPaid" },
      what_went_wrong: { question: "What went wrong?", key: "deliveryStatus" },
      attempted_resolution: { question: "Have you contacted the seller?", key: "sellerResponse" },
      desired_outcome: { question: "What would you like to happen?", key: "desiredOutcome" },
      evidence: { question: "Do you have proof?", key: "evidenceTypes" },
      location: { question: "Which state are you in?", key: "location" },
    };
    return map[step] ?? null;
  }

  private recompute(state: ConsumerIntakeState): void {
    // Re-classify as facts evolve
    const narrative = state.userNarrative || state.facts.problemDescription || "";
    if (narrative) {
      const classification = classifyConsumerIssue(narrative + " " + (state.facts.productOrService || "") + " " + (state.facts.sellerOrProvider || ""));
      if (classification.issueTypes.length > 0) {
        state.issueTypes = Array.from(new Set([...state.issueTypes, ...classification.issueTypes]));
      }
    }

    // Check domain again with updated facts
    const domainCheck = detectDomain(narrative + " " + (state.facts.problemDescription || ""));
    if (domainCheck.domain !== "general" && domainCheck.domain !== state.domain) {
      // If new domain is non-consumer and we previously had consumer, keep consumer but note
      if (["employment", "rental", "cyber_fraud"].includes(domainCheck.domain)) {
        // Don't overwrite if we already have strong consumer signals, but mark mismatch
        if (state.issueTypes.length === 0) {
          state.domain = domainCheck.domain as LegalDomain;
          state.consumerFlowApplicable = false;
          state.domainReason = domainCheck.reason;
        }
      }
    }

    // Missing facts
    state.missingFacts = computeMissingFacts(state as unknown as import("@/types/domain").ConsumerIntakeState);

    // Overall confidence
    const confidences = Object.values(state.factConfidences);
    const explicitCount = confidences.filter((c) => c === "explicit").length;
    const total = confidences.length || 1;
    state.confidence = explicitCount / total;

    // Next question
    const next = getNextQuestion(state as unknown as import("@/types/domain").ConsumerIntakeState);
    state.currentStep = next?.id as ConsumerIntakeStep | undefined;
    state.nextQuestionId = next?.id;

    // Status
    const hasUnresolvedConflict = state.conflicts.some((c) => c.status === "unresolved");
    if (hasUnresolvedConflict) {
      state.status = "needs_clarification";
    } else if (shouldBeReady(state as unknown as import("@/types/domain").ConsumerIntakeState)) {
      state.status = "ready";
    } else if (state.missingFacts.length === 0 && state.answeredQuestions.length >= 3) {
      state.status = "ready";
    } else {
      // If we have enough to show summary but still missing low-priority, mark ready
      const coreMissing = state.missingFacts.filter((m) => m.priority <= 3);
      if (coreMissing.length === 0 && state.answeredQuestions.length >= 2) {
        state.status = "ready";
      } else {
        state.status = "collecting";
      }
    }

    // Handle vague with no facts — stay collecting and ensure next question is product
    if (state.issueTypes.length === 0 && !state.facts.productOrService && state.userNarrative && state.userNarrative.length < 30) {
      state.status = "collecting";
      state.currentStep = "product_or_service";
    }

    state.updatedAt = nowIso();
  }

  /** User confirms summary is correct */
  confirm(sessionId: string): ConsumerIntakeState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error("Session not found");
    state.status = "complete";
    state.updatedAt = nowIso();
    this.sessions.set(sessionId, state);
    return { ...state };
  }

  /** Correct a fact — retains audit trail via answeredQuestions and clears conflict */
  correctFact(sessionId: string, field: keyof ConsumerCaseFacts, newRaw: string): ConsumerIntakeState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error("Session not found");

    // Mark conflicts for this field as resolved
    state.conflicts.forEach((c) => {
      if (c.field === field) c.status = "resolved";
    });

    // Update via answerQuestion logic for that field's step
    // Map field to step
    const fieldToStep: Record<string, ConsumerIntakeStep> = {
      productOrService: "product_or_service",
      sellerOrProvider: "seller_or_provider",
      purchaseDate: "purchase_date",
      amountPaid: "amount",
      deliveryStatus: "what_went_wrong",
      sellerResponse: "attempted_resolution",
      desiredOutcome: "desired_outcome",
      evidenceTypes: "evidence",
      location: "location",
      stateOrUT: "location",
    };
    const step = fieldToStep[field] ?? "problem";
    // Clear old fact
    delete (state.facts as Record<string, unknown>)[field];
    delete state.factConfidences[field];
    delete state.factRawTexts[field];
    // Re-answer
    return this.answerQuestion(sessionId, step, newRaw);
  }

  /** Resolve contradiction by choosing which value is correct */
  resolveConflict(sessionId: string, field: string, choose: "earlier" | "later" | string): ConsumerIntakeState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error("Session not found");
    const conflict = state.conflicts.find((c) => c.field === field && c.status === "unresolved");
    if (!conflict) throw new Error("No unresolved conflict for field " + field);
    let chosenRaw: string;
    let chosenVal: unknown;
    if (choose === "earlier") {
      chosenRaw = conflict.earlierRaw;
      chosenVal = conflict.earlierValue;
    } else if (choose === "later") {
      chosenRaw = conflict.laterRaw;
      chosenVal = conflict.laterValue;
    } else {
      chosenRaw = choose;
      chosenVal = choose;
    }
    (state.facts as Record<string, unknown>)[field] = chosenVal;
    state.factRawTexts[field as keyof ConsumerCaseFacts] = chosenRaw;
    state.factConfidences[field as keyof ConsumerCaseFacts] = "explicit";
    conflict.status = "resolved";
    this.recompute(state);
    this.sessions.set(sessionId, state);
    return { ...state };
  }

  /** Skip an intake question without forcing unknown facts */
  skipQuestion(sessionId: string, step: ConsumerIntakeStep): ConsumerIntakeState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error("Session not found");
    state.skippedQuestions = state.skippedQuestions ?? [];
    if (!state.skippedQuestions.includes(step)) {
      state.skippedQuestions.push(step);
    }
    const questionDef = this.getQuestionDef(step);
    state.answeredQuestions.push({
      step,
      questionId: step,
      questionText: questionDef?.question ?? step,
      rawAnswer: "[skipped]",
      normalizedValue: null,
      confidence: "unknown",
      timestamp: nowIso(),
    });
    this.recompute(state);
    this.sessions.set(sessionId, state);
    return { ...state };
  }

  /** Undo the most recent question answered to allow non-destructive user correction */
  undoLastAnswer(sessionId: string): ConsumerIntakeState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error("Session not found");
    if (state.answeredQuestions.length === 0) return { ...state };
    const popped = state.answeredQuestions.pop();
    if (popped) {
      if (popped.rawAnswer === "[skipped]" && state.skippedQuestions) {
        state.skippedQuestions = state.skippedQuestions.filter((s) => s !== popped.step);
      }
      const qDef = this.getQuestionDef(popped.step);
      const field = (qDef?.key ?? popped.step) as keyof ConsumerCaseFacts;
      delete (state.facts as Record<string, unknown>)[field];
      delete state.factConfidences[field];
      delete state.factRawTexts[field];
      if (field === "desiredOutcome") state.desiredOutcomes = [];
      if (field === "evidenceTypes") state.evidenceTypes = [];

      // Re-extract from initial user narrative if present
      if (state.userNarrative) {
        this.extractFromText(state, state.userNarrative);
      }
      // Replay remaining answers
      for (const a of state.answeredQuestions) {
        if (a.rawAnswer !== "[skipped]" && a.normalizedValue !== null && a.normalizedValue !== undefined) {
          const aDef = this.getQuestionDef(a.step);
          const f = (aDef?.key ?? a.step) as keyof ConsumerCaseFacts;
          if (f === "desiredOutcome") {
            state.desiredOutcomes = [a.normalizedValue as never];
            state.facts.desiredOutcome = a.normalizedValue as never;
          } else if (f === "evidenceTypes") {
            const arr = Array.isArray(a.normalizedValue) ? (a.normalizedValue as string[]) : [String(a.normalizedValue)];
            state.evidenceTypes = arr as never;
            state.facts.evidenceTypes = arr as never;
          } else {
            (state.facts as Record<string, unknown>)[f] = a.normalizedValue;
          }
          state.factConfidences[f] = a.confidence;
          state.factRawTexts[f] = a.rawAnswer;
        }
      }
    }
    this.recompute(state);
    this.sessions.set(sessionId, state);
    return { ...state };
  }

  /** Generate user-readable summary */
  getSummary(sessionId: string): string {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error("Session not found");
    const parts: string[] = [];
    if (state.facts.productOrService) {
      const amt = state.facts.amountPaid ? ` for ${formatMoney(state.facts.amountPaid)}` : "";
      parts.push(`You bought ${state.facts.productOrService}${amt}${state.facts.sellerOrProvider ? ` from ${state.facts.sellerOrProvider}` : ""}.`);
    } else if (state.facts.problemDescription) {
      parts.push(state.facts.problemDescription);
    }
    if (state.facts.deliveryStatus === "defective") {
      parts.push("It arrived defective/damaged.");
    } else if (state.facts.deliveryStatus === "not_delivered") {
      parts.push("It was not delivered.");
    }
    if (state.facts.sellerResponse) {
      if (state.facts.sellerResponse === "refused") parts.push("You contacted the seller, but they refused a refund/replacement.");
      else if (state.facts.sellerResponse === "no response") parts.push("You contacted the seller, but there has been no response.");
      else if (state.facts.sellerResponse === "not_contacted") parts.push("You have not contacted the seller yet.");
      else parts.push(`Seller response: ${state.facts.sellerResponse}.`);
    }
    if (state.evidenceTypes.length > 0 && !state.evidenceTypes.includes("nothing_yet")) {
      parts.push(`You have ${state.evidenceTypes.join(", ").replace(/_/g, " ")}.`);
    }
    if (state.desiredOutcomes.length > 0) {
      const desire = state.desiredOutcomes[0];
      if (desire === "refund") parts.push("You want a refund.");
      else if (desire === "replacement") parts.push("You want a replacement.");
      else if (desire === "understand_options") parts.push("You want to understand your options.");
      else parts.push(`Desired outcome: ${desire}.`);
    }
    return parts.join(" ") || state.userNarrative || "No summary yet.";
  }

  /** Create a Case from ready intake */
  async createCaseFromIntake(sessionId: string, _userId = "local_user"): Promise<import("@/types/domain").Case> {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error("Session not found");
    if (state.status !== "ready" && state.status !== "complete") {
      throw new Error(`Intake not ready: ${state.status}`);
    }
    const title = state.facts.productOrService ? `${state.facts.productOrService} — ${state.issueTypes[0] ?? "consumer issue"}` : state.userNarrative?.slice(0, 60) ?? "Consumer case";
    const description = this.getSummary(sessionId);
    const c = await caseEngine.createCase({
      title,
      description,
      domain: "consumer_grievance",
      consumerFacts: { ...state.facts, desiredOutcomes: state.desiredOutcomes, evidenceTypes: state.evidenceTypes } as ConsumerCaseFacts,
      consumerIssueTypes: state.issueTypes,
      problemCategory: "consumer_complaint",
      // Store intake state id for traceability
    });
    // Add domain and facts to case
    await caseEngine.updateCase(c.id, {
      domain: "consumer_grievance",
      consumerFacts: state.facts,
      consumerIssueTypes: state.issueTypes,
    });
    // Timeline: case_created + intake_completed
    try {
      await timelineService.addEvent({
        caseId: c.id,
        type: "case_created",
        title: "Case created",
        description: `Case for ${state.facts.productOrService ?? "consumer issue"} created`,
        source: "system",
      });
      await timelineService.addEvent({
        caseId: c.id,
        type: "intake_completed",
        title: "Problem understood",
        description: this.getSummary(sessionId),
        source: "system",
        metadata: { issueTypes: state.issueTypes, domain: state.domain },
      });
    } catch {
      // non-fatal
    }
    return (await caseEngine.getCase(c.id))!;
  }

  // For testing: clear
  __clear() {
    this.sessions.clear();
  }
}

function formatMoney(m: MoneyAmount | undefined): string {
  if (!m) return "";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(m.amount);
}

export const consumerIntakeEngine = new ConsumerIntakeEngine();
