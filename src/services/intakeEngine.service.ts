/**
 * IntakeEngine — one-at-a-time, plain language, relevant questions only.
 * Flow: User explains → identify category → ask only relevant questions → summarize → confirm → analysis
 */

import type { IntakeQuestion, IntakeState, ProblemCategory, ID } from "@/types/domain";
import { questionsForCategory } from "@/data/intakeQuestions";

export interface IIntakeEngine {
  start(caseId: ID, category?: ProblemCategory | null): IntakeState;
  nextQuestion(state: IntakeState): IntakeQuestion | null;
  answer(state: IntakeState, key: string, value: unknown): IntakeState;
  skip(state: IntakeState, key: string): IntakeState;
  canComplete(state: IntakeState): boolean;
  summarize(state: IntakeState): string;
  inferCategory(freeText: string): { category: ProblemCategory | null; confidence: number };
}

/**
 * Sentinel recorded when the user skips a question. Skips are ANSWERS for
 * state-machine purposes (the flow must always terminate) but must NEVER be
 * persisted as case facts or shown as user-provided content.
 */
export const INTAKE_SKIPPED = "__skipped__";

export function isSkippedValue(value: unknown): boolean {
  return value === INTAKE_SKIPPED;
}

class IntakeEngine implements IIntakeEngine {
  start(caseId: ID, category: ProblemCategory | null = null): IntakeState {
    const questions = questionsForCategory(category);
    return {
      caseId,
      currentStep: 0,
      totalSteps: questions.length,
      questions,
      answers: category ? { problem_category: category } : {},
      completed: false,
    };
  }

  nextQuestion(state: IntakeState): IntakeQuestion | null {
    // find first unanswered required question
    for (const q of state.questions) {
      if (state.answers[q.key] === undefined && state.answers[q.key] !== false) {
        // Check if already answered (including falsy but defined)
        if (!(q.key in state.answers)) return q;
      }
    }
    // fallback: sequential
    if (state.currentStep < state.questions.length) {
      const q = state.questions[state.currentStep];
      if (q && !(q.key in state.answers)) return q;
      // find next unanswered
      for (let i = state.currentStep; i < state.questions.length; i++) {
        if (!(state.questions[i].key in state.answers)) return state.questions[i];
      }
    }
    return null;
  }

  answer(state: IntakeState, key: string, value: unknown): IntakeState {
    if (isSkippedValue(value)) {
      throw new Error("Skipped answers must go through skip(), never answer().");
    }
    const nextAnswers = { ...state.answers, [key]: value };
    // if category answered, refilter questions
    let nextQuestions = state.questions;
    if (key === "problem_category" && typeof value === "string") {
      nextQuestions = questionsForCategory(value as ProblemCategory);
    }
    // auto-advance currentStep to next unanswered index
    const answeredCount = Object.keys(nextAnswers).length;
    const completed = this.canComplete({ ...state, answers: nextAnswers, questions: nextQuestions });
    return {
      ...state,
      questions: nextQuestions,
      answers: nextAnswers,
      currentStep: Math.min(answeredCount, nextQuestions.length),
      totalSteps: nextQuestions.length,
      completed,
    };
  }

  /**
   * Record a skip for the given question key. The sentinel counts as
   * "answered" so the flow always terminates; progress stays clamped to
   * [0, totalSteps] and can never exceed the true question count.
   */
  skip(state: IntakeState, key: string): IntakeState {
    if (key in state.answers) return state;
    return this.recordSkipped({ ...state }, key);
  }

  private recordSkipped(state: IntakeState, key: string): IntakeState {
    const nextAnswers = { ...state.answers, [key]: INTAKE_SKIPPED };
    const answeredCount = Object.keys(nextAnswers).length;
    const completed = this.canComplete({ ...state, answers: nextAnswers });
    return {
      ...state,
      answers: nextAnswers,
      currentStep: Math.min(answeredCount, state.questions.length),
      completed,
    };
  }

  canComplete(state: IntakeState): boolean {
    const required = state.questions.filter((q) => q.required);
    return required.every((q) => q.key in state.answers && state.answers[q.key] !== "" && state.answers[q.key] !== undefined);
  }

  summarize(state: IntakeState): string {
    const parts: string[] = [];
    const said = (key: string): string | null => {
      const v = state.answers[key];
      if (v === undefined || v === null || v === "" || isSkippedValue(v)) return null;
      return String(v);
    };
    const what = said("what_happened");
    if (what) parts.push(what);
    if (state.answers["amount_involved"] !== undefined && !isSkippedValue(state.answers["amount_involved"])) parts.push(`Amount involved: ₹${state.answers["amount_involved"]}`);
    const when = said("incident_date");
    if (when) parts.push(`Date: ${when}`);
    const who = said("opposing_party");
    if (who) parts.push(`Other party: ${who}`);
    return parts.join(" • ") || "No details yet — tell us what happened in your own words.";
  }

  inferCategory(freeText: string): { category: ProblemCategory | null; confidence: number } {
    const t = freeText.toLowerCase();
    if (t.includes("deposit") || t.includes("security") || t.includes("advance")) return { category: "security_deposit", confidence: 0.6 };
    if (t.includes("cheque") || t.includes("check bounce") || t.includes("138")) return { category: "cheque_bounce", confidence: 0.65 };
    if (t.includes("salary") || t.includes("wage") || t.includes("settlement") || t.includes("pf")) return { category: "salary_delay", confidence: 0.6 };
    if (t.includes("consumer") || t.includes("product") || t.includes("defect") || t.includes("refund")) return { category: "consumer_complaint", confidence: 0.55 };
    if (t.includes("notice") || t.includes("summons") || t.includes("court")) return { category: "legal_notice", confidence: 0.6 };
    if (t.includes("rent") || t.includes("landlord")) return { category: "rent_dispute", confidence: 0.55 };
    return { category: null, confidence: 0 };
  }
}

export const intakeEngine: IIntakeEngine = new IntakeEngine();
