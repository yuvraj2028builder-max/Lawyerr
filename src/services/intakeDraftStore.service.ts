/**
 * Bug-fix #3 — intake draft persistence (persist + explicit resume).
 *
 * Chose persistence over a leave-warning because the app's own messaging
 * already implies browser persistence, and the in-memory case store meant a
 * refresh destroyed the CASE as well as the answers — a warning would have
 * left the underlying data loss intact.
 *
 * Rules:
 * - Only the legacy intake flow drafts here (view === "intake").
 * - File bytes are stripped before saving (they never survive refresh; the
 *   UI already says so). Metadata is preserved.
 * - Drafts expire after 7 days; corrupt or mismatched drafts load as null.
 * - Resume is always explicit (banner with Resume/Discard), never silent.
 */
import type { Case, DocumentUpload, IntakeState } from "@/types/domain";

export const INTAKE_DRAFT_KEY = "nyayasetu_intake_draft_v1";
const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface IntakeDraft {
  version: number;
  savedAt: string;
  kase: Case;
  intake: IntakeState;
}

function stripFileBytes(doc: DocumentUpload): DocumentUpload {
  if (!doc.file) return doc;
  const { file: _dropped, ...rest } = doc;
  void _dropped;
  return { ...rest, file: undefined };
}

/** Save a resumable snapshot. Returns false when storage is unavailable. */
export function saveIntakeDraft(kase: Case, intake: IntakeState): boolean {
  try {
    if (intake.caseId !== kase.id) return false;
    const draft: IntakeDraft = {
      version: DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      kase: { ...kase, documentUploads: (kase.documentUploads ?? []).map(stripFileBytes) },
      intake,
    };
    localStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Load the draft, or null when absent/corrupt/expired/mismatched. Never throws. */
export function loadIntakeDraft(now: number = Date.now()): IntakeDraft | null {
  try {
    const raw = localStorage.getItem(INTAKE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IntakeDraft>;
    if (parsed.version !== DRAFT_VERSION) return null;
    if (typeof parsed.savedAt !== "string" || Number.isNaN(Date.parse(parsed.savedAt))) return null;
    if (now - Date.parse(parsed.savedAt) > DRAFT_TTL_MS) return null;
    const kase = parsed.kase;
    const intake = parsed.intake;
    if (!kase || typeof kase.id !== "string" || typeof kase.description !== "string") return null;
    if (!intake || typeof intake.caseId !== "string" || typeof intake.answers !== "object" || intake.answers === null) return null;
    if (intake.caseId !== kase.id) return null;
    if (!Array.isArray(intake.questions)) return null;
    return parsed as IntakeDraft;
  } catch {
    return null;
  }
}

export function clearIntakeDraft(): void {
  try {
    localStorage.removeItem(INTAKE_DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** One-line human summary for the resume banner. */
export function summarizeDraft(draft: IntakeDraft): string {
  const desc = draft.kase.description.slice(0, 80);
  const when = new Date(draft.savedAt).toLocaleString();
  return `${desc}${draft.kase.description.length > 80 ? "…" : ""} (saved ${when})`;
}

/** Resume is offered only on landing with no active flow and a valid draft. */
export function shouldOfferResume(view: string, hasActiveIntake: boolean, draft: IntakeDraft | null): boolean {
  return view === "landing" && !hasActiveIntake && draft !== null;
}
