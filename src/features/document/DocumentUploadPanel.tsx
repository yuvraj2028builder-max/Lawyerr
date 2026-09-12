import { useState, useRef } from "react";
import type { Case, EvidenceType } from "@/types/domain";
import { documentUploadService, ALLOWED_MIMES, MAX_FILE_SIZE_BYTES } from "@/services/documentUpload.service";
import { useLanguage } from "@/context/LanguageContext";
import { userFacingStorageStatus } from "@/types/ux";

const EVIDENCE_OPTIONS: Array<{ value: EvidenceType; label: string }> = [
  { value: "invoice_receipt", label: "Invoice / receipt" },
  { value: "order_details", label: "Order details" },
  { value: "payment_record", label: "Payment record" },
  { value: "product_photo", label: "Product photo" },
  { value: "seller_chat", label: "Seller chat" },
  { value: "email", label: "Email" },
  { value: "warranty", label: "Warranty" },
  { value: "complaint", label: "Complaint" },
  { value: "seller_response", label: "Seller response" },
  { value: "other", label: "Other" },
];

export function DocumentUploadPanel({ kase, onUpdate }: { kase: Case; onUpdate: (c: Case) => void }) {
  const { lang } = useLanguage();
  const [selectedType, setSelectedType] = useState<EvidenceType>("invoice_receipt");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      await documentUploadService.uploadDocument(kase.id, file, selectedType);
      const { caseEngine } = await import("@/services/caseEngine.service");
      const fresh = await caseEngine.getCase(kase.id);
      if (fresh) onUpdate(fresh);
      console.debug("[NyayaSetu] document_selected", { caseId: kase.id, type: selectedType });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="h3" style={{ marginBottom: 6 }}>{lang === "hi" ? "दस्तावेज़ अपलोड करें" : "Upload evidence"}</h3>
      <p className="small muted" style={{ margin: "0 0 12px", lineHeight: 1.5 }}>
        {lang === "hi" ? "इनवॉइस, भुगतान रिकॉर्ड या विक्रेता से बातचीत जोड़ें। PDF, PNG, JPG/JPEG, WEBP — अधिकतम 10 MB।" : "Add an invoice, payment record, or seller conversation. PDF, PNG, JPG/JPEG, WEBP — up to 10 MB."}
      </p>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select className="input" value={selectedType} onChange={(e) => setSelectedType(e.target.value as EvidenceType)} style={{ flex: "1 1 180px", padding: "8px 10px" }}>
          {EVIDENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="btn btn--primary btn--sm" style={{ cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : lang === "hi" ? "फ़ाइल चुनें" : "Choose file"}
          <input
            ref={inputRef}
            type="file"
            accept={Array.from(ALLOWED_MIMES).join(",") + ",.pdf,.png,.jpg,.jpeg,.webp"}
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </label>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 8 }}>
          <p className="small" style={{ margin: 0, color: "#991b1b" }}>{error}</p>
          {error.includes("Unsupported") && (
            <p className="tiny muted" style={{ margin: "4px 0 0" }}>This file type isn't supported yet. Use PDF, PNG, JPG/JPEG, or WEBP.</p>
          )}
        </div>
      )}

      <div style={{ padding: "10px 12px", background: "var(--color-surface-2)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
        <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>
          <strong>Where this file is saved:</strong> {kase.documentUploads?.[0]?.storageNote ?? " Saved in this browser, not in a private cloud account. Clearing browser data may remove it."}
        </p>
        <p className="tiny muted" style={{ margin: "4px 0 0" }}>Status: {userFacingStorageStatus(documentUploadService.getStorageTier())}. Private cloud storage is not available. Max size: {(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB.</p>
        <p className="tiny muted" style={{ margin: "4px 0 0" }}>If text cannot be read, you can still keep the file and enter details manually. Uploading a file does not mean it has been legally verified.</p>
      </div>

      {(kase.documentUploads?.length ?? 0) > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 12 }}>
          <strong className="small">Uploaded documents</strong>
          {(kase.documentUploads ?? []).map((doc) => (
            <div key={doc.id} className="row" style={{ gap: 8, padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, background: "#fff", flexWrap: "wrap" }}>
              <span className="small" style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{doc.fileName}</span>
              <span className="tiny muted">{doc.mimeType} • {(doc.sizeBytes / 1024).toFixed(1)} KB</span>
              <span className="tiny" style={{ padding: "2px 6px", borderRadius: 999, background: doc.processingStatus === "processed" ? "#ecfdf5" : doc.processingStatus === "failed" ? "#fef2f2" : "#fffbeb", border: "1px solid var(--color-border)" }}>{doc.processingStatus}</span>
              <span className="tiny" style={{ padding: "2px 6px", borderRadius: 999, background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>{userFacingStorageStatus(doc.storageTier ?? "memory_only")}</span>
            </div>
          ))}
        </div>
      )}

      {(!kase.documentUploads || kase.documentUploads.length === 0) && (
        <div style={{ padding: "12px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px dashed var(--color-border)", marginTop: 12, textAlign: "center" }}>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>No files added yet.</p>
          <p className="tiny muted" style={{ margin: "4px 0 0" }}>Add an invoice, payment record, seller chat, or other proof when you have it. You can continue without a file.</p>
        </div>
      )}
    </div>
  );
}
