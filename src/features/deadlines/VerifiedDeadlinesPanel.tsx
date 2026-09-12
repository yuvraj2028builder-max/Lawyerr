import { useState, useEffect } from "react";
import type { Case, VerifiedDeadline } from "@/types/domain";
import { verifiedDeadlineService } from "@/services/verifiedDeadline.service";
import { useLanguage } from "@/context/LanguageContext";

export function VerifiedDeadlinesPanel({ kase, onUpdate }: { kase: Case; onUpdate: (c: Case) => void }) {
  const { lang } = useLanguage();
  const [deadlines, setDeadlines] = useState<VerifiedDeadline[]>(kase.verifiedDeadlines ?? []);
  const [triggerDate, setTriggerDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeadlines(kase.verifiedDeadlines ?? []);
  }, [kase.verifiedDeadlines]);

  const handleCalculate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await verifiedDeadlineService.calculateForCase({
        caseId: kase.id,
        triggerDate: triggerDate || undefined,
        triggerDescription: "complaint submitted to seller",
      });
      setDeadlines(res);
      // Refresh case
      const { caseEngine } = await import("@/services/caseEngine.service");
      const fresh = await caseEngine.getCase(kase.id);
      if (fresh) onUpdate(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to calculate");
    } finally {
      setBusy(false);
    }
  };

  const verified = deadlines.filter((d) => d.status === "verified" || d.status === "overdue");
  const needsDate = deadlines.filter((d) => d.status === "needs_trigger_date");
  const unknown = deadlines.filter((d) => d.status === "unknown");

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="h3" style={{ marginBottom: 8 }}>{lang === "hi" ? "समय-सीमा" : "Deadlines"}</h3>

      {verified.length > 0 ? (
        <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
          {verified.map((d) => (
            <div key={d.id} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${d.status === "overdue" ? "#fecaca" : "#bfdbfe"}`, background: d.status === "overdue" ? "#fef2f2" : "#eff6ff" }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span className="small" style={{ fontWeight: 700, color: d.status === "overdue" ? "#991b1b" : "#1e40af" }}>{d.label}</span>
                <span className="tiny" style={{ padding: "2px 6px", borderRadius: 999, fontWeight: 700, background: d.status === "overdue" ? "#fecaca" : "#bfdbfe", color: "#1e3a5f" }}>{d.status}</span>
              </div>
              <p className="small muted" style={{ margin: "4px 0 0", lineHeight: 1.5 }}>
                Trigger: {d.triggerDescription} • Due: {d.dueDate ? new Date(d.dueDate).toLocaleDateString("en-IN") : "—"} {d.dueDate && new Date(d.dueDate) < new Date() ? "(overdue)" : ""}
              </p>
              <p className="tiny muted" style={{ margin: "4px 0 0", fontStyle: "italic" }}>{d.citation} • {d.calculationMethod}</p>
              {d.warning && <p className="tiny" style={{ margin: "6px 0 0", color: "#92400e" }}>{d.warning}</p>}
            </div>
          ))}
        </div>
      ) : needsDate.length > 0 ? (
        <div style={{ padding: "12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, marginBottom: 12 }}>
          <p className="small" style={{ margin: 0, fontWeight: 600, color: "#92400e" }}>{lang === "hi" ? "ट्रिगर तारीख चाहिए" : "A potentially relevant time limit may apply, but NyayaSetu does not have the trigger date needed to calculate it."}</p>
          <p className="small muted" style={{ margin: "4px 0 0" }}>{needsDate[0].label} — {needsDate[0].warning}</p>
        </div>
      ) : unknown.length > 0 ? (
        <div style={{ padding: "12px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px dashed var(--color-border)", marginBottom: 12, textAlign: "center" }}>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>{lang === "hi" ? "कोई सत्यापित समय-सीमा उपलब्ध नहीं।" : "No verified deadline is currently available for this case from NyayaSetu's legal sources."}</p>
          <p className="tiny muted" style={{ margin: "4px 0 0" }}>{unknown[0].warning ?? "We will not guess a deadline."}</p>
        </div>
      ) : (
        <div style={{ padding: "12px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px dashed var(--color-border)", marginBottom: 12, textAlign: "center" }}>
          <p className="small muted" style={{ margin: 0 }}>{lang === "hi" ? "कोई समय-सीमा नहीं।" : "No deadlines yet."}</p>
        </div>
      )}

      <div className="card" style={{ padding: 12, background: "var(--color-surface-2)" }}>
        <p className="small" style={{ margin: 0, fontWeight: 600 }}>{lang === "hi" ? "समय-सीमा जांचें" : "Check a deadline"}</p>
        <p className="tiny muted" style={{ margin: "4px 0 8px", lineHeight: 1.4 }}>{lang === "hi" ? "ट्रिगर तारीख (शिकायत भेजने की तारीख) डालें — केवल सत्यापित स्रोत से गणना होगी।" : "Enter trigger date (when complaint was sent) — exact deadline only if verified source contains time limit."}</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="input" type="date" value={triggerDate} onChange={(e) => setTriggerDate(e.target.value)} style={{ flex: "1 1 160px", padding: "8px 10px" }} />
          <button className="btn btn--primary btn--sm" onClick={handleCalculate} disabled={busy}>
            {busy ? "Calculating…" : lang === "hi" ? "गणना करें" : "Calculate"}
          </button>
        </div>
        {error && <p className="small" style={{ color: "#991b1b", marginTop: 8 }}>{error}</p>}
        <p className="tiny muted" style={{ margin: "8px 0 0", fontStyle: "italic" }}>Pure calculation: triggerDate + 48h / 1 calendar month (UTC, deterministic). Never invents. Ignores user-provided “30 days” claims as authority.</p>
      </div>
    </div>
  );
}
