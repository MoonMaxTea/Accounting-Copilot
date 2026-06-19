import { formatBytes } from "../lib/format-bytes";
import type { ContentDownloadProgress } from "../types";

interface ContentDownloadProgressBarProps {
  progress: ContentDownloadProgress | null;
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

export function ContentDownloadProgressBar({ progress }: ContentDownloadProgressBarProps) {
  if (!progress || progress.phase === "idle") {
    return null;
  }

  const percent =
    progress.total_bytes > 0
      ? Math.min(100, Math.round((progress.downloaded_bytes / progress.total_bytes) * 100))
      : null;
  const showDeterminate = progress.phase === "downloading" && percent !== null;
  const label = progress.message ?? phaseLabel(progress.phase);

  return (
    <div className="mt-4 space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{label}</span>
        {progress.phase === "downloading" && progress.total_bytes > 0 && percent !== null && (
          <span>
            {percent}% · {formatBytes(progress.downloaded_bytes)} / {formatBytes(progress.total_bytes)}
          </span>
        )}
        {progress.phase === "downloading" && progress.total_bytes === 0 && (
          <span>{formatBytes(progress.downloaded_bytes)}</span>
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
