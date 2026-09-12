/** Development-only, in-memory usability observation. It accepts no free text or identifiers. */
import type { UserObservation, ScenarioId, ScenarioStep } from "@/types/usability";

const ALLOWED_KEYS = new Set(["event", "scenarioId", "step", "occurredAt"]);
export class UsabilityObservationService {
  private observations: UserObservation[] = [];
  record(input: Omit<UserObservation, "occurredAt">): UserObservation {
    const observation: UserObservation = { ...input, occurredAt: new Date().toISOString() };
    if (Object.keys(observation).some((key) => !ALLOWED_KEYS.has(key))) throw new Error("Only structured usability fields are allowed.");
    this.observations.push(observation);
    return observation;
  }
  list(): UserObservation[] { return [...this.observations]; }
  clear(): void { this.observations = []; }
  summarizeScenario(scenarioId?: ScenarioId): {
    totalEvents: number;
    stepsCompleted: ScenarioStep[];
    actionsCompleted: number;
    frictionEncountered: Array<"went_back" | "skipped" | "error_recovered">;
  } {
    const list = scenarioId
      ? this.observations.filter((o) => o.scenarioId === scenarioId)
      : this.observations;
    const stepsCompleted = list
      .filter((o) => o.event === "step_completed" && o.step)
      .map((o) => o.step as ScenarioStep);
    const actionsCompleted = list.filter((o) => o.event === "action_marked_complete").length;
    const frictionEncountered = list
      .filter((o) => o.event === "went_back" || o.event === "skipped" || o.event === "error_recovered")
      .map((o) => o.event as "went_back" | "skipped" | "error_recovered");
    return {
      totalEvents: list.length,
      stepsCompleted,
      actionsCompleted,
      frictionEncountered,
    };
  }
}
export const usabilityObservationService = new UsabilityObservationService();
