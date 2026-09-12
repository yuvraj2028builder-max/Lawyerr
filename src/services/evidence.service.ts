/**
 * Evidence Locker — metadata-first, no fake file analysis.
 * Stores evidence as user-declared unless a real upload exists.
 */

import type { EvidenceItem, EvidenceType, EvidenceSource, ID } from "@/types/domain";
import { caseEngine } from "@/services/caseEngine.service";
import { timelineService } from "@/services/timeline.service";

function genId(): string {
  return `ev_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export interface AddEvidenceInput {
  caseId: ID;
  type: EvidenceType;
  label?: string;
  description?: string;
  status?: EvidenceItem["status"]; // available | missing | unknown — defaults to available for user_declared
  source?: EvidenceSource; // defaults to user_declared
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  capturedAt?: string;
  notes?: string;
}

export class EvidenceService {
  async addEvidence(input: AddEvidenceInput): Promise<EvidenceItem> {
    const kase = await caseEngine.getCase(input.caseId);
    if (!kase) throw new Error(`Case not found: ${input.caseId}`);

    // Duplicate handling: same case + same type + same label
    const label = input.label ?? this.defaultLabel(input.type);
    const existing = kase.evidence.find(
      (e) => e.type === input.type && (e.label === label || e.title === label)
    );
    if (existing) {
      // Return existing, don't create duplicate — optionally update status if needed
      return existing;
    }

    const now = new Date().toISOString();
    const source: EvidenceSource = input.source ?? "user_declared";

    // No fake upload verification: if source is uploaded but no fileName, downgrade to user_declared
    let finalSource = source;
    let status = input.status ?? "available";
    if (source === "uploaded" && !input.fileName) {
      finalSource = "user_declared";
      status = "available";
    }

    // Never claim verified — status is available/missing/unknown, not verified
    const item: EvidenceItem = {
      id: genId(),
      caseId: input.caseId,
      title: label,
      label,
      description: input.description,
      status: status as EvidenceItem["status"],
      source: finalSource,
      type: input.type,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      capturedAt: input.capturedAt,
      addedAt: now,
      updatedAt: now,
      notes: input.notes,
    };

    const updatedEvidence = [...kase.evidence, item];
    await caseEngine.updateCase(input.caseId, { evidence: updatedEvidence });

    // Sync with ActionPlan evidenceTasks — single source of truth
    try {
      const fresh = await caseEngine.getCase(input.caseId);
      if (fresh?.actionPlan?.evidenceTasks) {
        const task = fresh.actionPlan.evidenceTasks.find((t) => {
          const labelLower = label.toLowerCase();
          const taskLower = t.label.toLowerCase();
          return taskLower.includes(labelLower.slice(0, 8)) || labelLower.includes(taskLower.slice(0, 8));
        });
        if (task && task.status !== "available" && status === "available") {
          task.status = "available";
          await caseEngine.updateCase(input.caseId, { actionPlan: fresh.actionPlan });
        }
      }
    } catch {
      // non-fatal
    }

    // Timeline: evidence_added
    await timelineService.addEvent({
      caseId: input.caseId,
      type: "evidence_added",
      title: `${label} marked as ${status}`,
      description: input.description,
      source: "system",
      metadata: { evidenceId: item.id, evidenceType: input.type, status, source: finalSource },
    });

    return item;
  }

  async updateEvidence(caseId: ID, evidenceId: ID, patch: Partial<EvidenceItem>): Promise<EvidenceItem> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found: ${caseId}`);
    const idx = kase.evidence.findIndex((e) => e.id === evidenceId);
    if (idx === -1) throw new Error(`Evidence not found: ${evidenceId}`);
    const existing = kase.evidence[idx];
    const updated: EvidenceItem = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const newEvidence = [...kase.evidence];
    newEvidence[idx] = updated;
    await caseEngine.updateCase(caseId, { evidence: newEvidence });

    await timelineService.addEvent({
      caseId,
      type: "evidence_updated",
      title: `${updated.label ?? updated.title} updated to ${updated.status}`,
      source: "system",
      metadata: { evidenceId, status: updated.status },
    });

    return updated;
  }

  async removeEvidence(caseId: ID, evidenceId: ID): Promise<void> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found: ${caseId}`);
    const exists = kase.evidence.find((e) => e.id === evidenceId);
    if (!exists) return;
    const newEvidence = kase.evidence.filter((e) => e.id !== evidenceId);
    await caseEngine.updateCase(caseId, { evidence: newEvidence });

    await timelineService.addEvent({
      caseId,
      type: "evidence_removed",
      title: `${exists.label ?? exists.title} removed`,
      source: "system",
      metadata: { evidenceId },
    });
  }

  async getEvidence(caseId: ID, evidenceId: ID): Promise<EvidenceItem | null> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) return null;
    return kase.evidence.find((e) => e.id === evidenceId) ?? null;
  }

  async getEvidenceForCase(caseId: ID): Promise<EvidenceItem[]> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) return [];
    return kase.evidence;
  }

  async markAvailable(caseId: ID, type: EvidenceType, label?: string): Promise<EvidenceItem> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found`);
    const found = kase.evidence.find((e) => e.type === type && (label ? e.label === label : true));
    if (found) {
      return this.updateEvidence(caseId, found.id, { status: "available" } as Partial<EvidenceItem>);
    }
    return this.addEvidence({ caseId, type, label, status: "available", source: "user_declared" });
  }

  async markMissing(caseId: ID, type: EvidenceType, label?: string): Promise<EvidenceItem> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) throw new Error(`Case not found`);
    const found = kase.evidence.find((e) => e.type === type && (label ? e.label === label : true));
    if (found) {
      return this.updateEvidence(caseId, found.id, { status: "missing" } as Partial<EvidenceItem>);
    }
    return this.addEvidence({ caseId, type, label, status: "missing", source: "user_declared" });
  }

  private defaultLabel(type: EvidenceType): string {
    const map: Record<EvidenceType, string> = {
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
      other: "Other evidence",
    };
    return map[type] ?? type;
  }
}

export const evidenceService = new EvidenceService();
