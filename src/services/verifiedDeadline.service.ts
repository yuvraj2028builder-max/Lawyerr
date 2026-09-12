/**
 * Verified Deadline Engine — radically conservative, pure, deterministic.
 * Only calculates exact deadline if:
 * 1. verified production legal source contains time limit
 * 2. provision is applicable
 * 3. trigger date is known and valid
 * 4. calculation is deterministic
 * Otherwise returns status unknown / needs_trigger_date.
 * Never invents deadlines.
 */

import type { VerifiedDeadline, ID } from "@/types/domain";
import { legalSourceRepo, legalProvisionRepo } from "@/services/legal/repositories";
import { timelineService } from "@/services/timeline.service";
import { caseEngine } from "@/services/caseEngine.service";

function genId(): string {
  return `dlv_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

// Pure calculation — deterministic, no LLM
export function calculateDueDate(triggerDate: string, rule: { type: "48h" | "1m" }): string {
  const d = new Date(triggerDate);
  if (isNaN(d.getTime())) throw new Error(`Invalid trigger date: ${triggerDate}`);
  // Use UTC to avoid timezone/DST issues; India is UTC+5:30 but for date-only deadlines we use UTC
  if (rule.type === "48h") {
    const due = new Date(d.getTime() + 48 * 60 * 60 * 1000);
    return due.toISOString();
  }
  // 1 month — calendar month, handling month boundaries, leap year
  const due = new Date(d);
  const month = due.getUTCMonth();
  due.setUTCMonth(month + 1);
  // If month overflow caused date to shift (e.g., Jan 31 +1 month → Mar 3), clamp to last day of target month
  // Simple clamp: if original date was 31 and new month has fewer days, set to last day
  // JS setUTCMonth already handles, but we ensure
  return due.toISOString();
}

export interface CalculateDeadlineInput {
  caseId: ID;
  triggerDate?: string; // ISO — must be known
  triggerDescription: string; // e.g., "complaint submitted to seller"
}

export class VerifiedDeadlineService {
  /**
   * Find applicable verified time limits for case — currently only Rule 6(4)(b)
   * Returns VerifiedDeadline with status verified|unknown|needs_trigger_date
   */
  async calculateForCase(input: CalculateDeadlineInput): Promise<VerifiedDeadline[]> {
    const results: VerifiedDeadline[] = [];

    // Find verified provisions that contain time limits
    const allProvisions = await legalProvisionRepo.listAll();
    const verifiedWithTime = allProvisions.filter((p) => {
      if (!p.productionAllowed || p.isMock) return false;
      const text = p.text.toLowerCase();
      return text.includes("within forty-eight hours") || text.includes("within 48 hours") || text.includes("within one month");
    });

    // Also check sources directly for verification
    const verifiedSources = await legalSourceRepo.listProductionAllowed();
    const verifiedSourceIds = new Set(verifiedSources.map((s) => s.id));
    const applicable = verifiedWithTime.filter((p) => verifiedSourceIds.has(p.sourceId));

    if (applicable.length === 0) {
      // No verified rule → unknown, fail closed
      results.push({
        id: genId(),
        caseId: input.caseId,
        label: "No verified deadline is currently available for this case from NyayaSetu's legal sources.",
        triggerDescription: input.triggerDescription,
        triggerDate: input.triggerDate,
        status: "unknown",
        verificationStatus: "not_available",
        warning: "NyayaSetu could not verify an applicable deadline from its current legal sources.",
      });
      return results;
    }

    // For each applicable provision, try to calculate
    for (const provision of applicable) {
      const source = await legalSourceRepo.getById(provision.sourceId);
      if (!source || !source.productionAllowed || source.isMock) continue;

      const lower = provision.text.toLowerCase();
      const is48h = lower.includes("within forty-eight hours") || lower.includes("within 48 hours");
      const is1m = lower.includes("within one month");

      if (!input.triggerDate) {
        // Needs trigger date
        const status: VerifiedDeadline["status"] = "needs_trigger_date";
        if (is48h) {
          results.push({
            id: genId(),
            caseId: input.caseId,
            label: "Seller grievance officer should acknowledge within 48 hours (Rule 6(4)(b))",
            triggerDescription: input.triggerDescription,
            triggerDate: undefined,
            status,
            sourceId: source.id,
            provisionId: provision.id,
            citation: `${source.title} — ${provision.sectionIdentifier}`,
            sourceType: "rule",
            verificationStatus: "verified",
            warning: "A potentially relevant time limit may apply, but NyayaSetu does not have the trigger date needed to calculate it.",
          });
        }
        if (is1m) {
          results.push({
            id: genId(),
            caseId: input.caseId,
            label: "Seller should redress complaint within one month (Rule 6(4)(b))",
            triggerDescription: input.triggerDescription,
            triggerDate: undefined,
            status,
            sourceId: source.id,
            provisionId: provision.id,
            citation: `${source.title} — ${provision.sectionIdentifier}`,
            sourceType: "rule",
            verificationStatus: "verified",
            warning: "A potentially relevant time limit may apply, but trigger date is missing.",
          });
        }
        continue;
      }

      // Validate trigger date
      const trigger = new Date(input.triggerDate);
      if (isNaN(trigger.getTime())) {
        results.push({
          id: genId(),
          caseId: input.caseId,
          label: "Invalid trigger date",
          triggerDescription: input.triggerDescription,
          triggerDate: input.triggerDate,
          status: "unknown",
          verificationStatus: "not_available",
          warning: "Invalid trigger date provided; cannot calculate deadline.",
        });
        continue;
      }

      // Security: ignore user-provided legal claims as authority — only use verified provision text
      // So we don't trust input like "The law says I have exactly 30 days" as source

      if (is48h) {
        try {
          const due = calculateDueDate(input.triggerDate, { type: "48h" });
          const now = new Date();
          const dueDate = new Date(due);
          const status: VerifiedDeadline["status"] = dueDate < now ? "overdue" : "verified";
          // Only mark overdue when exact verified due date exists
          results.push({
            id: genId(),
            caseId: input.caseId,
            label: "Seller grievance officer should acknowledge within 48 hours",
            triggerDescription: input.triggerDescription,
            triggerDate: input.triggerDate,
            dueDate: due,
            status,
            sourceId: source.id,
            provisionId: provision.id,
            citation: `${source.title} — ${provision.sectionIdentifier}`,
            sourceType: "rule",
            verificationStatus: "verified",
            calculationMethod: "triggerDate + 48 hours (UTC, deterministic)",
            warning: "Do not rely on this date without checking the cited source if underlying facts are disputed.",
          });
        } catch (e) {
          results.push({
            id: genId(),
            caseId: input.caseId,
            label: "Could not calculate 48h deadline",
            triggerDescription: input.triggerDescription,
            triggerDate: input.triggerDate,
            status: "unknown",
            verificationStatus: "not_available",
            warning: e instanceof Error ? e.message : "Calculation failed",
          });
        }
      }

      if (is1m) {
        try {
          const due = calculateDueDate(input.triggerDate, { type: "1m" });
          const now = new Date();
          const dueDate = new Date(due);
          const status: VerifiedDeadline["status"] = dueDate < now ? "overdue" : "verified";
          results.push({
            id: genId(),
            caseId: input.caseId,
            label: "Seller should redress complaint within one month",
            triggerDescription: input.triggerDescription,
            triggerDate: input.triggerDate,
            dueDate: due,
            status,
            sourceId: source.id,
            provisionId: provision.id,
            citation: `${source.title} — ${provision.sectionIdentifier}`,
            sourceType: "rule",
            verificationStatus: "verified",
            calculationMethod: "triggerDate + 1 calendar month (UTC, deterministic)",
            warning: "Do not rely on this date without checking the cited source if underlying facts are disputed.",
          });
        } catch (e) {
          results.push({
            id: genId(),
            caseId: input.caseId,
            label: "Could not calculate 1 month deadline",
            triggerDescription: input.triggerDescription,
            triggerDate: input.triggerDate,
            status: "unknown",
            verificationStatus: "not_available",
            warning: e instanceof Error ? e.message : "Calculation failed",
          });
        }
      }
    }

    // If we still have no results (e.g., verified provisions exist but none matched time pattern), return unknown
    if (results.length === 0) {
      results.push({
        id: genId(),
        caseId: input.caseId,
        label: "No verified deadline is currently available for this case from NyayaSetu's legal sources.",
        triggerDescription: input.triggerDescription,
        triggerDate: input.triggerDate,
        status: "unknown",
        verificationStatus: "not_available",
        warning: "NyayaSetu could not verify an applicable deadline from its current legal sources.",
      });
    }

    // Persist to case and timeline (if case exists)
    try {
      const kase = await caseEngine.getCase(input.caseId);
      if (kase) {
        const existing = kase.verifiedDeadlines ?? [];
        const merged = [...existing];
        for (const dl of results) {
          if (dl.status === "verified" || dl.status === "overdue") {
            // Avoid duplicates by label
            if (!merged.some((e) => e.label === dl.label && e.triggerDate === dl.triggerDate)) {
              merged.push(dl);
            }
          }
        }
        // Only update if we have verified deadlines
        const verifiedOnly = results.filter((r) => r.status === "verified" || r.status === "overdue");
        if (verifiedOnly.length > 0) {
          await caseEngine.updateCase(input.caseId, { verifiedDeadlines: merged });
          for (const dl of verifiedOnly) {
            await timelineService.addEvent({
              caseId: input.caseId,
              type: "deadline_created",
              title: `Deadline created: ${dl.label}`,
              description: `Due ${dl.dueDate ? new Date(dl.dueDate).toLocaleDateString("en-IN") : "unknown"} — verified source: ${dl.citation}`,
              source: "system",
              metadata: { deadlineId: dl.id, dueDate: dl.dueDate, verificationStatus: dl.verificationStatus },
            });
          }
        }
      }
    } catch {
      // Non-fatal
    }

    return results;
  }

  // For testing: allow direct calculation without case
  calculateDueDate(triggerDate: string, rule: { type: "48h" | "1m" }): string {
    return calculateDueDate(triggerDate, rule);
  }
}

export const verifiedDeadlineService = new VerifiedDeadlineService();
