import { useEffect, useState } from "react";
import { searchStandards } from "../api";
import { usePreferences } from "../context/PreferencesContext";
import type { SearchHit } from "../types";

interface SearchBarProps {
  onSelectHit: (standardId: string) => void;
}

export function SearchBar({ onSelectHit }: SearchBarProps) {
  const { tr } = usePreferences();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoading(true);
      searchStandards(trimmed)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tr("searchStandardsPlaceholder")}
        aria-label={tr("searchStandardsPlaceholder")}
        className="ui-input ui-focus-ring w-full rounded-2xl px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-brand-accent"
      />
      {loading && (
        <p className="absolute right-4 top-3 text-xs text-brand-muted">{tr("searching")}</p>
      )}
      {hits.length > 0 && (
        <div className="ui-panel absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-2xl shadow-lg">
          {hits.map((hit) => (
            <button
              key={`${hit.standard_id}-${hit.pack_path}`}
              type="button"
              onClick={() => {
                onSelectHit(hit.standard_id);
                setQuery("");
                setHits([]);
              }}
              className="block w-full border-b border-brand-border px-4 py-3 text-left hover:bg-brand-hover"
            >
              <div className="font-medium text-brand-ink">{hit.standard_id}</div>
              <div className="text-sm text-brand-muted">{hit.title}</div>
              <div
                className="mt-1 text-xs text-brand-muted"
                dangerouslySetInnerHTML={{ __html: hit.snippet }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
