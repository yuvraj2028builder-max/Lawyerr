import { useState } from "react";
import type { Case, DocumentUpload, DocumentExtractedFact } from "@/types/domain";
import { documentProcessingService } from "@/services/document/documentProcessing.service";
import { documentFactMergeService } from "@/services/documentFactMerge.service";
import { userFacingStorageStatus, RECOVERY_STATES } from "@/types/ux";
import { evidenceService } from "@/services/evidence.service";
import { caseEngine } from "@/services/caseEngine.service";

type FactEditState = Record<string, string>;

export function DocumentReviewPanel({ kase, onUpdate }: { kase: Case; onUpdate: (c: Case) => void }) {
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { status: string; facts: DocumentExtractedFact[]; error?: string; classification?: { type: string; confidence: string; reason: string } }>>({});
  const [editing, setEditing] = useState<FactEditState>({});
  const [selected, setSelected] = useState<Record<string, Set<string>>>({}); // docId -> set of field keys
  const [conflicts, setConflicts] = useState<Record<string, Array<{ field: string; existingValue: unknown; extractedValue: unknown }>>>({});
  const [retryBusy, setRetryBusy] = useState<Record<string, boolean>>({});
  const [conflictModal, setConflictModal] = useState<{
    doc: DocumentUpload;
    confirmed: DocumentExtractedFact[];
    conflicts: Array<{ field: string; existingValue: unknown; extractedValue: unknown }>;
    res: NonNullable<typeof results[string]>;
  } | null>(null);

  const uploads = kase.documentUploads ?? [];

  const handleProcess = async (doc: DocumentUpload) => {
    setProcessing((p) => ({ ...p, [doc.id]: true }));
    try {
      const res = await documentProcessingService.processDocument({ caseId: kase.id, documentId: doc.id });
      setResults((prev) => ({
        ...prev,
        [doc.id]: { status: res.status, facts: res.facts, error: res.error, classification: res.classification as never },
      }));
      // Also detect conflicts for UI
      if (res.facts.length > 0) {
        const { conflicts: c } = await documentFactMergeService.proposeMerge(kase.id, res.facts);
        if (c.length > 0) {
          setConflicts((prev) => ({ ...prev, [doc.id]: c.map((x) => ({ field: x.field, existingValue: x.existingValue, extractedValue: x.extractedValue })) }));
        }
      }
      const fresh = await caseEngine.getCase(kase.id);
      if (fresh) onUpdate(fresh);
    } catch (e) {
      setResults((prev) => ({ ...prev, [doc.id]: { status: "failed", facts: [], error: e instanceof Error ? e.message : "Processing failed" } }));
    } finally {
      setProcessing((p) => ({ ...p, [doc.id]: false }));
    }
  };

  const handleRetry = async (doc: DocumentUpload) => {
    setRetryBusy((p) => ({ ...p, [doc.id]: true }));
    try {
      const res = await documentProcessingService.retryProcessing({ caseId: kase.id, documentId: doc.id });
      setResults((prev) => ({
        ...prev,
        [doc.id]: { status: res.status, facts: res.facts, error: res.error, classification: res.classification as never },
      }));
      const fresh = await caseEngine.getCase(kase.id);
      if (fresh) onUpdate(fresh);
    } catch (e) {
      setResults((prev) => ({ ...prev, [doc.id]: { status: "failed", facts: [], error: e instanceof Error ? e.message : "Retry failed" } }));
    } finally {
      setRetryBusy((p) => ({ ...p, [doc.id]: false }));
    }
  };

  const handleKeepAsEvidence = async (doc: DocumentUpload) => {
    // User keeps document as evidence without confirmation — still saves to Evidence Locker
    const res = results[doc.id];
    const type = (res?.classification?.type as never) ?? "other";
    await evidenceService.addEvidence({
      caseId: kase.id,
      type,
      label: doc.fileName,
      status: "available",
      source: "uploaded",
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      description: `File saved as evidence without reading — ${doc.processingStatus}`,
    });
    const fresh = await caseEngine.getCase(kase.id);
    if (fresh) onUpdate(fresh);
  };

  const handleConfirm = async (doc: DocumentUpload, onlySelected: boolean) => {
    const res = results[doc.id];
    if (!res || res.facts.length === 0) return;
    let factsToConfirm = res.facts;
    if (onlySelected) {
      const sel = selected[doc.id];
      if (!sel || sel.size === 0) return;
      factsToConfirm = res.facts.filter((f) => sel.has(f.field));
    }
    // Apply edits
    factsToConfirm = factsToConfirm.map((f) => {
      const editKey = `${doc.id}:${f.field}`;
      if (editing[editKey] !== undefined && editing[editKey] !== String(f.value)) {
        return { ...f, value: isNaN(Number(editing[editKey])) ? editing[editKey] : Number(editing[editKey]), rawText: `${f.rawText} (edited to ${editing[editKey]})` };
      }
      return f;
    });
    // Mark facts as confirmed with provenance
    const confirmed = factsToConfirm.map((f) => ({ ...f, confirmedByUser: true, confirmedAt: new Date().toISOString(), confirmationSource: "document_review" as const }));
    // Conflict handling — require user choice
    const { conflicts: found } = await documentFactMergeService.proposeMerge(kase.id, confirmed);
    if (found.length > 0) {
      setConflictModal({ doc, confirmed, conflicts: found, res });
      return;
    }
    await finalizeConfirmation(doc, confirmed, res);
  };

  const finalizeConfirmation = async (
    doc: DocumentUpload,
    confirmed: DocumentExtractedFact[],
    res: NonNullable<typeof results[string]>
  ) => {
    await documentFactMergeService.applyConfirmedFacts(kase.id, confirmed);

    // Deduplication: evidenceService handles duplicate-safe (same type+label)
    await evidenceService.addEvidence({
      caseId: kase.id,
      type: (res.classification?.type as never) ?? "other",
      label: doc.fileName,
      status: "available",
      source: "uploaded",
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      description: `Extracted from document: ${confirmed.map((f) => `${f.field}=${String(f.value)}`).join(", ")}`,
    });

    const { documentUploadService } = await import("@/services/documentUpload.service");
    // Update document's extractedFacts to reflect confirmed status and edits
    const updatedFacts = res.facts.map((f) => {
      const isConfirmed = confirmed.some((c) => c.field === f.field);
      return isConfirmed ? { ...f, confirmedByUser: true, confirmedAt: new Date().toISOString(), confirmationSource: "document_review" as const } : f;
    });
    await documentUploadService.updateUpload(kase.id, doc.id, { processingStatus: "processed", extractedFacts: updatedFacts });

    const { timelineService } = await import("@/services/timeline.service");
    await timelineService.addEvent({
      caseId: kase.id,
      type: "document_confirmed",
      title: `Document details confirmed: ${doc.fileName}`,
      source: "user_reported",
      metadata: { documentId: doc.id, facts: confirmed.length },
    });

    const fresh = await caseEngine.getCase(kase.id);
    if (fresh) onUpdate(fresh);
    setConflictModal(null);
  };

  const handleEditChange = (docId: string, field: string, value: string) => {
    setEditing((prev) => ({ ...prev, [`${docId}:${field}`]: value }));
  };

  const handleRemoveFact = (docId: string, field: string) => {
    setResults((prev) => {
      const r = prev[docId];
      if (!r) return prev;
      return { ...prev, [docId]: { ...r, facts: r.facts.filter((f) => f.field !== field) } };
    });
    // Also update documentUploads
    (async () => {
      const { documentUploadService } = await import("@/services/documentUpload.service");
      const doc = await documentUploadService.getUpload(kase.id, docId);
      if (doc) {
        await documentUploadService.updateUpload(kase.id, docId, { extractedFacts: doc.extractedFacts?.filter((f) => f.field !== field) });
        const fresh = await caseEngine.getCase(kase.id);
        if (fresh) onUpdate(fresh);
      }
    })();
  };

  const handleToggleSelect = (docId: string, field: string) => {
    setSelected((prev) => {
      const set = new Set(prev[docId] ?? []);
      if (set.has(field)) set.delete(field);
      else set.add(field);
      return { ...prev, [docId]: set };
    });
  };

  const handleRemoveDocument = async (doc: DocumentUpload) => {
    const { documentUploadService } = await import("@/services/documentUpload.service");
    await documentUploadService.removeUpload(kase.id, doc.id);
    // Do not silently delete confirmed facts — keep them
    setResults((prev) => {
      const next = { ...prev };
      delete next[doc.id];
      return next;
    });
    const fresh = await caseEngine.getCase(kase.id);
    if (fresh) onUpdate(fresh);
  };

  if (uploads.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      {conflictModal && (
        <div className="card" style={{ padding: 16, background: "#fffbeb", borderColor: "#fde68a" }}>
          <h4 className="h3" style={{ margin: 0, color: "#92400e" }}>Conflict Detected — Review Your Choice</h4>
          <p className="small muted" style={{ margin: "4px 0 10px", lineHeight: 1.5 }}>
            The values extracted from <strong>{conflictModal.doc.fileName}</strong> conflict with existing facts in your case. Please choose how you would like to proceed:
          </p>
          <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
            {conflictModal.conflicts.map((c) => (
              <div key={c.field} className="small" style={{ padding: "6px 8px", background: "#fff", borderRadius: 6, border: "1px solid #fde68a" }}>
                <strong>{c.field}:</strong> Current case value is <code>{String(c.existingValue)}</code> vs document value <code>{String(c.extractedValue)}</code>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => finalizeConfirmation(conflictModal.doc, conflictModal.confirmed, conflictModal.res)}
            >
              Use document values (Overwrite)
            </button>
            <button
              className="btn btn--secondary btn--sm"
              onClick={async () => {
                const conflictFields = new Set(conflictModal.conflicts.map((c) => c.field));
                const nonConflicting = conflictModal.confirmed.filter((f) => !conflictFields.has(f.field));
                await finalizeConfirmation(conflictModal.doc, nonConflicting, conflictModal.res);
              }}
            >
              Keep existing values
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setConflictModal(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploads.map((doc) => {
        const res = results[doc.id];
        const isProcessing = processing[doc.id] || retryBusy[doc.id];
        const tierLabel = doc.storageTier ?? (doc.storageNote?.includes("IndexedDB") ? "browser_local" : "memory_only");
        return (
          <div key={doc.id} className="card" style={{ padding: 14 }}>
            {/* FILE */}
            <div style={{ marginBottom: 8, padding: "8px 10px", background: "var(--color-surface-2)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
              <strong className="tiny" style={{ display: "block", letterSpacing: "0.06em" }}>FILE</strong>
              <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <span className="small" style={{ fontWeight: 600, flex: 1 }}>{doc.fileName}</span>
                <span className="tiny muted">{doc.mimeType} • {(doc.sizeBytes / 1024).toFixed(1)} KB</span>
              </div>
              <p className="tiny muted" style={{ margin: "4px 0 0" }}>Uploaded file • {userFacingStorageStatus(tierLabel)}. This is not private cloud storage or legally verified evidence.</p>
              {doc.file ? <p className="tiny muted" style={{ margin: "2px 0 0" }}>File bytes present in this session</p> : <p className="tiny" style={{ margin: "2px 0 0", color: "#991b1b" }}>No file data available after refresh — metadata retained, file bytes lost. Re-upload if you need to read again.</p>}
            </div>

            {/* READING STATUS */}
            <div style={{ marginBottom: 8, padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, background: doc.processingStatus === "failed" ? "#fef2f2" : doc.processingStatus === "processed" ? "#ecfdf5" : "#fffbeb" }}>
              <strong className="tiny" style={{ display: "block", letterSpacing: "0.06em" }}>READING STATUS</strong>
              <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <span className="tiny" style={{ padding: "2px 6px", borderRadius: 999, background: "#fff", border: "1px solid var(--color-border)", fontWeight: 700 }}>{doc.processingStatus === "processed" ? "Read" : doc.processingStatus === "failed" ? "Could not read" : doc.processingStatus === "needs_review" ? "Needs review" : doc.processingStatus === "processing" ? "Reading" : "Saved"}</span>
                <span className="tiny muted">{doc.processingStatus === "processed" ? "document successfully read" : doc.processingStatus === "failed" ? "reading failed" : doc.processingStatus === "needs_review" ? "needs review" : doc.processingStatus === "processing" ? "processing" : "file saved"}</span>
                {doc.pageCount && <span className="tiny muted">• {doc.pageCount} pages</span>}
              </div>
              {res?.error && doc.processingStatus === "failed" && <p className="tiny" style={{ margin: "6px 0 0", color: "#991b1b" }}>{RECOVERY_STATES.unreadableDocument.message}</p>}
            </div>

            {/* DOCUMENT TYPE */}
            {res?.classification && (
              <div style={{ marginBottom: 8, padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, background: "#fff" }}>
                <strong className="tiny" style={{ display: "block", letterSpacing: "0.06em" }}>DOCUMENT TYPE</strong>
                <p className="small" style={{ margin: "4px 0 0" }}>{res.classification.type} • Confidence: {res.classification.confidence}</p>
                <p className="tiny muted" style={{ margin: "2px 0 0" }}>Why: {res.classification.reason}</p>
              </div>
            )}

            {!res && !isProcessing && (
              <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn btn--primary btn--sm" onClick={() => handleProcess(doc)} disabled={isProcessing}>
                  {isProcessing ? "Processing…" : "Read document"}
                </button>
                <button className="btn btn--secondary btn--sm" onClick={() => handleKeepAsEvidence(doc)}>Keep as evidence</button>
                <button className="btn btn--ghost btn--sm" style={{ color: "#991b1b" }} onClick={() => handleRemoveDocument(doc)}>Remove document</button>
              </div>
            )}

            {isProcessing && (
              <div style={{ padding: "10px", background: "var(--color-surface-2)", borderRadius: 8, marginTop: 8 }}>
                <p className="small muted" style={{ margin: 0 }}>Reading document… We are extracting information. Nothing becomes a confirmed case fact until you review it.</p>
              </div>
            )}

            {res && res.status === "failed" && (
              <div style={{ padding: "10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginTop: 8 }}>
                <p className="small" style={{ margin: 0, color: "#991b1b" }}>Reading failed</p>
                <p className="tiny muted" style={{ margin: "4px 0 0" }}>{RECOVERY_STATES.unreadableDocument.message}</p>
                <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button className="btn btn--primary btn--sm" onClick={() => handleRetry(doc)}>Retry reading</button>
                  <button className="btn btn--secondary btn--sm" onClick={() => handleKeepAsEvidence(doc)}>Keep as evidence</button>
                  <button className="btn btn--ghost btn--sm" style={{ color: "#991b1b" }} onClick={() => handleRemoveDocument(doc)}>Remove document</button>
                </div>
                <p className="tiny muted" style={{ margin: "6px 0 0" }}>File remains evidence even though reading failed — distinction: file saved vs document successfully read vs facts confirmed by you.</p>
              </div>
            )}

            {res && res.status !== "failed" && (
              <div style={{ marginTop: 8 }}>
                <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <span className="tiny" style={{ fontWeight: 700 }}>DOCUMENT READ</span>
                  <span className="tiny" style={{ padding: "2px 6px", borderRadius: 999, background: res.classification?.confidence === "high" ? "#ecfdf5" : "#fffbeb", border: "1px solid var(--color-border)" }}>
                    {res.classification?.type ?? "other"} • Confidence: {res.classification?.confidence ?? "low"}
                  </span>
                </div>
                {res.classification && <p className="tiny muted" style={{ margin: "0 0 8px" }}>Why: {res.classification.reason}</p>}

                {/* EXTRACTED FACTS */}
                <div style={{ padding: "8px 10px", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, marginBottom: 8 }}>
                  <strong className="tiny" style={{ display: "block", letterSpacing: "0.06em" }}>EXTRACTED FACTS</strong>
                  {res.facts.length === 0 ? (
                    <p className="small muted" style={{ margin: "6px 0 0" }}>We couldn't reliably extract the details. The document can still be saved as evidence.</p>
                  ) : (
                    <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                      {res.facts.map((f) => {
                        const editKey = `${doc.id}:${f.field}`;
                        const isEditing = editing[editKey] !== undefined;
                        const isConfirmed = !!f.confirmedByUser || (doc.extractedFacts?.find((x) => x.field === f.field)?.confirmedByUser ?? false);
                        const selSet = selected[doc.id];
                        const isSelected = selSet?.has(f.field) ?? false;
                        return (
                          <div key={f.field + f.rawText} style={{ padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, background: isConfirmed ? "#ecfdf5" : "#fff", display: "flex", flexDirection: "column", gap: 6 }}>
                            <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                              <input type="checkbox" checked={isSelected} onChange={() => handleToggleSelect(doc.id, f.field)} aria-label={`Select ${f.field}`} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span className="tiny" style={{ display: "block", color: "#6b6560", letterSpacing: "0.04em" }}>Field: {f.field}</span>
                                {isEditing ? (
                                  <input className="input" value={editing[editKey]} onChange={(e) => handleEditChange(doc.id, f.field, e.target.value)} style={{ padding: "4px 8px", fontSize: "0.85rem", width: "100%", marginTop: 2 }} />
                                ) : (
                                  <span className="small" style={{ fontWeight: 600, display: "block", wordBreak: "break-word" }}>Value: {isEditing ? editing[editKey] : String(f.value)}</span>
                                )}
                                <span className="tiny muted" style={{ display: "block", marginTop: 2 }}>Source: {f.source === "document_text" ? "Document text" : f.source === "ocr_text" ? "OCR text" : f.source} • Confidence: {f.confidence} • “{f.rawText.slice(0, 30)}…”</span>
                                <span className="tiny" style={{ display: "block", marginTop: 2, fontWeight: 600, color: isConfirmed ? "#065f46" : "#92400e" }}>Status: {isConfirmed ? "Confirmed by you" : "Needs your confirmation"}</span>
                              </div>
                              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                                {!isEditing ? (
                                  <button className="btn btn--ghost btn--sm" style={{ fontSize: "0.7rem", padding: "2px 6px" }} onClick={() => handleEditChange(doc.id, f.field, String(f.value))}>Edit</button>
                                ) : (
                                  <button className="btn btn--ghost btn--sm" style={{ fontSize: "0.7rem", padding: "2px 6px" }} onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[editKey]; return n; })}>Done</button>
                                )}
                                <button className="btn btn--ghost btn--sm" style={{ fontSize: "0.7rem", padding: "2px 6px", color: "#991b1b" }} onClick={() => handleRemoveFact(doc.id, f.field)}>Remove</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SOURCE AND CONFIDENCE */}
                <div style={{ padding: "8px 10px", background: "var(--color-surface-2)", borderRadius: 8, border: "1px solid var(--color-border)", marginBottom: 8 }}>
                  <strong className="tiny" style={{ display: "block", letterSpacing: "0.06em" }}>SOURCE AND CONFIDENCE</strong>
                  <p className="tiny muted" style={{ margin: "4px 0 0" }}>Each fact shows source (Document text / OCR text) and confidence (High/Medium/Low). Never “Verified by NyayaSetu” — only “Confirmed by you” after you confirm.</p>
                </div>

                {/* CONFLICTS */}
                {conflicts[doc.id]?.length ? (
                  <div style={{ padding: "8px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, marginBottom: 8 }}>
                    <strong className="tiny" style={{ display: "block", color: "#92400e", letterSpacing: "0.06em" }}>CONFLICTS</strong>
                    {conflicts[doc.id].map((c) => (
                      <p key={c.field} className="small" style={{ margin: "4px 0 0", color: "#92400e" }}>Conflict in {c.field}: existing {String(c.existingValue)} vs document {String(c.extractedValue)} — user choice required.</p>
                    ))}
                    <p className="tiny muted" style={{ margin: "4px 0 0" }}>Existing confirmed amount: ₹20,000 vs New document amount: ₹25,000 — user decision required. We do not automatically prefer newest/highest/OCR.</p>
                  </div>
                ) : null}

                {/* CONFIRMATION */}
                <div style={{ padding: "8px 10px", background: "var(--color-surface-2)", borderRadius: 8, border: "1px solid var(--color-border)", marginBottom: 8 }}>
                  <strong className="tiny" style={{ display: "block", letterSpacing: "0.06em" }}>CONFIRMATION</strong>
                  <p className="tiny muted" style={{ margin: "4px 0 0" }}>Facts are not case facts until you confirm. Edit, remove, or confirm selected/all. Leave uncertain facts unconfirmed. You can also keep document as evidence without confirmation.</p>
                </div>

                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn btn--primary btn--sm" onClick={() => handleConfirm(doc, false)} disabled={res.facts.length === 0}>
                    Confirm all safe facts
                  </button>
                  <button className="btn btn--secondary btn--sm" onClick={() => handleConfirm(doc, true)} disabled={!selected[doc.id] || selected[doc.id].size === 0}>
                    Confirm selected facts
                  </button>
                  <button className="btn btn--secondary btn--sm" onClick={() => handleKeepAsEvidence(doc)}>
                    Keep as evidence without confirmation
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => handleRetry(doc)}>Retry reading</button>
                  <button className="btn btn--ghost btn--sm" style={{ color: "#991b1b" }} onClick={() => handleRemoveDocument(doc)}>Remove document</button>
                </div>
                <p className="tiny muted" style={{ margin: "8px 0 0" }}>Extracted • Needs your confirmation • Not automatically a case fact until you confirm. After confirmation: “Confirmed by you”.</p>
              </div>
            )}

            {/* Viewer — extracted text */}
            {res?.facts && res.facts.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="small" style={{ cursor: "pointer" }}>View extracted text (SOURCE: {doc.mimeType === "application/pdf" ? "DOCUMENT" : res.facts[0]?.source === "ocr_text" ? "OCR" : "DOCUMENT"})</summary>
                <pre className="tiny muted" style={{ whiteSpace: "pre-wrap", background: "var(--color-surface-2)", padding: 8, borderRadius: 8, marginTop: 6, maxHeight: 120, overflow: "auto" }}>{res.facts.map((f) => f.rawText).join("\n")}</pre>
                <p className="tiny muted" style={{ margin: "4px 0 0" }}>Document viewer — extracted text shown separately from verified legal text.</p>
              </details>
            )}

            {/* Remove extracted text / clear processing state note */}
            <p className="tiny muted" style={{ margin: "8px 0 0", fontStyle: "italic" }}>Privacy: document bytes not in analytics/URLs. Remove document to clear temporary extracted text.</p>
          </div>
        );
      })}
    </div>
  );
}
