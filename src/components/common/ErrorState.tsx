import React from "react";

export function ErrorState({
  title,
  message,
  retryLabel = "Try again",
  onRetry,
}: {
  title: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="card"
      style={{ padding: 20, background: "#fef2f2", borderColor: "#fecaca", display: "flex", gap: 14 }}
    >
      <span aria-hidden style={{ fontSize: 20 }}>⚠️</span>
      <div className="stack" style={{ gap: 6 }}>
        <strong style={{ color: "#991b1b" }}>{title}</strong>
        <p className="small" style={{ margin: 0, color: "#7f1d1d" }}>{message}</p>
        {onRetry && (
          <button className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={onRetry}>
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 24, textAlign: "center", background: "var(--color-surface-2)" }}>
      <p className="h3" style={{ marginBottom: 6 }}>{title}</p>
      {body && <p className="small muted" style={{ margin: 0 }}>{body}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
