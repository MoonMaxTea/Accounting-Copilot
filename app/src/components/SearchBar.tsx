import { useEffect, useState, useRef, useCallback, type KeyboardEvent } from "react";
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
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useRef(`search-hits-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoading(true);
      searchStandards(trimmed)
        .then((results) => {
          setHits(results);
          setOpen(results.length > 0);
          setActiveIndex(results.length > 0 ? 0 : -1);
        })
        .catch(() => {
          setHits([]);
          setOpen(false);
          setActiveIndex(-1);
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  const selectHit = useCallback(
    (hit: SearchHit) => {
      onSelectHit(hit.standard_id);
      setQuery("");
      setHits([]);
      setOpen(false);
      setActiveIndex(-1);
    },
    [onSelectHit],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) {
      if (event.key === "Escape") {
        setOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? hits.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectHit(hits[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (hits.length > 0) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder={tr("searchStandardsPlaceholder")}
        aria-label={tr("searchStandardsPlaceholder")}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        className="ui-input ui-focus-ring w-full rounded-lg px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-brand-accent"
      />
      {loading && (
        <p className="absolute right-4 top-3 text-xs text-brand-muted">{tr("searching")}</p>
      )}
      {open && hits.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="ui-panel absolute z-20 mt-2 max-h-80 w-full overflow-auto shadow-lg"
        >
          {hits.map((hit, index) => (
            <button
              key={`${hit.standard_id}-${hit.pack_path}`}
              id={`${listId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectHit(hit)}
              className={[
                "ui-focus-ring block w-full border-b border-brand-border px-4 py-3 text-left last:border-b-0",
                index === activeIndex ? "bg-brand-hover" : "hover:bg-brand-hover",
              ].join(" ")}
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
