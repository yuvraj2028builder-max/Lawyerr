import { describe, it, expect } from "vitest";
import { intakeEngine } from "@/services/intakeEngine.service";

describe("IntakeEngine", () => {
  it("infers security deposit category", () => {
    const r = intakeEngine.inferCategory("My security deposit not returned");
    expect(r.category).toBe("security_deposit");
  });

  it("infers cheque bounce", () => {
    const r = intakeEngine.inferCategory("cheque bounce 138");
    expect(r.category).toBe("cheque_bounce");
  });

  it("returns null for generic text", () => {
    const r = intakeEngine.inferCategory("hello world");
    expect(r.category).toBeNull();
  });

  it("starts intake and advances one question at a time", () => {
    const state = intakeEngine.start("case_1", "security_deposit");
    expect(state.questions.length).toBeGreaterThan(0);
    const q1 = intakeEngine.nextQuestion(state);
    expect(q1).toBeTruthy();
    const next = intakeEngine.answer(state, q1!.key, "test answer");
    expect(next.answers[q1!.key]).toBe("test answer");
  });

  it("summarizes answers", () => {
    const state = intakeEngine.start("case_1");
    const withAns = intakeEngine.answer(state, "what_happened", "Landlord issue");
    expect(intakeEngine.summarize(withAns)).toContain("Landlord issue");
  });
});
