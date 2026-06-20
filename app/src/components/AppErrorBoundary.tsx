import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../lib/i18n";
import { loadLocale } from "../lib/preferences";

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
      const locale = loadLocale();
      return (
        <div className="flex min-h-screen items-center justify-center bg-brand-paper px-6">
          <div className="max-w-lg rounded-lg border border-red-200 bg-brand-surface p-6 text-left shadow-sm dark:border-red-900">
            <h1 className="text-lg font-semibold text-red-700 dark:text-red-400">
              {t(locale, "appLoadFailed")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-brand-muted">
              {t(locale, "appLoadFailedHint")}
            </p>
            <pre className="mt-4 overflow-auto rounded-xl bg-brand-paper p-3 text-xs text-brand-ink">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
