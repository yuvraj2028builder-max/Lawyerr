import { useState } from "react";
import type { Case, EvidenceType, EvidenceSource } from "@/types/domain";
import { evidenceService } from "@/services/evidence.service";
import { useLanguage } from "@/context/LanguageContext";

const TYPE_LABEL: Record<EvidenceType, string> = {
  invoice_receipt: "Invoice / receipt",
  order_details: "Order details",
  payment_record: "Payment record",
  product_photo: "Product photo",
  video: "Video",
  seller_chat: "Seller chat",
  email: "Email",
  warranty: "Warranty",
  complaint: "Complaint",
  seller_response: "Seller response",
  other: "Other",
};

const TYPE_OPTIONS: EvidenceType[] = ["invoice_receipt", "order_details", "payment_record", "product_photo", "seller_chat", "email", "warranty", "other"];

export function EvidenceLockerPanel({ kase, onUpdate }: { kase: Case; onUpdate: (c: Case) => void }) {
  const { lang } = useLanguage();
  const [selectedType, setSelectedType] = useState<EvidenceType>("invoice_receipt");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  // Per-item toggle guard: without it a rapid double-click flips
  // missing→available→missing and the user sees no change at all.
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<Record<string, string | undefined>>({});

  const refresh = async () => {
    // caseEngine is source of truth, but parent will refresh via onUpdate
    // For now, reload from caseEngine via evidenceService
    const { caseEngine } = await import("@/services/caseEngine.service");
    const fresh = await caseEngine.getCase(kase.id);
    if (fresh) onUpdate(fresh);
  };

  const handleAdd = async () => {
    setBusy(true);
    try {
      await evidenceService.addEvidence({
        caseId: kase.id,
        type: selectedType,
        label: label.trim() || TYPE_LABEL[selectedType],
        status: "available",
        source: "user_declared" as EvidenceSource,
        description: `User says they have ${TYPE_LABEL[selectedType]}`,
      });
      await refresh();
      setLabel("");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (id: string, current: string) => {
    if (toggling[id]) return;
    setToggling((p) => ({ ...p, [id]: true }));
    setToggleError((p) => ({ ...p, [id]: undefined }));
    try {
      const next = current === "available" ? "missing" : "available";
      await evidenceService.updateEvidence(kase.id, id, { status: next as never });
      await refresh();
    } catch (e) {
      setToggleError((p) => ({ ...p, [id]: e instanceof Error ? e.message : "Could not update. Try again." }));
      // Re-read anyway: the status write may have persisted before the failure.
      try { await refresh(); } catch { /* ignore */ }
    } finally {
      setToggling((p) => ({ ...p, [id]: false }));
    }
  };

  const handleRemove = async (id: string) => {
    await evidenceService.removeEvidence(kase.id, id);
    await refresh();
  };

  const haveCount = kase.evidence.filter((e) => e.status === "available" || e.status === "have").length;
  const total = kase.evidence.length;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h3 className="h3">{lang === "hi" ? "सबूत" : "Evidence"}</h3>
        <span className="tiny muted">{haveCount}/{total} available</span>
      </div>

      {kase.evidence.length === 0 ? (
        <div style={{ padding: "16px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px dashed var(--color-border)", textAlign: "center" }}>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>{lang === "hi" ? "कोई सबूत नहीं जोड़ा गया।" : "No evidence added yet."}</p>
          <p className="tiny muted" style={{ margin: "4px 0 0" }}>{lang === "hi" ? "आपके पास जो है, जोड़ें। यह आपकी बताई जानकारी है; इसे कानूनी रूप से सत्यापित नहीं कहा जाता।" : "Add what you have. This is information you provided; it has not been legally verified."}</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
          {kase.evidence.map((ev) => (
            <div key={ev.id} className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-border)", background: ev.status === "available" || ev.status === "have" ? "#ecfdf5" : ev.status === "missing" ? "#fef2f2" : "#fff" }}>
              <span
                aria-hidden
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  background: ev.status === "available" || ev.status === "have" ? "#065f46" : ev.status === "missing" ? "#991b1b" : "#9a9590",
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {ev.status === "available" || ev.status === "have" ? "✓" : ev.status === "missing" ? "•" : "?"}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="small" style={{ fontWeight: 600, display: "block", lineHeight: 1.3 }}>{ev.label ?? ev.title}</span>
                <span className="tiny muted" style={{ lineHeight: 1.4 }}>{TYPE_LABEL[ev.type ?? "other"]} • {ev.source === "uploaded" ? "Uploaded file" : "You said you have this"} • {ev.status === "available" ? "Available" : ev.status}</span>
                {ev.fileName && <span className="tiny muted" style={{ display: "block" }}>{ev.fileName} • {ev.mimeType ?? ""}</span>}
              </span>
              <button className="btn btn--ghost btn--sm" onClick={() => handleToggle(ev.id, ev.status)} disabled={!!toggling[ev.id]} style={{ fontSize: "0.75rem", padding: "4px 8px" }}>
                {toggling[ev.id] ? "Saving…" : ev.status === "available" || ev.status === "have" ? "Mark missing" : "Mark available"}
              </button>
              {toggleError[ev.id] && (
                <span className="tiny" role="alert" style={{ display: "block", color: "#991b1b", marginTop: 4 }}>{toggleError[ev.id]}</span>
              )}
              <button className="btn btn--ghost btn--sm" onClick={() => handleRemove(ev.id)} aria-label="Remove evidence" style={{ color: "#991b1b", fontSize: "0.75rem", padding: "4px 8px" }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 12, background: "var(--color-surface-2)" }}>
        <p className="small" style={{ margin: 0, fontWeight: 600 }}>{lang === "hi" ? "सबूत जोड़ें" : "Add evidence"}</p>
        <p className="tiny muted" style={{ margin: "4px 0 8px", lineHeight: 1.4 }}>{lang === "hi" ? "आपके पास जो है, बताएं — हम OCR का दावा नहीं करेंगे।" : "Tell us what you have — we won't claim we verified it."}</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select className="input" value={selectedType} onChange={(e) => setSelectedType(e.target.value as EvidenceType)} style={{ flex: "1 1 160px", padding: "8px 10px" }}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={lang === "hi" ? "वैकल्पिक लेबल" : "Optional label"} style={{ flex: "1 1 140px", padding: "8px 10px" }} />
          <button className="btn btn--primary btn--sm" onClick={handleAdd} disabled={busy}>
            {busy ? "Adding…" : lang === "hi" ? "जोड़ें" : "Add"}
          </button>
        </div>
        <p className="tiny muted" style={{ margin: "8px 0 0", lineHeight: 1.4 }}>
          This is your information — for example, “I have an invoice.” It is not labelled as legally verified evidence.
        </p>
      </div>
    </div>
  );
}
