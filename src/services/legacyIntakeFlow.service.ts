/**
 * Legacy intake flow — the SINGLE canonical owner of the complaint text from
 * landing-page submit through case summary.
 *
 * Invariants (regression-tested):
 * 1. The exact submitted prompt becomes case.description, answers.what_happened,
 *    and the f_what case fact — byte for byte, never a sample or stale value.
 * 2. Every case read/write is keyed by intake.caseId. A stale UI closure can
 *    never pair answers with the wrong case.
 * 3. Skip sentinels are answers for the state machine but are NEVER persisted
 *    as case facts and NEVER shown as user content.
 * 4. beginIntakeFromPrompt is pure per-invocation: concurrent/double submits
 *    produce independent, internally-consistent cases (the router additionally
 *    guards with a busy flag so only the latest submit wins the UI).
 */
import type { Case, ID, IntakeState } from "@/types/domain";
import { intakeEngine, isSkippedValue } from "./intakeEngine.service";
import { caseEngine } from "./caseEngine.service";
import { actionPlanService } from "./actionPlan.service";
import { escalationService } from "./escalation.service";
import { legalKnowledgeService } from "./legalKnowledge.service";

export interface BegunIntake {
  intake: IntakeState;
  kase: Case;
}

/** Capture the landing-page complaint into a fresh case + intake state. */
export async function beginIntakeFromPrompt(prompt: string): Promise<BegunIntake> {
  const text = prompt.trim();
  if (!text) throw new Error("Please describe what happened before continuing.");
  const { category, confidence } = intakeEngine.inferCategory(text);
  const created = await caseEngine.createCase({ description: text, title: text.slice(0, 60) || "New case" });
  // The f_what fact carries the canonical text. addFact appends it to the
  // fresh (empty) facts array; the category patch below must not touch facts.
  await caseEngine.addFact(created.id, {
    key: "what_happened",
    label: "What happened",
    value: text,
    source: "user",
    confidence: null,
    verified: true,
  });
  await caseEngine.updateCase(created.id, {
    problemCategory: category,
    problemCategoryConfidence: confidence,
  });
  const kase = await caseEngine.getCase(created.id);
  if (!kase) throw new Error("Case not found");

  let state = intakeEngine.start(kase.id, category);
  state = intakeEngine.answer(state, "what_happened", text);
  if (category) state = intakeEngine.answer(state, "problem_category", category);
  return { intake: state, kase };
}

/** Record a real answer: state machine + fact persistence on the intake's own case. */
export async function answerIntakeQuestion(intake: IntakeState, key: string, value: unknown): Promise<IntakeState> {
  if (isSkippedValue(value)) {
    throw new Error("Skipped answers must go through skipIntakeQuestion, never as answer values.");
  }
  // Double-activation guard: concurrent submits for the same intake+question
  // share one execution, so rapid double-clicks persist exactly one fact.
  const flightKey = `${intake.caseId}:${key}`;
  const inflight = answerInflight.get(flightKey);
  if (inflight) return inflight;
  // Box assigned synchronously below, before any awaited continuation can run.
  const slot: { current?: Promise<IntakeState> } = {};
  const run = (async () => {
    try {
      return await answerOnce(intake, key, value);
    } finally {
      if (answerInflight.get(flightKey) === slot.current) answerInflight.delete(flightKey);
    }
  })();
  slot.current = run;
  answerInflight.set(flightKey, run);
  return run;
}

const answerInflight = new Map<string, Promise<IntakeState>>();

async function answerOnce(intake: IntakeState, key: string, value: unknown): Promise<IntakeState> {
  const question = intake.questions.find((q) => q.key === key);
  const next = intakeEngine.answer(intake, key, value);
  try {
    await caseEngine.addFact(intake.caseId, {
      key,
      label: question?.question ?? key,
      value: value as never,
      source: "user",
      confidence: null,
      verified: true,
    });
    if (key === "amount_involved" && typeof value === "number") {
      await caseEngine.updateCase(intake.caseId, { money: { amount: value, currency: "INR", context: "amount involved" } });
    }
  } catch {
    // fact persistence is best-effort; the answers map stays canonical
  }
  return next;
}

/** Record a skip: state machine only, no fact persistence, no sentinel leakage. */
export function skipIntakeQuestion(intake: IntakeState, key: string): IntakeState {
  return intakeEngine.skip(intake, key);
}

/**
 * Insufficient-facts gate (Finding 2.4). A category label alone ("Defective
 * or damaged product") plus zero real answers is not a plannable case.
 * Returns true only when: description is short AND no non-pre-answer exists
 * AND no money/evidence/extra facts were captured. Skips never count.
 */
export function isFactSparseForPlanning(kase: Case, intake: IntakeState): boolean {
  const descWords = kase.description.trim().split(/\s+/).filter(Boolean).length;
  if (descWords >= 10) return false;
  const realAnswers = Object.entries(intake.answers).filter(
    ([k, v]) => k !== "what_happened" && k !== "problem_category" && v !== undefined && v !== null && v !== "" && !isSkippedValue(v)
  );
  if (realAnswers.length > 0) return false;
  if (kase.money) return false;
  if (kase.evidence.length > 0) return false;
  if (kase.facts.some((f) => f.key !== "what_happened")) return false;
  return true;
}

/**
 * Finish the flow: loads the case BY intake.caseId (never a UI closure),
 * generates grounded analysis/plan/escalation from its description, and
 * returns the updated case. Skipped answers are excluded from whatIsMissing
 * wording that implies user content.
 */
export async function completeIntake(intake: IntakeState): Promise<Case> {
  const fresh = await caseEngine.getCase(intake.caseId);
  if (!fresh) throw new Error("Case missing");
  // Sparse input (e.g. category-card label only, everything skipped) must
  // NOT produce an action-ready plan. Show "not enough information" instead.
  if (isFactSparseForPlanning(fresh, intake)) {
    const sparsePlan = await actionPlanService.generateNeedsInformation({ case: fresh });
    return caseEngine.updateCase(fresh.id, { status: "intake", actionPlan: sparsePlan });
  }
  const legal = await legalKnowledgeService.search({ query: fresh.description, topK: 3 });
  const plan = await actionPlanService.generate({ case: fresh });
  const esc = await escalationService.assess(fresh);
  const missing = intake.questions
    .filter((qq) => !(qq.key in intake.answers) || isSkippedValue(intake.answers[qq.key]))
    .map((qq) => qq.question);
  const updated = await caseEngine.updateCase(fresh.id, {
    status: "action_ready",
    actionPlan: plan,
    escalation: esc,
    analysis: {
      id: `analysis_${Date.now()}`,
      caseId: fresh.id,
      createdAt: new Date().toISOString(),
      summary: legal.note ?? "We understood your situation. Here's a careful next-steps plan.",
      whatWeUnderstood: [fresh.description.slice(0, 120)],
      whatIsMissing: missing,
      relevantLaw: legal.claims,
      risks: esc.reasons,
      nextQuestions: [],
      confidence: legal.confidence,
      isMock: legal.isMock,
      disclaimer: legal.disclaimer,
    },
    deadlines: fresh.deadlines,
    evidence: fresh.evidence.length
      ? fresh.evidence
      : [
          { id: "ev_auto_1", caseId: fresh.id, title: "Your written description", description: "What you just told us", status: "have" as const },
          { id: "ev_auto_2", caseId: fresh.id, title: "Any agreement / receipt", description: "If you have it, keep it safe", status: "missing" as const, howToObtain: "Take a photo and keep in one folder" },
        ],
  });
  return updated;
}

/** Case id binding guard: an intake state only ever operates on its own case. */
export function assertIntakeCaseBinding(intake: IntakeState, caseId: ID): void {
  if (intake.caseId !== caseId) {
    throw new Error("Intake state does not belong to this case — refusing to pair answers with the wrong case.");
  }
}
