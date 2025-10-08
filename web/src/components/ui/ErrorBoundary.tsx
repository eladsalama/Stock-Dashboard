"use client";
import React from "react";
interface State {
  hasError: boolean;
  error?: Error;
}
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, error: err };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <p style={{ opacity: 0.7, fontSize: 13 }}>Try refreshing the page.</p>
          <button
            onClick={() => location.reload()}
            style={{
              padding: "6px 14px",
              background: "#1f6feb",
              color: "#fff",
              border: "1px solid #265ea8",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
