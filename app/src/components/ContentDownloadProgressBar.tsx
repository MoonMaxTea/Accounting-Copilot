import { formatBytes } from "../lib/format-bytes";
import { usePreferences } from "../context/PreferencesContext";
import type { ContentDownloadProgress } from "../types";
import type { MessageKey } from "../lib/i18n";

interface ContentDownloadProgressBarProps {
  progress: ContentDownloadProgress | null;
  pending?: boolean;
}

const PHASE_KEYS: Record<string, MessageKey> = {
  checking: "progressChecking",
  downloading: "progressDownloading",
  verifying: "progressVerifying",
  installing: "progressInstalling",
};

export function ContentDownloadProgressBar({
  progress,
  pending = false,
}: ContentDownloadProgressBarProps) {
  const { tr } = usePreferences();

  if ((!progress || progress.phase === "idle") && !pending) {
    return null;
  }

  const display =
    progress && progress.phase !== "idle"
      ? progress
      : {
          phase: "checking",
          downloaded_bytes: 0,
          total_bytes: 0,
          message: tr("progressPreparing"),
        };

  const percent =
    display.total_bytes > 0
      ? Math.min(100, Math.round((display.downloaded_bytes / display.total_bytes) * 100))
      : null;
  const showDeterminate = display.phase === "downloading" && percent !== null;
  const label =
    display.message ??
    tr(PHASE_KEYS[display.phase] ?? "progressWorking");

  return (
    <div className="mt-4 space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-brand-muted">
        <span>{label}</span>
        {display.phase === "downloading" && display.total_bytes > 0 && percent !== null && (
          <span>
            {percent}% · {formatBytes(display.downloaded_bytes)} /{" "}
            {formatBytes(display.total_bytes)}
          </span>
        )}
        {display.phase === "downloading" && display.total_bytes === 0 && (
          <span>{formatBytes(display.downloaded_bytes)}</span>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-brand-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={showDeterminate ? 100 : undefined}
        aria-valuenow={showDeterminate ? percent ?? undefined : undefined}
        aria-label={label}
      >
        <div
          className={[
            "h-full rounded-full bg-brand-accent",
            showDeterminate ? "transition-[width] duration-150 ease-out" : "w-1/3 animate-pulse",
          ].join(" ")}
          style={showDeterminate ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  );
}
