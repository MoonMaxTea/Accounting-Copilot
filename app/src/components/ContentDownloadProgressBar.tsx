import { formatBytes } from "../lib/format-bytes";
import type { ContentDownloadProgress } from "../types";

interface ContentDownloadProgressBarProps {
  progress: ContentDownloadProgress | null;
  pending?: boolean;
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "checking":
      return "Checking for updates…";
    case "downloading":
      return "Downloading…";
    case "verifying":
      return "Verifying download…";
    case "installing":
      return "Installing standards pack…";
    default:
      return "Working…";
  }
}

export function ContentDownloadProgressBar({
  progress,
  pending = false,
}: ContentDownloadProgressBarProps) {
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
          message: "Preparing download…",
        };

  const percent =
    display.total_bytes > 0
      ? Math.min(100, Math.round((display.downloaded_bytes / display.total_bytes) * 100))
      : null;
  const showDeterminate = display.phase === "downloading" && percent !== null;
  const label = display.message ?? phaseLabel(display.phase);

  return (
    <div className="mt-4 space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
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
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={showDeterminate ? 100 : undefined}
        aria-valuenow={showDeterminate ? percent ?? undefined : undefined}
        aria-label={label}
      >
        <div
          className={[
            "h-full rounded-full bg-brand-navy",
            showDeterminate ? "transition-[width] duration-150 ease-out" : "w-1/3 animate-pulse",
          ].join(" ")}
          style={showDeterminate ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  );
}
