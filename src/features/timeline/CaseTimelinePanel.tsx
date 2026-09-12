import { useState, useEffect } from "react";
import type { Case, CaseTimelineEvent, TimelineEventType } from "@/types/domain";
import { timelineService } from "@/services/timeline.service";
import { useLanguage } from "@/context/LanguageContext";

const FILTERS: Array<{ key: string; label: string; types: TimelineEventType[] | null }> = [
  { key: "all", label: "All", types: null },
  { key: "actions", label: "Actions", types: ["action_created", "action_completed", "action_reopened", "plan_generated", "plan_regenerated"] },
  { key: "evidence", label: "Evidence", types: ["evidence_added", "evidence_updated", "evidence_removed"] },
  { key: "updates", label: "Updates", types: ["fact_updated", "intake_completed", "case_created", "user_note"] },
  { key: "deadlines", label: "Deadlines", types: ["deadline_created", "deadline_updated", "deadline_completed"] },
];

function formatDate(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(0, 16);
  }
}

export function CaseTimelinePanel({ kase }: { kase: Case }) {
  const { lang } = useLanguage();
  const [events, setEvents] = useState<CaseTimelineEvent[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [note, setNote] = useState("");

  const load = async () => {
    const evs = await timelineService.getTimeline(kase.id, { order: "desc" });
    // If filter is not all, apply client-side
    const f = FILTERS.find((x) => x.key === filter);
    if (f?.types) {
      setEvents(evs.filter((e) => f.types!.includes(e.type)));
    } else {
      setEvents(evs);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kase.id, kase.timeline, filter]);

  const handleAddNote = async () => {
    if (!note.trim()) return;
    await timelineService.addUserNote(kase.id, note.trim());
    setNote("");
    await load();
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h3 className="h3">{lang === "hi" ? "केस टाइमलाइन" : "Case timeline"}</h3>
        <span className="tiny muted">{events.length} events</span>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? "btn btn--primary btn--sm" : "btn btn--secondary btn--sm"}
            onClick={() => setFilter(f.key)}
            style={{ fontSize: "0.75rem", padding: "4px 10px" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div style={{ padding: "16px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px dashed var(--color-border)", textAlign: "center" }}>
          <p className="small muted" style={{ margin: 0 }}>{lang === "hi" ? "आपकी टाइमलाइन यहाँ दिखेगी।" : "Your case timeline will appear here as you take actions."}</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10, maxHeight: 380, overflowY: "auto", paddingRight: 4 }}>
          {events.map((ev) => (
            <div key={ev.id} className="row" style={{ gap: 12, alignItems: "flex-start" }}>
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: ev.source === "user_reported" ? "#d97706" : "var(--color-primary)",
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0, padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 10, background: ev.source === "user_reported" ? "#fffbeb" : "#fff" }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span className="small" style={{ fontWeight: 600, lineHeight: 1.3 }}>{ev.title}</span>
                  <span className="tiny muted">{formatDate(ev.occurredAt, lang)} • {ev.source === "user_reported" ? "user-reported" : ev.source}</span>
                </div>
                {ev.description && <p className="small muted" style={{ margin: "4px 0 0", lineHeight: 1.5 }}>{ev.description}</p>}
                <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{ev.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 12, marginTop: 12, background: "var(--color-surface-2)" }}>
        <p className="small" style={{ margin: 0, fontWeight: 600 }}>{lang === "hi" ? "नोट जोड़ें" : "Add a note"}</p>
        <p className="tiny muted" style={{ margin: "4px 0 8px" }}>{lang === "hi" ? "उदा. ‘Seller ने मंगलवार को कहा refund होगा’ — सत्यापित सबूत नहीं।" : "E.g., “Seller called Tuesday and said refund would be processed.” — not verified evidence."}</p>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={lang === "hi" ? "नोट लिखें…" : "Write a note…"} style={{ flex: 1, padding: "8px 10px" }} />
          <button className="btn btn--primary btn--sm" onClick={handleAddNote} disabled={!note.trim()}>
            {lang === "hi" ? "जोड़ें" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
