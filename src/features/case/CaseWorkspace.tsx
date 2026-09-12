import { lazy, Suspense, useState } from "react";
import type { Case } from "@/types/domain";
import { useLanguage } from "@/context/LanguageContext";
import { DemoBadge } from "@/components/ui/Badge";
import { Disclaimer } from "@/components/common/Disclaimer";
import { LegalPassagesPanel } from "@/features/legal/LegalPassagesPanel";
import { ConsumerActionPlanPanel } from "@/features/actionPlan/ConsumerActionPlanPanel";
import { CaseSummaryCard } from "@/features/case/CaseSummaryCard";
import { EvidenceLockerPanel } from "@/features/evidence/EvidenceLockerPanel";
import { VerifiedDeadlinesPanel } from "@/features/deadlines/VerifiedDeadlinesPanel";
import { CaseTimelinePanel } from "@/features/timeline/CaseTimelinePanel";
import { formatINR, formatDate } from "@/lib/formatters";
import { consumerActionPlanService } from "@/services/actionEngine/consumerActionPlan.service";
import { caseEngine } from "@/services/caseEngine.service";
import { RECOVERY_STATES } from "@/types/ux";
import { JourneyStage } from "@/components/common/JourneyStage";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { usabilityObservationService } from "@/services/usabilityObservation.service";
import { CaseSyncPanel } from "@/features/sync/CaseSyncPanel";
import { nextRecommendedAction } from "@/types/usability";

// Document handling and PDF drafting are optional, heavier workflow panels.
const DocumentUploadPanel = lazy(() => import("@/features/document/DocumentUploadPanel").then((m) => ({ default: m.DocumentUploadPanel })));
const DocumentReviewPanel = lazy(() => import("@/features/document/DocumentReviewPanel").then((m) => ({ default: m.DocumentReviewPanel })));
const ComplaintDraftPanel = lazy(() => import("@/features/complaint/ComplaintDraftPanel").then((m) => ({ default: m.ComplaintDraftPanel })));
const PanelFallback = () => <div className="card small muted" style={{ padding: 16 }}>Loading document tools…</div>;

export function CaseWorkspace({ kase, onReset }: { kase: Case; onReset: () => void }) {
  const { lang, t } = useLanguage();
  const [current, setCurrent] = useState<Case>(kase);
  const [localPlan, setLocalPlan] = useState(current.actionPlan);

  // Sync when prop changes (e.g., after intake)
  if (current.id !== kase.id) {
    setCurrent(kase);
    setLocalPlan(kase.actionPlan);
  }

  const plan = localPlan ?? current.actionPlan;
  const isNewPlan = !!(plan?.evidenceTasks || plan?.legalGrounds || plan?.status);

  const todayItems = plan?.items.filter((i) => i.priority === "today") ?? [];
  const nextItems = plan?.items.filter((i) => i.priority === "next") ?? [];
  const ifItems = plan?.items.filter((i) => i.priority === "if_no_response") ?? [];

  const handleToggle = async (actionId: string) => {
    if (!plan) return;
    const item = plan.items.find((a) => a.id === actionId);
    if (!item) return;
    const newStatus = item.status === "done" ? "pending" : "done";
    const updated = await consumerActionPlanService.updateActionStatus(plan, actionId, newStatus as never);
    setLocalPlan({ ...updated });
    await caseEngine.updateCase(current.id, { actionPlan: updated });
    const fresh = await caseEngine.getCase(current.id);
    if (fresh) setCurrent(fresh);
    if (newStatus === "done") usabilityObservationService.record({ event: "action_marked_complete", step: "action_plan" });
  };

  const handleCaseUpdate = async (updated: Case) => {
    setCurrent(updated);
    if (updated.actionPlan) setLocalPlan(updated.actionPlan);
  };

  return (
    <div className="container" style={{ padding: "24px 0 8px" }}>
      <div className="stack" style={{ gap: 16 }}>
        {/* Header */}
        <div className="card" style={{ padding: 18 }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span
                  className="tiny"
                  style={{
                    background: current.isDemo ? "#fef3c7" : "#ecfdf5",
                    color: current.isDemo ? "#92400e" : "#065f46",
                    border: `1px solid ${current.isDemo ? "#fcd34d" : "#a7f3d0"}`,
                    padding: "4px 8px",
                    borderRadius: 999,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {current.status}
                </span>
                {current.isDemo && <DemoBadge lang={lang} />}
                <span className="tiny muted">{formatDate(current.createdAt, lang)}</span>
              </div>
              <h2 className="h2" style={{ color: "var(--color-primary)" }}>{current.title}</h2>
              <p className="small muted" style={{ margin: 0, maxWidth: 720, lineHeight: 1.6 }}>{current.description}</p>
              {current.money && (
                <span className="small" style={{ fontWeight: 700 }}>
                  {formatINR(current.money.amount)} <span className="muted" style={{ fontWeight: 400 }}>• {current.money.context}</span>
                </span>
              )}
            </div>
            <button className="btn btn--ghost btn--sm" onClick={onReset}>
              ← {lang === "hi" ? "नया केस" : "New case"}
            </button>
          </div>
        </div>

        <Disclaimer />

        <div className="card" style={{ padding: 16, borderColor: "var(--color-primary)", background: "#f8fafc" }}>
          <JourneyStage current="action_plan" />
          <span className="tiny" style={{ fontWeight: 800, color: "var(--color-primary)", letterSpacing: "0.06em" }}>RECOMMENDED NEXT STEP</span>
          {(() => {
            const nextAction = nextRecommendedAction(plan);
            return (
              <>
                <h3 className="h3" style={{ margin: "4px 0" }}>
                  {nextAction ? `Next: ${nextAction.title}` : plan ? "All immediate steps completed" : RECOVERY_STATES.noPlan.title}
                </h3>
                <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  {nextAction
                    ? nextAction.description
                    : plan
                    ? "You have marked all immediate steps complete. If your issue remains unresolved, proceed to review evidence or prepare a draft complaint below."
                    : RECOVERY_STATES.noPlan.message}
                </p>
              </>
            );
          })()}
        </div>

        {/* CASE SUMMARY — new Prompt 6 */}
        <CaseSummaryCard kase={current} />

        {/* DO THIS NEXT — Action Plan */}
        {isNewPlan && plan ? (
          <ConsumerActionPlanPanel plan={plan} onToggleAction={handleToggle} />
        ) : plan ? (
          <div className="card" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h3 className="h3">✓ {lang === "hi" ? "आपका एक्शन प्लान" : "Your action plan"}</h3>
              {plan?.isMock && <DemoBadge lang={lang} />}
            </div>
            <p className="small muted" style={{ margin: "0 0 14px", lineHeight: 1.6 }}>{plan.summary}</p>
            {[
              { key: "today", label: t("case.actions.today"), items: todayItems, color: "#1a2a4a" },
              { key: "next", label: t("case.actions.next"), items: nextItems, color: "#6b6560" },
              { key: "if_no_response", label: t("case.actions.if_no_response"), items: ifItems, color: "#92400e" },
            ].map(
              (group) =>
                group.items.length > 0 && (
                  <div key={group.key} style={{ marginBottom: 14 }}>
                    <div className="tiny" style={{ fontWeight: 800, letterSpacing: "0.08em", color: group.color, marginBottom: 8 }}>{group.label}</div>
                    <div className="stack" style={{ gap: 8 }}>
                      {group.items.map((it) => (
                        <div key={it.id} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--color-border)", background: group.key === "today" ? "#fff" : "var(--color-surface-2)" }}>
                          <span aria-hidden style={{ marginTop: 2, width: 20, height: 20, borderRadius: 999, border: "1.5px solid var(--color-border-strong)", display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>☐</span>
                          <span style={{ flex: 1 }}>
                            <span style={{ display: "block", fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.3 }}>→ {it.title}</span>
                            <span className="small muted" style={{ lineHeight: 1.5 }}>{it.description}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
            )}
            <p className="tiny muted" style={{ margin: "8px 0 0", background: "var(--color-surface-2)", padding: "8px 10px", borderRadius: 8 }}>{plan.disclaimer}</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 18, textAlign: "center" }}>
            <p className="small muted" style={{ margin: 0 }}>{RECOVERY_STATES.noPlan.message}</p>
          </div>
        )}

        {/* Evidence — locker */}
        <EvidenceLockerPanel kase={current} onUpdate={handleCaseUpdate} />

        {/* Upload Document — real file selection */}
        <ErrorBoundary><Suspense fallback={<PanelFallback />}><DocumentUploadPanel kase={current} onUpdate={handleCaseUpdate} /></Suspense></ErrorBoundary>

        {/* Document Review — extracted facts, user confirmation */}
        <ErrorBoundary><Suspense fallback={<PanelFallback />}><DocumentReviewPanel kase={current} onUpdate={handleCaseUpdate} /></Suspense></ErrorBoundary>

        {/* Deadlines — verified engine */}
        <VerifiedDeadlinesPanel kase={current} onUpdate={handleCaseUpdate} />

        {/* Timeline — audit trail */}
        <CaseTimelinePanel kase={current} />

        {/* Save / Sync — optional, never required, never automatic */}
        <CaseSyncPanel kase={current} onSyncChange={async () => { const fresh = await caseEngine.getCase(current.id); if (fresh) handleCaseUpdate(fresh); }} />

        {/* Complaint Draft — grounded, placeholders, safety banner */}
        <ErrorBoundary><Suspense fallback={<PanelFallback />}><ComplaintDraftPanel kase={current} onUpdate={handleCaseUpdate} /></Suspense></ErrorBoundary>

        {/* Legal sources */}
        <LegalPassagesPanel claims={current.analysis?.relevantLaw ?? []} passages={undefined} />

        {/* Escalation */}
        <div className="card" style={{ padding: 16, borderColor: current.escalation?.level === "HIGH" ? "#fecaca" : current.escalation?.level === "MEDIUM" ? "#fde68a" : "var(--color-border)" }}>
          <h3 className="h3" style={{ marginBottom: 8 }}>{t("case.escalation")}</h3>
          {current.escalation ? (
            <>
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                <span className="badge" style={{ background: current.escalation.level === "HIGH" ? "#fef2f2" : current.escalation.level === "MEDIUM" ? "#fffbeb" : "#ecfdf5", color: current.escalation.level === "HIGH" ? "#991b1b" : current.escalation.level === "MEDIUM" ? "#92400e" : "#065f46", borderColor: "currentColor" }}>
                  {current.escalation.level}
                </span>
                <span className="small muted">{current.escalation.reasons[0]}</span>
              </div>
              <div className="grid" style={{ gap: 8 }}>
                {current.escalation.suggestedRoutes.map((r) => (
                  <div key={r.route} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-border)", background: "#fff" }}>
                    <strong className="small" style={{ display: "block" }}>{r.label}</strong>
                    <span className="small muted">{r.description}</span>
                  </div>
                ))}
              </div>
              <p className="tiny muted" style={{ margin: "10px 0 0" }}>{current.escalation.disclaimer}</p>
            </>
          ) : (
            <p className="small muted">We'll assess when human help may be needed after understanding your situation.</p>
          )}
        </div>
      </div>

      <style>{`@media (max-width: 880px) { .grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
