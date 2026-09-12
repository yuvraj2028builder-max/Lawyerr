import type { ScenarioStep } from "@/types/usability";

const STAGES: Array<{ id: ScenarioStep; label: string }> = [
  { id: "narrative", label: "Tell us" }, { id: "questions", label: "Questions" }, { id: "confirm_facts", label: "Review" }, { id: "evidence", label: "Evidence" }, { id: "action_plan", label: "Next steps" }, { id: "draft", label: "Draft" },
];
export function JourneyStage({ current }: { current: ScenarioStep }) {
  const currentIndex = Math.max(0, STAGES.findIndex((stage) => stage.id === current));
  return <nav aria-label="Your progress" className="row" style={{ gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
    {STAGES.map((stage, index) => <span key={stage.id} className="tiny" aria-current={stage.id === current ? "step" : undefined} style={{ padding: "4px 7px", borderRadius: 999, background: index <= currentIndex ? "var(--color-primary)" : "var(--color-surface-2)", color: index <= currentIndex ? "#fff" : "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>{stage.label}</span>)}
  </nav>;
}
