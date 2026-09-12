import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Do not log sensitive case content
    console.error("[NyayaSetu] UI error:", error.message, info.componentStack?.slice(0, 500));
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ padding: "32px 0" }}>
          <div className="card" style={{ padding: 20, background: "#fef2f2", borderColor: "#fecaca" }}>
            <strong style={{ color: "#991b1b" }}>Something went wrong</strong>
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              Your data is safe. Please refresh the page.
            </p>
            <p className="tiny muted" style={{ margin: "8px 0 0" }}>
              {this.state.error?.message ?? "Unknown error"}
            </p>
            <button className="btn btn--secondary btn--sm" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
