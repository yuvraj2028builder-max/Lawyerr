/**
 * Case Timeline — audit trail, system vs user_reported.
 * Never fakes historical events; user-reported events are marked as such.
 */

import type { CaseTimelineEvent, TimelineEventType, TimelineEventSource, ID } from "@/types/domain";
import { caseEngine } from "@/services/caseEngine.service";

function genId(): string {
  return `tl_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export interface AddTimelineEventInput {
  caseId: ID;
  type: TimelineEventType;
  title: string;
  description?: string;
  source?: TimelineEventSource; // defaults to system
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export class TimelineService {
  async addEvent(input: AddTimelineEventInput): Promise<CaseTimelineEvent> {
    const kase = await caseEngine.getCase(input.caseId);
    if (!kase) throw new Error(`Case not found: ${input.caseId}`);

    const event: CaseTimelineEvent = {
      id: genId(),
      caseId: input.caseId,
      type: input.type,
      title: input.title,
      description: input.description,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      source: input.source ?? "system",
      metadata: input.metadata,
    };

    const existing = kase.timeline ?? [];
    // Keep chronological order (oldest first) — we'll sort on read
    const updated = [...existing, event];
    await caseEngine.updateCase(input.caseId, { timeline: updated });

    return event;
  }

  async addUserNote(caseId: ID, note: string): Promise<CaseTimelineEvent> {
    if (!note.trim()) throw new Error("Note cannot be empty");
    return this.addEvent({
      caseId,
      type: "user_note",
      title: "User note",
      description: note.trim(),
      source: "user_reported",
    });
  }

  async getTimeline(caseId: ID, opts?: { filter?: TimelineEventType[]; order?: "asc" | "desc" }): Promise<CaseTimelineEvent[]> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) return [];
    let events = kase.timeline ?? [];
    if (opts?.filter && opts.filter.length > 0) {
      events = events.filter((e) => opts.filter!.includes(e.type));
    }
    const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    if (opts?.order === "desc") sorted.reverse();
    return sorted;
  }

  async getTimelineForCase(caseId: ID): Promise<CaseTimelineEvent[]> {
    return this.getTimeline(caseId, { order: "asc" });
  }

  // For testing: clear
  async clearForCase(caseId: ID): Promise<void> {
    const kase = await caseEngine.getCase(caseId);
    if (!kase) return;
    await caseEngine.updateCase(caseId, { timeline: [] });
  }
}

export const timelineService = new TimelineService();
