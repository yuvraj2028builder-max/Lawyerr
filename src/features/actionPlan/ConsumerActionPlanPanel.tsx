import type { ActionPlan, ActionItem } from "@/types/domain";
import { useLanguage } from "@/context/LanguageContext";
import { DemoBadge } from "@/components/ui/Badge";
import { EXPLANATION_COPY } from "@/types/ux";

function badgeForLegal(a: ActionItem): string {
  if (a.isLegalRequirement) return "LEGAL BASIS";
  if (a.category === "file_grievance" || a.category === "escalate") return "OFFICIAL PROCESS";
  return "PRACTICAL STEP";
}

export function ConsumerActionPlanPanel({
  plan,
  onToggleAction,
}: {
  plan: ActionPlan;
  onToggleAction?: (actionId: string) => void;
}) {
  const { lang } = useLanguage();

  const nowActions = plan.items.filter((a) => a.priority === "today");
  const nextActions = plan.items.filter((a) => a.priority === "next");
  const laterActions = plan.items.filter((a) => a.priority === "if_no_response" || a.priority === "optional");

  const renderAction = (a: ActionItem) => {
    const isDone = a.status === "done";
    return (
      <div
        key={a.id}
        style={{
          display: "flex",
          gap: 12,
          padding: "14px 14px",
          borderRadius: 12,
          border: `1px solid ${isDone ? "#a7f3d0" : "var(--color-border)"}`,
          background: isDone ? "#ecfdf5" : "#fff",
          opacity: isDone ? 0.85 : 1,
        }}
      >
        <button
          aria-label={isDone ? "Mark this step as not done" : "Mark this step complete"}
          onClick={() => onToggleAction?.(a.id)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            border: `1.5px solid ${isDone ? "#065f46" : "var(--color-border-strong)"}`,
            background: isDone ? "#065f46" : "#fff",
            color: isDone ? "#fff" : "transparent",
            display: "grid",
            placeItems: "center",
            fontSize: 14,
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          ✓
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2 }}>
              {a.order ? `${a.order}. ` : ""}{a.title}
            </span>
            <span
              className="tiny"
              style={{
                padding: "2px 6px",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: "0.65rem",
                letterSpacing: "0.04em",
                background: badgeForLegal(a) === "LEGAL BASIS" ? "#e0e7ff" : badgeForLegal(a) === "OFFICIAL PROCESS" ? "#fef3c7" : "#f3f1ee",
                border: "1px solid var(--color-border)",
                color: "#1a1a18",
              }}
            >
              {badgeForLegal(a)}
            </span>
            {a.isLegalRequirement && (
              <span className="tiny" style={{ color: "#065f46", fontWeight: 600 }}>
                • From official source material
              </span>
            )}
          </div>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
            {a.description}
          </p>
          <p className="tiny muted" style={{ margin: "5px 0 0" }}>
            {isDone ? "Marked complete by you. You can change this if needed." : "When you finish this step, mark it complete. This does not guarantee a result."}
          </p>
          {a.relatedEvidenceId && <p className="tiny muted" style={{ margin: "4px 0 0" }}>You may need the related evidence before completing this step.</p>}
          {a.sourceRefs && a.sourceRefs.length > 0 && (
            <p className="tiny muted" style={{ margin: "6px 0 0", fontStyle: "italic" }}>
              Source: {a.sourceRefs.join(", ")}
            </p>
          )}
          {a.blockedReason && <p className="tiny" style={{ margin: "6px 0 0", color: "#991b1b" }}>{a.blockedReason}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Summary — YOUR SITUATION */}
      <div className="card" style={{ padding: 16, background: "var(--color-surface-2)" }}>
        <h3 className="h3" style={{ marginBottom: 6, color: "var(--color-primary)" }}>
          {lang === "hi" ? "आपकी स्थिति" : "Your situation"}
        </h3>
        <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>{plan.summary}</p>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {plan.legalGrounds && plan.legalGrounds.length > 0 ? (
            plan.legalGrounds.map((g) => (
              <span key={g.sourceId} className="tiny" style={{ padding: "4px 8px", borderRadius: 999, background: "#e0e7ff", border: "1px solid #bfdbfe", fontWeight: 600 }}>
                {g.citation.slice(0, 60)}…
              </span>
            ))
          ) : (
            <span className="tiny muted">{lang === "hi" ? "कानूनी आधार सत्यापित नहीं" : "No verified legal grounding for this specific claim"}</span>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <h4 className="h3" style={{ marginBottom: 8 }}>How to read this plan</h4>
        <div className="stack" style={{ gap: 6 }}>
          {Object.values(EXPLANATION_COPY).map((item) => <p key={item.label} className="tiny muted" style={{ margin: 0 }}><strong>{item.label}:</strong> {item.description}</p>)}
        </div>
      </div>

      {/* DO THIS NEXT — prominent */}
      <div className="card" style={{ padding: 18, borderColor: "var(--color-primary)", borderWidth: 1.5 }}>
        <h3 className="h3" style={{ marginBottom: 2, color: "var(--color-primary)", letterSpacing: "0.02em" }}>
          # {lang === "hi" ? "अब ये करें" : "DO THIS NEXT"}
        </h3>
        <p className="tiny muted" style={{ margin: "0 0 12px" }}>
          {lang === "hi" ? "सबसे पहले करने योग्य कदम" : "Most important steps first"}
        </p>
        <div className="stack" style={{ gap: 10 }}>
          {nowActions.length > 0 ? nowActions.map(renderAction) : <p className="small muted" style={{ margin: 0 }}>No immediate action is available yet. Review the details above or add evidence when you have it.</p>}
        </div>
      </div>

      {/* NEXT */}
      {nextActions.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h4 className="h3" style={{ marginBottom: 8 }}>{lang === "hi" ? "अगला कदम" : "NEXT"}</h4>
          <div className="stack" style={{ gap: 10 }}>{nextActions.map(renderAction)}</div>
        </div>
      )}

      {/* IF UNRESOLVED */}
      {laterActions.length > 0 && (
        <div className="card" style={{ padding: 16, background: "#fffbeb", borderColor: "#fde68a" }}>
          <h4 className="h3" style={{ marginBottom: 8 }}>{lang === "hi" ? "अगर बात न बने तो" : "IF THEY DON'T RESOLVE IT"}</h4>
          <div className="stack" style={{ gap: 10 }}>{laterActions.map(renderAction)}</div>
        </div>
      )}

      {/* Evidence checklist */}
      {plan.evidenceTasks && plan.evidenceTasks.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h4 className="h3">{lang === "hi" ? "सबूत चेकलिस्ट" : "Evidence checklist"}</h4>
            <span className="tiny muted">{plan.evidenceTasks.filter((t) => t.status === "available").length}/{plan.evidenceTasks.length}</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {plan.evidenceTasks.map((t) => (
              <div key={t.id} className="row" style={{ gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: t.status === "available" ? "#ecfdf5" : t.status === "missing" ? "#fef2f2" : "#fff" }}>
                <span aria-hidden style={{ width: 20, height: 20, borderRadius: 999, border: "1.5px solid", borderColor: t.status === "available" ? "#065f46" : "#9a9590", background: t.status === "available" ? "#065f46" : "transparent", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>{t.status === "available" ? "✓" : "•"}</span>
                <span style={{ flex: 1 }}>
                  <span className="small" style={{ fontWeight: 600 }}>{t.label}</span>
                  <span className="tiny muted" style={{ display: "block", lineHeight: 1.4 }}>{t.description}</span>
                </span>
                <span className="tiny" style={{ padding: "2px 6px", borderRadius: 999, fontWeight: 600, background: t.requiredLevel === "important" ? "#fef2f2" : t.requiredLevel === "helpful" ? "#fffbeb" : "#f3f1ee", border: "1px solid var(--color-border)" }}>
                  {t.requiredLevel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deadlines — only if verified */}
      {plan.deadlines && plan.deadlines.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h4 className="h3" style={{ marginBottom: 8 }}>{lang === "hi" ? "समय-सीमा" : "Deadlines"}</h4>
          {plan.deadlines.map((d) => (
            <div key={d.id} className="row" style={{ gap: 8, padding: "8px 10px", border: "1px solid #fecaca", borderRadius: 8, background: "#fef2f2", marginBottom: 6 }}>
              <span className="tiny" style={{ fontWeight: 700, color: "#991b1b" }}>{d.urgency}</span>
              <span className="small" style={{ flex: 1 }}>{d.label} — {new Date(d.date).toLocaleDateString("en-IN")} {d.isEstimated ? "(estimated)" : ""}</span>
            </div>
          ))}
          <p className="tiny muted" style={{ margin: "8px 0 0" }}>Deadlines shown only when verified source explicitly contains a time limit. Otherwise: “Check the applicable deadline before delaying further.”</p>
        </div>
      )}

      {/* Legal grounds — citations human-readable */}
      {plan.legalGrounds && plan.legalGrounds.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h4 className="h3" style={{ marginBottom: 8 }}>{lang === "hi" ? "कानूनी आधार" : "Legal basis"}</h4>
          {plan.legalGrounds.map((g) => (
            <div key={g.sourceId + g.provisionId} style={{ padding: "10px 12px", border: "1px solid #bfdbfe", borderRadius: 10, background: "#eff6ff", marginBottom: 8 }}>
              <p className="small" style={{ margin: 0, fontWeight: 600 }}>{g.citation}</p>
              <p className="tiny muted" style={{ margin: "4px 0 0" }}>{g.claim.slice(0, 180)}…</p>
              <a href={g.sourceUrl} target="_blank" rel="noopener noreferrer" className="tiny" style={{ color: "var(--color-primary)", fontWeight: 600, display: "inline-block", marginTop: 4 }}>
                View source ↗
              </a>
              <span className="tiny" style={{ marginLeft: 8, padding: "2px 6px", borderRadius: 999, background: "#fff", border: "1px solid #bfdbfe" }}>{g.sourceType} • {g.provisionKind}</span>
            </div>
          ))}
          {plan.legalGrounds.some((g) => g.provisionKind === "official_procedure") && (
            <p className="tiny muted" style={{ margin: "8px 0 0", fontStyle: "italic" }}>Official procedure sources are not statutory law. Distinguished above as <strong>OFFICIAL PROCESS</strong> vs <strong>LEGAL BASIS</strong>.</p>
          )}
        </div>
      )}

      {/* Official procedure vs law already distinguished above */}

      {/* Warnings */}
      {plan.warnings && plan.warnings.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {plan.warnings.map((w) => (
            <div key={w.id} className="card" style={{ padding: 12, background: w.severity === "blocked" ? "#fef2f2" : w.severity === "warning" ? "#fffbeb" : "#f3f1ee", borderColor: w.severity === "blocked" ? "#fecaca" : w.severity === "warning" ? "#fde68a" : "var(--color-border)" }}>
              <p className="small" style={{ margin: 0, color: w.severity === "blocked" ? "#991b1b" : "#92400e" }}>{w.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Escalation */}
      {plan.escalation && (
        <div className="card" style={{ padding: 14 }}>
          <h4 className="h3" style={{ marginBottom: 6 }}>{lang === "hi" ? "आगे कब बढ़ें" : "Escalation"}</h4>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>{plan.escalation.reasons[0]}</p>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {plan.escalation.suggestedRoutes.slice(0, 2).map((r) => (
              <div key={r.route} style={{ padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, background: "#fff" }}>
                <strong className="small">{r.label}</strong>
                <span className="small muted" style={{ display: "block" }}>{r.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Versioning & disclaimer */}
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className="tiny muted">Plan v{plan.planVersion ?? 1} • {plan.generatedAt ? new Date(plan.generatedAt).toLocaleDateString("en-IN") : ""}</span>
        {plan.isMock && <DemoBadge lang={lang} />}
      </div>
      <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5, background: "var(--color-surface-2)", padding: "8px 10px", borderRadius: 8 }}>
        {plan.disclaimer}
      </p>
      <p className="tiny muted" style={{ margin: 0, fontStyle: "italic", textAlign: "center" }}>This is general information, not a guarantee of outcome or a substitute for advice from a qualified lawyer.</p>
    </div>
  );
}
