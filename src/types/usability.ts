import type { ActionItem, ActionPlan } from "@/types/domain";

export type ScenarioId = "defective_purchase" | "vague_purchase" | "unsupported_domain" | "legal_notice" | "unreadable_document";
export type ScenarioStep = "start" | "narrative" | "questions" | "confirm_facts" | "evidence" | "action_plan" | "document_review" | "draft" | "human_review";
export type ExpectedUserOutcome = "continue" | "clarify" | "consumer_plan" | "unsupported_domain_message" | "human_review" | "manual_document_entry";
export type FrictionPoint = "unclear_next_action" | "unknown_answer" | "unconfirmed_fact" | "unreadable_document" | "unsupported_domain" | "high_risk";
export interface RecoveryPath { friction: FrictionPoint; message: string; action: "skip" | "correct" | "retry" | "keep_as_evidence" | "start_over" | "seek_human_review"; }
export interface UsabilityScenario { id: ScenarioId; statement: string; steps: ScenarioStep[]; expectedOutcome: ExpectedUserOutcome; frictionPoints: FrictionPoint[]; recoveryPaths: RecoveryPath[]; }
export interface UserObservation { event: "scenario_started" | "step_viewed" | "step_completed" | "went_back" | "skipped" | "error_recovered" | "action_marked_complete" | "document_review_opened" | "draft_preview_opened"; scenarioId?: ScenarioId; step?: ScenarioStep; occurredAt: string; }
export interface UsabilityResult { scenarioId: ScenarioId; completed: boolean; observedFriction: FrictionPoint[]; recoveryUsed?: RecoveryPath["action"]; notes?: "structured_only"; }

export const USABILITY_SCENARIOS: UsabilityScenario[] = [
  { id: "defective_purchase", statement: "My phone was defective. I bought it online. The seller refused my refund.", steps: ["start", "narrative", "questions", "confirm_facts", "evidence", "action_plan", "draft"], expectedOutcome: "consumer_plan", frictionPoints: ["unknown_answer", "unconfirmed_fact"], recoveryPaths: [{ friction: "unknown_answer", message: "You can skip what you do not know.", action: "skip" }] },
  { id: "vague_purchase", statement: "Something went wrong with a purchase.", steps: ["start", "narrative", "questions"], expectedOutcome: "clarify", frictionPoints: ["unknown_answer"], recoveryPaths: [{ friction: "unknown_answer", message: "We need one more detail before suggesting next steps.", action: "skip" }] },
  { id: "unsupported_domain", statement: "My employer has not paid my salary.", steps: ["start", "narrative"], expectedOutcome: "unsupported_domain_message", frictionPoints: ["unsupported_domain"], recoveryPaths: [{ friction: "unsupported_domain", message: "This flow currently supports consumer problems.", action: "start_over" }] },
  { id: "legal_notice", statement: "I received a legal notice.", steps: ["start", "narrative", "human_review"], expectedOutcome: "human_review", frictionPoints: ["high_risk"], recoveryPaths: [{ friction: "high_risk", message: "A lawyer or official authority may need to review this.", action: "seek_human_review" }] },
  { id: "unreadable_document", statement: "I uploaded a scanned document that could not be read.", steps: ["evidence", "document_review"], expectedOutcome: "manual_document_entry", frictionPoints: ["unreadable_document"], recoveryPaths: [{ friction: "unreadable_document", message: "Keep the file and enter details manually.", action: "keep_as_evidence" }] },
];

export function nextRecommendedAction(plan?: ActionPlan | null): ActionItem | null {
  if (!plan) return null;
  return plan.items.find((item) => item.status !== "done" && item.priority === "today") ?? plan.items.find((item) => item.status !== "done") ?? null;
}
