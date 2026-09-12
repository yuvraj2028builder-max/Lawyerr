/**
 * Prompt 16 — Per-case Save/Sync panel (Part 3).
 *
 * - Signed out: one honest line, zero nudging. Nothing here can run.
 * - Signed in: explicit consent checkbox + one-case-at-a-time save, conflict
 *   choice with three buttons, failure with retry. Keyboard reachable,
 *   labeled inputs, status announced via role="status".
 */
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Case, ID } from "@/types/domain";
import {
  describeSyncPlan,
  getSyncRecord,
  resolveConflict,
  syncCase,
  type ConflictChoice,
  type SyncDeps,
  type SyncOutcome,
} from "@/services/sync/caseSync.service";

export function CaseSyncPanel({ kase, onSyncChange }: { kase: Case; onSyncChange?: () => void }) {
  const auth = useAuth();
  const signedIn = auth.status === "authenticated" && auth.user;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<string[] | null>(null);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);
  const [completedSaves, setCompletedSaves] = useState(0);

  // Re-read the sync record after each completed save (localStorage-backed).
  const record = getSyncRecord(kase.id);
  void completedSaves;

  const runWithBackend = async (fn: (deps: SyncDeps) => Promise<SyncOutcome>) => {
    setBusy(true);
    setOutcome(null);
    try {
      const mod = await import("@/backend/supabase");
      const resolved = await mod.resolveBackendProviderAsync();
      if (resolved.mode !== "cloud") {
        setOutcome({ status: "refused", message: "Online saving is not set up yet. Your case stays in this browser.", retryable: false });
        return;
      }
      const result = await fn({ backend: resolved.provider });
      setOutcome(result);
      if (result.status === "synced" || result.status === "pulled") {
        onSyncChange?.();
        setCompletedSaves((t) => t + 1);
      }
    } catch (e) {
      setOutcome({ status: "failed", message: e instanceof Error ? e.message : "Saving failed. Local data is untouched — try again.", retryable: true });
    } finally {
      setBusy(false);
    }
  };

  const showPlan = async () => {
    setBusy(true);
    try {
      const mod = await import("@/backend/supabase");
      const resolved = await mod.resolveBackendProviderAsync();
      if (resolved.mode !== "cloud") {
        setOutcome({ status: "refused", message: "Online saving is not set up yet. Your case stays in this browser.", retryable: false });
        return;
      }
      const described = await describeSyncPlan(kase.id, { backend: resolved.provider });
      if (described.plan) {
        setPlan(described.plan);
        setOutcome({ status: "refused", message: "Review what will be copied, then tick the box to continue.", retryable: false });
      } else {
        setOutcome({ status: "refused", message: described.message, retryable: false });
      }
    } finally {
      setBusy(false);
    }
  };

  const doSave = () => runWithBackend((deps) => syncCase(kase.id, deps));
  const doResolve = (choice: ConflictChoice) => runWithBackend((deps) => resolveConflict(kase.id, choice, deps));

  if (!signedIn) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <strong className="small" style={{ display: "block", marginBottom: 4 }}>Save / Sync</strong>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
          Not signed in — your data stays in this browser only. Saving to an account is optional and never required.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <strong className="small" style={{ display: "block", marginBottom: 4 }}>Save / Sync</strong>
      {record ? (
        <p className="small muted" style={{ margin: "0 0 8px", lineHeight: 1.6 }}>
          Saved to your account{` (last save ${new Date(record.syncedAt).toLocaleString()})`}. Your saved copy is the source of truth for this case.
        </p>
      ) : (
        <p className="small muted" style={{ margin: "0 0 8px", lineHeight: 1.6 }}>
          This case lives only in this browser. Saving copies it to your private account — one case at a time, only when you ask.
        </p>
      )}
      {!plan && !record && (
        <button className="btn btn--secondary btn--sm" onClick={showPlan} disabled={busy}>
          {busy ? "Checking…" : "What will be copied?"}
        </button>
      )}
      {plan && !record && (
        <div style={{ marginBottom: 8 }}>
          <ul className="small" style={{ margin: "0 0 8px", paddingLeft: 18, lineHeight: 1.6 }}>
            {plan.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", lineHeight: 1.5 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-label="I understand this case will be copied to my account and will no longer be local-only" />
            I understand this case and its evidence records will be copied to my account and will no longer be local-only.
          </label>
        </div>
      )}
      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn btn--primary btn--sm" onClick={doSave} disabled={busy || (!record && !consent)}>
          {busy ? "Saving…" : record ? "Save new changes" : "Save this case to your account"}
        </button>
      </div>
      {outcome?.status === "conflict" && (
        <div style={{ marginTop: 10, padding: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
          <p className="small" style={{ margin: "0 0 8px", color: "#92400e" }}>{outcome.message}</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--secondary btn--sm" onClick={() => doResolve("keep_cloud")} disabled={busy}>Keep saved copy</button>
            <button className="btn btn--secondary btn--sm" onClick={() => doResolve("keep_local")} disabled={busy}>Keep this device's copy</button>
            <button className="btn btn--ghost btn--sm" onClick={() => doResolve("cancel")} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {outcome && outcome.status !== "conflict" && (
        <p className="small" role="status" style={{ margin: "8px 0 0", color: outcome.status === "failed" || outcome.status === "refused" ? "#991b1b" : "#065f46" }}>
          {outcome.message}
          {outcome.status === "failed" && outcome.retryable && (
            <span> <button className="btn btn--ghost btn--sm" onClick={doSave} disabled={busy}>Retry</button></span>
          )}
        </p>
      )}
    </div>
  );
}

export function SaveAllCasesButton({ localIds }: { localIds: ID[] }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  if (!(auth.status === "authenticated" && auth.user)) return null;
  const saveAll = async () => {
    setBusy(true);
    try {
      const mod = await import("@/backend/supabase");
      const resolved = await mod.resolveBackendProviderAsync();
      if (resolved.mode !== "cloud") {
        setSummary("Online saving is not set up yet.");
        return;
      }
      const { syncAllCases } = await import("@/services/sync/caseSync.service");
      const result = await syncAllCases(localIds, { backend: resolved.provider });
      setSummary(`Saved ${result.synced.length}. Skipped ${result.skipped.length} already saved. ${result.failed.length} failed${result.failed.length ? ` (${result.failed.map((f) => f.message).join("; ")})` : ""}.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn btn--ghost btn--sm" onClick={saveAll} disabled={busy}>
        {busy ? "Saving…" : "Save all unsaved cases"}
      </button>
      {summary && <p className="small" role="status" style={{ margin: "6px 0 0" }}>{summary}</p>}
    </div>
  );
}
