import { IconSearch } from "./icons";
import type { BodySearchResult } from "../hooks/useBodySearch";

interface BodySearchBarProps {
  search: BodySearchResult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tr: (key: any) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trf: (key: any, vars: Record<string, any>) => string;
  compact?: boolean;
}

export function BodySearchBar({
  search,
  tr,
  trf,
  compact = false,
}: BodySearchBarProps) {
  const { query, setQuery, currentIndex, totalMatches, goToNext, goToPrev, clearSearch } = search;

  const hasMatches = totalMatches > 0;
  const canNavigate = totalMatches > 1;

  return (
    <div
      className={[
        "flex items-center gap-1.5 border-b border-brand-border bg-brand-paper",
        compact ? "px-3 py-1.5" : "px-5 py-2",
      ].join(" ")}
    >
      <IconSearch className="h-3.5 w-3.5 shrink-0 text-brand-muted" />

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tr("findInStandardPlaceholder")}
        aria-label={tr("findInStandardPlaceholder")}
        className={[
          "ui-input ui-focus-ring min-w-0 flex-1 rounded-md px-2 text-sm",
          compact ? "py-1" : "py-1.5",
        ].join(" ")}
        autoFocus
      />

      <span
        className={[
          "shrink-0 whitespace-nowrap text-xs tabular-nums",
          hasMatches ? "text-brand-ink" : "text-brand-muted",
        ].join(" ")}
      >
        {hasMatches
          ? trf("matchCount", {
              current: String(currentIndex + 1),
              total: String(totalMatches),
            })
          : tr("noSearchMatches")}
      </span>

      <button
        type="button"
        title={tr("prevMatch")}
        aria-label={tr("prevMatch")}
        disabled={!canNavigate}
        onClick={goToPrev}
        className={[
          "ui-focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs transition",
          canNavigate
            ? "text-brand-ink hover:bg-brand-hover"
            : "cursor-default text-brand-muted/40",
        ].join(" ")}
      >
        ▲
      </button>

      <button
        type="button"
        title={tr("nextMatch")}
        aria-label={tr("nextMatch")}
        disabled={!canNavigate}
        onClick={goToNext}
        className={[
          "ui-focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs transition",
          canNavigate
            ? "text-brand-ink hover:bg-brand-hover"
            : "cursor-default text-brand-muted/40",
        ].join(" ")}
      >
        ▼
      </button>

      {query && (
        <button
          type="button"
          title={tr("closeSearch")}
          aria-label={tr("closeSearch")}
          onClick={clearSearch}
          className="ui-focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm text-brand-muted transition hover:bg-brand-hover hover:text-brand-ink"
        >
          ✕
        </button>
      )}
    </div>
  );
}
