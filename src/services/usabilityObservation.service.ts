/** Development-only, in-memory usability observation. It accepts no free text or identifiers. */
import type { UserObservation } from "@/types/usability";

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
}
export const usabilityObservationService = new UsabilityObservationService();
