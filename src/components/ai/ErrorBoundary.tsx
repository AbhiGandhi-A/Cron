"use client";

import { Component, type ReactNode } from "react";
import { captureError } from "@/lib/monitoring/client";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    captureError({
      title: "React render error",
      message: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.name : "RenderError",
      stack: error instanceof Error ? error.stack : undefined,
      kind: "frontend",
      source: "react-error-boundary",
      context: { page: typeof window !== "undefined" ? window.location.pathname : undefined },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-xl">
        <p className="text-sm font-bold text-red-800">Something went wrong rendering this page</p>
        <p className="text-xs text-red-600 mt-1 break-words">{this.state.message || "Unknown error"}</p>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => typeof window !== "undefined" && window.location.reload()}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
          >
            Reload page
          </button>
          <button
            onClick={() => this.setState({ hasError: false, message: "" })}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}