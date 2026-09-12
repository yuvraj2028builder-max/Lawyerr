/**
 * PDF Export — client-side, using jspdf if available, otherwise honest limitation.
 * Generated PDF contains exactly the reviewable draft, labeled PDF draft (never Official filing).
 * Improved: line wrapping, page breaks, headings, spacing, placeholder visibility, warning banner, disclaimer, evidence list, citations, draft metadata.
 */

import type { ComplaintDraft } from "@/types/domain";

export interface PdfExportResult {
  success: boolean;
  blob?: Blob;
  error?: string;
  isPrintFallback?: boolean;
}

export class PdfExportService {
  async exportDraft(draft: ComplaintDraft): Promise<PdfExportResult> {
    // Try jspdf
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const jspdfModule = await import("jspdf");
      const JsPDF = jspdfModule.jsPDF || jspdfModule.default;
      if (!JsPDF) throw new Error("jspdf not available");

      const doc = new JsPDF({ unit: "pt", format: "a4" });
      let y = 40;
      const margin = 40;
      const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
      const lineHeight = 14;
      const pageHeight = doc.internal.pageSize.getHeight();

      const addText = (text: string, opts?: { bold?: boolean; size?: number; color?: string; spacing?: number }) => {
        const size = opts?.size ?? 10;
        doc.setFontSize(size);
        doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
        if (opts?.color) {
          // hex to rgb
          const hex = opts.color.replace("#", "");
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          doc.setTextColor(r, g, b);
        } else {
          doc.setTextColor(0, 0, 0);
        }
        const lines = doc.splitTextToSize(text, pageWidth);
        for (const line of lines) {
          if (y > pageHeight - 40) {
            doc.addPage();
            y = 40;
          }
          doc.text(line, margin, y);
          y += lineHeight;
        }
        y += opts?.spacing ?? 6;
        doc.setTextColor(0, 0, 0);
      };

      // Warning banner — clearly draft
      addText("PDF DRAFT — NOT OFFICIAL FILING — NOT e-JAGRITI SUBMISSION", { bold: true, size: 9, color: "#991b1b" });
      addText(draft.safetyBanner, { size: 7, spacing: 10 });
      y += 8;
      addText(draft.title, { bold: true, size: 14 });
      addText(`Generated: ${new Date().toISOString().slice(0, 10)} • Case: ${draft.caseId} • Draft: ${draft.id}`, { size: 7, color: "#6b6560" });
      y += 6;

      // Sections with placeholder visibility
      for (const sec of draft.sections) {
        addText(sec.heading, { bold: true, size: 11 });
        const content = sec.isPlaceholder ? `${sec.content}  [PLACEHOLDER — please fill]` : sec.content;
        addText(content, { size: 9, color: sec.isPlaceholder ? "#92400e" : undefined });
      }

      // Evidence list
      if (draft.evidenceList.length > 0) {
        addText("Evidence List", { bold: true, size: 11 });
        for (const ev of draft.evidenceList) {
          addText(`• ${ev}`, { size: 9 });
        }
      }

      // Legal citations
      if (draft.legalGrounds.length > 0) {
        addText("Legal Sources (verified)", { bold: true, size: 11 });
        for (const g of draft.legalGrounds) {
          addText(`${g.citation} — ${g.claim.slice(0, 160)} [Source: ${g.sourceUrl ?? g.sourceId}]`, { size: 8 });
        }
      } else {
        addText("No verified legal basis is currently available for this part of the draft.", { size: 8, color: "#92400e" });
      }

      // Placeholders checklist
      if (draft.placeholders.length > 0) {
        addText(`Missing: ${draft.placeholders.join(", ")}`, { size: 8, color: "#92400e" });
      }

      // Warnings
      if (draft.warnings.length > 0) {
        for (const w of draft.warnings) {
          addText(`[${w.severity.toUpperCase()}] ${w.message}`, { size: 8, color: w.severity === "blocked" ? "#991b1b" : "#92400e" });
        }
      }

      // Disclaimer
      y += 6;
      addText("Disclaimer: " + draft.disclaimer, { size: 7, color: "#6b6560" });
      addText("This PDF is a draft generated from your confirmed information and verified sources. Check names, dates, amounts, addresses, facts and requested relief before sending or filing. Not a guarantee of outcome. Not an official filing.", { size: 7, color: "#6b6560" });

      const blob = doc.output("blob");
      return { success: true, blob };
    } catch (e) {
      // Fallback: generate a simple text blob and suggest print — honest fallback
      const text = `PDF DRAFT — NOT OFFICIAL FILING\n\n${draft.safetyBanner}\n\n${draft.title}\n\nDraft: ${draft.id} • Case: ${draft.caseId}\n\n${draft.sections.map((s) => `${s.heading}\n${s.content}${s.isPlaceholder ? " [PLACEHOLDER — please fill]" : ""}`).join("\n\n")}\n\nEvidence: ${draft.evidenceList.join(", ") || "[Add evidence]"}\n\nLegal: ${draft.legalGrounds.map((g) => `${g.citation} — ${g.claim.slice(0, 120)}`).join("\n") || "No verified legal basis"}\n\nPlaceholders: ${draft.placeholders.join(", ") || "none"}\n\n${draft.disclaimer}\n\nThis is a text fallback — PDF generation fallback (jspdf not available).`;
      const blob = new Blob([text], { type: "text/plain" });
      return {
        success: true,
        blob,
        isPrintFallback: true,
        error: e instanceof Error ? e.message : "PDF generation used print fallback (jspdf not available).",
      };
    }
  }

  // For testing: check if jspdf is available
  async isPdfAvailable(): Promise<boolean> {
    try {
      const m = await import("jspdf");
      return !!(m.jsPDF || m.default);
    } catch {
      return false;
    }
  }
}

export const pdfExportService = new PdfExportService();
