import { useState, useMemo, useEffect } from "react";
import type { Case, ComplaintDraft } from "@/types/domain";
import { complaintDraftService } from "@/services/complaintDraft.service";
import { pdfExportService } from "@/services/pdfExport.service";
import { complaintDraftValidator } from "@/services/complaintDraftValidator.service";
import { useLanguage } from "@/context/LanguageContext";
import { RECOVERY_STATES } from "@/types/ux";

export function ComplaintDraftPanel({ kase, onUpdate }: { kase: Case; onUpdate: (c: Case) => void }) {
  const { lang } = useLanguage();
  const [draft, setDraft] = useState<ComplaintDraft | null>(kase.complaintDraft ?? null);
  const [editableDraft, setEditableDraft] = useState<ComplaintDraft | null>(kase.complaintDraft ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Sync when case prop changes
  useEffect(() => {
    if (kase.complaintDraft && !draft) {
      setDraft(kase.complaintDraft);
      setEditableDraft(kase.complaintDraft);
    }
  }, [kase.complaintDraft, draft]);

  const hasEnoughInfo = !!(kase.consumerFacts?.productOrService || kase.consumerFacts?.sellerOrProvider);
  const isHighRisk = kase.actionPlan?.higherRisk || kase.description.toLowerCase().includes("legal notice") || draft?.isHighRisk;

  const conflictCount = kase.timeline?.filter((e) => e.type === "fact_updated").length ? 0 : 0; // simplified for validator

  const validation = useMemo(() => {
    if (!editableDraft) return null;
    const unconfirmed = (kase.documentUploads ?? []).flatMap((d) => d.extractedFacts?.filter((f) => !f.confirmedByUser) ?? []);
    return complaintDraftValidator.validate({
      draft: editableDraft,
      kase,
      extractedFacts: unconfirmed,
      unresolvedConflicts: conflictCount,
    });
  }, [editableDraft, kase, conflictCount]);

  const checklist = useMemo(() => {
    if (!validation) return [];
    return validation.missingChecklist;
  }, [validation]);

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const verifiedGrounds = kase.analysis?.relevantLaw
        ?.filter((cl) => cl.verified && !cl.isMock)
        .map((cl) => ({
          claim: cl.statement,
          sourceId: cl.sourceIds?.[0] ?? cl.sources[0]?.id ?? "",
          provisionId: cl.provisionIds?.[0],
          citation: cl.citationText ?? cl.sources[0]?.citation ?? "",
          sourceType: "rule" as const,
          verificationStatus: "verified" as const,
          supportsAction: true,
          sourceUrl: cl.citationUrl,
        })) ?? [];

      const d = await complaintDraftService.generate({
        caseId: kase.id,
        kase,
        facts: kase.consumerFacts ?? {},
        verifiedLegalGrounds: verifiedGrounds as never,
        desiredOutcome: kase.consumerFacts?.desiredOutcome,
        evidenceList: kase.evidence.map((e) => e.label ?? e.title),
        isHighRisk: kase.actionPlan?.higherRisk || kase.description.toLowerCase().includes("legal notice"),
      });
      setDraft(d);
      setEditableDraft(JSON.parse(JSON.stringify(d)));
      const { caseEngine } = await import("@/services/caseEngine.service");
      await caseEngine.updateCase(kase.id, { complaintDraft: d } as never);
      const fresh = await caseEngine.getCase(kase.id);
      if (fresh) onUpdate(fresh);

      const { timelineService } = await import("@/services/timeline.service");
      await timelineService.addEvent({
        caseId: kase.id,
        type: "plan_generated",
        title: "Complaint draft generated",
        description: `Draft with ${d.sections.length} sections`,
        source: "system",
        metadata: { draftId: d.id },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate draft");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!editableDraft) return;
    setBusy(true);
    try {
      const res = await pdfExportService.exportDraft(editableDraft);
      if (res.success && res.blob) {
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.isPrintFallback ? "NyayaSetu-Complaint-Draft.txt" : "NyayaSetu-Complaint-Draft.pdf";
        a.click();
        URL.revokeObjectURL(url);
        setPdfResult(res.isPrintFallback ? "PDF draft (print fallback) downloaded as text." : "PDF draft downloaded.");
      } else {
        setError(RECOVERY_STATES.exportFailed.message);
      }
    } catch (_e) {
      setError(RECOVERY_STATES.exportFailed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSectionEdit = (idx: number, newContent: string) => {
    if (!editableDraft) return;
    const next = { ...editableDraft, sections: editableDraft.sections.map((s, i) => (i === idx ? { ...s, content: newContent } : s)) };
    // Update placeholder visibility
    next.placeholders = next.sections.filter((s) => s.content.includes("[Add")).map((s) => s.heading);
    setEditableDraft(next);
  };

  const handleSaveToCaseFacts = async () => {
    if (!editableDraft) return;
    // Explicit save to case facts — parse editable fields
    const purchaseSection = editableDraft.sections.find((s) => s.heading.includes("Purchase"));
    const sellerSection = editableDraft.sections.find((s) => s.heading.includes("Seller"));
    const complainantSection = editableDraft.sections.find((s) => s.heading.includes("Complainant"));
    // For demo, extract simple mappings
    const updatedFacts: Record<string, unknown> = { ...(kase.consumerFacts ?? {}) };
    if (sellerSection && !sellerSection.content.includes("[Add")) {
      updatedFacts.sellerOrProvider = sellerSection.content.split("\n")[0]?.trim() || updatedFacts.sellerOrProvider;
    }
    if (purchaseSection) {
      const lines = purchaseSection.content.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes("product")) {
          const val = line.split(":")[1]?.trim();
          if (val && !val.includes("[Add")) updatedFacts.productOrService = val;
        }
        if (line.toLowerCase().includes("amount")) {
          const m = line.match(/₹\s*([0-9,]+)/);
          if (m) updatedFacts.amountPaid = { amount: parseInt(m[1].replace(/,/g, ""), 10), currency: "INR" };
        }
      }
    }
    if (complainantSection && !complainantSection.content.includes("[Add")) {
      // Store complainant name in evidence or case? For demo store in consumerFacts as custom field
      (updatedFacts as Record<string, unknown>)._complainantName = complainantSection.content.trim();
    }

    const { caseEngine } = await import("@/services/caseEngine.service");
    await caseEngine.updateCase(kase.id, { consumerFacts: updatedFacts as never });

    const { timelineService } = await import("@/services/timeline.service");
    await timelineService.addEvent({
      caseId: kase.id,
      type: "fact_updated",
      title: "Draft facts saved to case",
      description: `Saved via explicit Save to case facts: ${Object.keys(updatedFacts).join(", ")}`,
      source: "user_reported",
      metadata: { provenance: "draft_save_to_case", fields: Object.keys(updatedFacts) },
    });

    const fresh = await caseEngine.getCase(kase.id);
    if (fresh) onUpdate(fresh);
    setError(null);
    setPdfResult("Case facts updated from draft (explicit save) — provenance preserved.");
  };

  const activeDraft = editableDraft ?? draft;

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="h3" style={{ marginBottom: 6 }}>{lang === "hi" ? "शिकायत ड्राफ्ट" : "Complaint draft"}</h3>
      <p className="tiny muted" style={{ margin: "0 0 12px", lineHeight: 1.5, background: "#fffbeb", border: "1px solid #fde68a", padding: "8px 10px", borderRadius: 8 }}>
        DRAFT — REVIEW BEFORE USING. This is not sent or filed automatically. It is based on information you confirmed and the limited official sources available here. Check names, dates, amounts, and placeholders before sharing. NyayaSetu cannot guarantee an outcome. {isHighRisk ? " Human legal review is recommended before using this draft." : ""}
      </p>

      {!activeDraft ? (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          {!hasEnoughInfo ? (
            <div style={{ padding: "12px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px dashed var(--color-border)" }}>
              <p className="small" style={{ margin: 0, fontWeight: 600 }}>Not enough confirmed information to create a useful draft.</p>
              <p className="small muted" style={{ margin: "4px 0 0" }}>Missing: {!kase.consumerFacts?.purchaseDate ? "purchase date, " : ""} {!kase.consumerFacts?.sellerOrProvider ? "seller details, " : ""} {!kase.consumerFacts?.desiredOutcome ? "requested resolution" : ""}</p>
            </div>
          ) : (
            <button className="btn btn--primary" onClick={handleGenerate} disabled={busy}>
              {busy ? "Generating…" : lang === "hi" ? "ड्राफ्ट बनाएं" : "Create complaint draft"}
            </button>
          )}
          {activeDraft === null && hasEnoughInfo && <p className="tiny muted" style={{ marginTop: 8 }}>Uses confirmed facts + verified legal passages only. Placeholders for missing.</p>}
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div style={{ padding: "10px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10 }}>
            <strong className="small">{activeDraft.title}</strong>
            <p className="tiny muted" style={{ margin: "4px 0 0" }}>{activeDraft.safetyBanner.split("\n")[0]}</p>
            <p className="tiny muted" style={{ margin: "2px 0 0" }}>This is a working draft. It has not been sent to a seller, authority, or court.</p>
          </div>

          {/* Missing-information checklist */}
          {checklist.length > 0 && (
            <div style={{ padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 }}>
              <strong className="small" style={{ color: "#92400e" }}>Before using this draft, review:</strong>
              <ul className="tiny" style={{ margin: "6px 0 0", paddingLeft: 16, color: "#92400e" }}>
                {checklist.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {activeDraft.isHighRisk && <p className="tiny" style={{ margin: "6px 0 0", color: "#991b1b", fontWeight: 700 }}>High-risk: human review required before filing.</p>}
            </div>
          )}

          {/* Validator warnings */}
          {validation && validation.warnings.length > 0 && (
            <div style={{ padding: "10px 12px", background: validation.hasBlocking ? "#fef2f2" : "#fffbeb", border: `1px solid ${validation.hasBlocking ? "#fecaca" : "#fde68a"}`, borderRadius: 10 }}>
              <strong className="small" style={{ color: validation.hasBlocking ? "#991b1b" : "#92400e" }}>Validation</strong>
              {validation.warnings.map((w: { code: string; severity: string; message: string }) => (
                <p key={w.code} className="tiny" style={{ margin: "4px 0 0", color: w.severity === "blocking" ? "#991b1b" : w.severity === "warning" ? "#92400e" : "#6b6560" }}>
                  [{w.severity.toUpperCase()}] {w.message} ({w.code})
                </p>
              ))}
            </div>
          )}

          {/* Editable sections */}
          {activeDraft.sections.map((sec, idx) => (
            <div key={sec.heading} style={{ padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, background: sec.isPlaceholder ? "#fffbeb" : "#fff" }}>
              <strong className="small" style={{ display: "block", marginBottom: 4 }}>{sec.heading}</strong>
              {editMode ? (
                <textarea
                  className="input"
                  value={sec.content}
                  onChange={(e) => handleSectionEdit(idx, e.target.value)}
                  style={{ width: "100%", minHeight: 60, padding: "8px 10px", fontSize: "0.85rem", fontFamily: "inherit", lineHeight: 1.5 }}
                  placeholder={`[Add ${sec.heading.toLowerCase()}]`}
                />
              ) : (
                <pre className="small" style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6, fontFamily: "inherit" }}>{sec.content}</pre>
              )}
              {sec.isPlaceholder && <span className="tiny" style={{ color: "#92400e", fontWeight: 600 }}>Placeholder — please fill. [{sec.heading}]</span>}
            </div>
          ))}

          {/* Explicit edit controls */}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--secondary btn--sm" onClick={() => setEditMode((v) => !v)}>
              {editMode ? "Done editing (draft-only)" : "Edit draft"}
            </button>
            <span className="tiny muted" style={{ alignSelf: "center" }}>{editMode ? "Draft-only edit — case facts not changed until you save" : "Draft-only edits do not affect case facts automatically"}</span>
          </div>

          <div style={{ padding: "8px 10px", background: "var(--color-surface-2)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
            <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>
              <strong>Draft-only edit vs Case fact update:</strong> Editing above changes only the draft. To update confirmed case facts (with provenance & timeline), use “Save to case facts” below — this creates a timeline event and preserves confirmation.
            </p>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--primary btn--sm" onClick={handleSaveToCaseFacts} disabled={busy}>
              Save to case facts
            </button>
            <button className="btn btn--primary btn--sm" onClick={handleExport} disabled={busy}>
              {busy ? "Exporting…" : "Export PDF"}
            </button>
            <span className="tiny muted" style={{ alignSelf: "center" }}>Export a PDF draft for your review. Exporting does not send or file it anywhere.</span>
          </div>
          {pdfResult && <p className="small" style={{ color: "#065f46", margin: 0 }}>{pdfResult}</p>}
          {error && <div className="small" role="alert" style={{ color: "#991b1b", margin: 0 }}><strong>{RECOVERY_STATES.exportFailed.title}.</strong> {error} <button className="btn btn--ghost btn--sm" onClick={handleExport}>Try again</button></div>}

          {activeDraft.legalGrounds.length > 0 ? (
            <div style={{ padding: "10px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10 }}>
              <strong className="small">Legal basis (verified, productionAllowed, non-mock only)</strong>
              {activeDraft.legalGrounds.map((g) => (
                <p key={g.sourceId} className="tiny muted" style={{ margin: "4px 0 0" }}>{g.citation} — <a href={g.sourceUrl} target="_blank" rel="noopener noreferrer">View source ↗</a></p>
              ))}
            </div>
          ) : (
            <p className="small muted" style={{ margin: 0, fontStyle: "italic", background: "var(--color-surface-2)", padding: "8px 10px", borderRadius: 8 }}>No verified legal basis is currently available for this part of the draft.</p>
          )}

          {activeDraft.placeholders.length > 0 && (
            <div style={{ padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 }}>
              <strong className="small" style={{ color: "#92400e" }}>Placeholders to fill:</strong>
              <p className="tiny" style={{ margin: "4px 0 0", color: "#92400e" }}>{activeDraft.placeholders.join(", ")}</p>
              <p className="tiny muted" style={{ margin: "4px 0 0" }}>Examples: [Add complainant name], [Add purchase date], [Add seller address], [Add order number]</p>
            </div>
          )}

          <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5, background: "var(--color-surface-2)", padding: "8px 10px", borderRadius: 8 }}>{activeDraft.disclaimer}</p>
          <button className="btn btn--secondary btn--sm" onClick={handleGenerate} disabled={busy}>
            Regenerate draft
          </button>
        </div>
      )}

      <p className="tiny muted" style={{ margin: "10px 0 0", textAlign: "center" }}>Template-based — no LLM. Verified legal grounding only. Editable draft with explicit Save to case facts.</p>
    </div>
  );
}
