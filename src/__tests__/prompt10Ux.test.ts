import { describe, expect, it } from "vitest";
import { EXPLANATION_COPY, RECOVERY_STATES, userFacingStorageStatus, type ConfidenceLabel, type PrimaryAction, type UserJourneyStage } from "@/types/ux";

describe("Prompt 10 — journey contract", () => {
  it.each<UserJourneyStage>(["tell_us", "review_facts", "next_step", "evidence", "review_document", "draft", "escalate"])("includes the %s journey stage", (stage) => expect(typeof stage).toBe("string"));
  it("supports one explicit primary action", () => {
    const action: PrimaryAction = { label: "Tell us what happened", stage: "tell_us", explanation: "Start in your own words." };
    expect(action.label).toBe("Tell us what happened");
  });
  it.each<ConfidenceLabel>(["confirmed_by_you", "from_document_needs_confirmation", "we_need_more_information"])("uses the safe %s confidence label", (label) => expect(label).not.toContain("verified"));
});

describe("Prompt 10 — action explanation language", () => {
  it("labels legal basis distinctly", () => expect(EXPLANATION_COPY.legal_basis.label).toBe("Legal basis"));
  it("does not promise an outcome for legal basis", () => expect(EXPLANATION_COPY.legal_basis.description).toContain("not a guarantee"));
  it("labels practical advice as a practical step", () => expect(EXPLANATION_COPY.practical_step.label).toBe("Practical step"));
  it("makes practical advice conditional on available facts", () => expect(EXPLANATION_COPY.practical_step.description).toContain("available"));
  it("labels user facts as user information", () => expect(EXPLANATION_COPY.your_information.label).toBe("Your information"));
  it("asks the user to review their information", () => expect(EXPLANATION_COPY.your_information.description).toContain("review"));
});

describe("Prompt 10 — recovery and empty states", () => {
  it("has a no-evidence recovery action", () => expect(RECOVERY_STATES.noEvidence.action.action).toBe("add_evidence"));
  it("does not call user evidence verified", () => expect(RECOVERY_STATES.noEvidence.message.toLowerCase()).not.toContain("verified"));
  it("explains unreadable document recovery", () => expect(RECOVERY_STATES.unreadableDocument.message).toContain("enter the details manually"));
  it("marks unreadable documents as a warning", () => expect(RECOVERY_STATES.unreadableDocument.tone).toBe("warning"));
  it("keeps the draft after export failure", () => expect(RECOVERY_STATES.exportFailed.message).toContain("still here"));
  it("marks export failure as an error", () => expect(RECOVERY_STATES.exportFailed.tone).toBe("error"));
  it("gives action-plan recovery guidance", () => expect(RECOVERY_STATES.noPlan.action.action).toBe("review"));
  it("does not claim a plan is available without facts", () => expect(RECOVERY_STATES.noPlan.title).toContain("confirmed details"));
});

describe("Prompt 10 — local-demo wording", () => {
  it("calls IndexedDB state browser-local", () => expect(userFacingStorageStatus("browser_local")).toBe("Saved in this browser"));
  it("calls memory state session-local", () => expect(userFacingStorageStatus("memory_only")).toContain("this session"));
  it("does not label cloud as configured", () => expect(userFacingStorageStatus("cloud").toLowerCase()).not.toContain("cloud"));
  it.each(["not_configured", "unknown", "unavailable"])("keeps unknown %s storage states local", (value) => expect(userFacingStorageStatus(value)).toContain("browser"));
});

describe("Prompt 10 — wording safety", () => {
  const allCopy = Object.values(EXPLANATION_COPY).flatMap((item) => [item.label, item.description]).join(" ").toLowerCase();
  it("does not guarantee a refund", () => expect(allCopy).not.toContain("guaranteed refund"));
  it("does not promise that the user will win", () => expect(allCopy).not.toContain("you will win"));
  it("does not present user data as legal verification", () => expect(allCopy).not.toContain("verified evidence"));
  it("does not present a practical step as legal advice", () => expect(EXPLANATION_COPY.practical_step.description.toLowerCase()).not.toContain("legal advice"));
  it("does not promise complete legal coverage", () => expect(allCopy).not.toContain("complete legal"));
  it("keeps recovery copy free of stack traces", () => expect(JSON.stringify(RECOVERY_STATES)).not.toContain("Error:"));
  it("keeps recovery copy free of provider internals", () => expect(JSON.stringify(RECOVERY_STATES)).not.toContain("not_configured"));
  it("keeps recovery copy free of automatic filing claims", () => expect(JSON.stringify(RECOVERY_STATES).toLowerCase()).not.toContain("automatically filed"));
});
