import type { Case } from "@/types/domain";
import { formatINR } from "@/lib/formatters";

export function CaseSummaryCard({ kase }: { kase: Case }) {
  const facts = kase.consumerFacts;
  const evidenceCount = kase.evidence?.length ?? 0;
  const actionsTotal = kase.actionPlan?.items.length ?? 0;
  const actionsDone = kase.actionPlan?.items.filter((a) => a.status === "done").length ?? 0;
  const deadlinesCount = kase.verifiedDeadlines?.filter((d) => d.status === "verified").length ?? kase.deadlines.length;
  const lastUpdated = new Date(kase.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div className="card" style={{ padding: 16, background: "var(--color-surface-2)" }}>
      <h3 className="h3" style={{ marginBottom: 10, color: "var(--color-primary)" }}>Your case</h3>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <span className="tiny muted" style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Problem</span>
          <p className="small" style={{ margin: "2px 0 0", fontWeight: 600, lineHeight: 1.4 }}>{facts?.productOrService ?? kase.title.slice(0, 40)}</p>
          <p className="tiny muted" style={{ margin: "2px 0 0", lineHeight: 1.4 }}>{kase.consumerIssueTypes?.join(", ") ?? kase.problemCategory ?? "consumer"}</p>
        </div>
        <div>
          <span className="tiny muted" style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Amount</span>
          <p className="small" style={{ margin: "2px 0 0", fontWeight: 700 }}>{facts?.amountPaid ? formatINR(facts.amountPaid.amount) : kase.money ? formatINR(kase.money.amount) : "—"}</p>
          <p className="tiny muted" style={{ margin: "2px 0 0" }}>{facts?.sellerOrProvider ?? "Seller not specified"}</p>
        </div>
        <div>
          <span className="tiny muted" style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Goal</span>
          <p className="small" style={{ margin: "2px 0 0", fontWeight: 600 }}>{facts?.desiredOutcome ?? kase.consumerFacts?.desiredOutcome ?? "Not specified"}</p>
          <p className="tiny muted" style={{ margin: "2px 0 0" }}>{facts?.desiredOutcomes?.join(", ") ?? ""}</p>
        </div>
        <div>
          <span className="tiny muted" style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Progress</span>
          <p className="small" style={{ margin: "2px 0 0", fontWeight: 600 }}>{actionsDone}/{actionsTotal} actions done</p>
          <p className="tiny muted" style={{ margin: "2px 0 0" }}>{evidenceCount} evidence • {deadlinesCount} deadlines • Updated {lastUpdated}</p>
        </div>
      </div>
    </div>
  );
}
