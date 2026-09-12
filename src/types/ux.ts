/** Product-facing vocabulary: avoid exposing service status terms to users. */
export type UserJourneyStage = "tell_us" | "review_facts" | "next_step" | "evidence" | "review_document" | "draft" | "escalate";
export type ExplanationType = "legal_basis" | "practical_step" | "your_information";
export type ConfidenceLabel = "confirmed_by_you" | "from_document_needs_confirmation" | "we_need_more_information";
export interface PrimaryAction { label: string; stage: UserJourneyStage; explanation: string; }
export interface UserFacingStatus { tone: "neutral" | "warning" | "error"; title: string; message: string; }
export interface RecoveryAction { label: string; action: "start" | "retry" | "add_evidence" | "enter_manually" | "review"; }
export interface EmptyState { title: string; message: string; action: RecoveryAction; }
export const EXPLANATION_COPY: Record<ExplanationType, { label: string; description: string }> = {
  legal_basis: { label: "Legal basis", description: "Relevant official source material. It is not a guarantee of outcome." },
  practical_step: { label: "Practical step", description: "A useful next action based on the information available." },
  your_information: { label: "Your information", description: "Information you provided. Please review it for accuracy." },
};
export const RECOVERY_STATES = {
  noEvidence: { title: "No evidence added yet", message: "You can add what you have now. You stay in control.", action: { label: "Add evidence", action: "add_evidence" } },
  unreadableDocument: { tone: "warning", title: "Text could not be read", message: "You can keep the file and enter the details manually." },
  exportFailed: { tone: "error", title: "Could not export the draft", message: "Your draft is still here. Try again after reviewing the details." },
  noPlan: { title: "We need a few confirmed details first", message: "Review what we understood so we can suggest the next step.", action: { label: "Review details", action: "review" } },
} as const;
export function userFacingStorageStatus(tier: "memory_only" | "browser_local" | "cloud" | string): string {
  return tier === "browser_local" ? "Saved in this browser" : "Saved for this session in this browser";
}
