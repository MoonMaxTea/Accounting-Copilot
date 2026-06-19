import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Accounting Copilot render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
          <div className="max-w-lg rounded-lg border border-red-200 bg-white p-6 text-left shadow-sm">
            <h1 className="text-lg font-semibold text-red-700">Failed to load the app</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The app encountered a rendering error. Close and reopen the app. If the problem
              persists, contact your administrator.
            </p>
            <pre className="mt-4 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
