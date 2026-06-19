import { useEffect, useState } from "react";
import { searchStandards } from "../api";
import type { SearchHit } from "../types";

interface SearchBarProps {
  onSelectHit: (standardId: string) => void;
}

export function SearchBar({ onSelectHit }: SearchBarProps) {
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
        placeholder="Search standards, e.g. joint control, IFRS 11, ASC 740"
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none ring-slate-900 transition focus:ring-2"
      />
      {loading && (
        <p className="absolute right-4 top-3 text-xs text-slate-400">Searching…</p>
      )}
      {hits.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
          {hits.map((hit) => (
            <button
              key={`${hit.standard_id}-${hit.pack_path}`}
              type="button"
              onClick={() => {
                onSelectHit(hit.standard_id);
                setQuery("");
                setHits([]);
              }}
              className="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="font-medium text-slate-900">{hit.standard_id}</div>
              <div className="text-sm text-slate-600">{hit.title}</div>
              <div
                className="mt-1 text-xs text-slate-500"
                dangerouslySetInnerHTML={{ __html: hit.snippet }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
