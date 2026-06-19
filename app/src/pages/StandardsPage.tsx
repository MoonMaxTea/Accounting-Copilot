import { useCallback, useEffect, useMemo, useState } from "react";
import { listStandards } from "../api";
import { SearchBar } from "../components/SearchBar";
import { StandardDetailPanel } from "../components/StandardDetailPanel";
import { StandardList } from "../components/StandardList";
import { StandardsCategoryNav } from "../components/StandardsCategoryNav";
import {
  defaultSecondary,
  defaultTertiary,
  emptyStandardsMessage,
  navigationForStandard,
  resolveStandardsQuery,
  type StandardsPrimaryCategory,
  type StandardsSecondary,
} from "../lib/standards-navigation";
import type { FrameworkFilter, StandardSummary } from "../types";

export function StandardsPage() {
  const [primary, setPrimary] = useState<StandardsPrimaryCategory>("accounting-standards");
  const [secondary, setSecondary] = useState<StandardsSecondary>("ifrs");
  const [tertiary, setTertiary] = useState<FrameworkFilter>("ALL");
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [standards, setStandards] = useState<StandardSummary[]>([]);
  const [selected, setSelected] = useState<StandardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyNavigation = useCallback((next: ReturnType<typeof navigationForStandard>) => {
    setPrimary(next.primary);
    setSecondary(next.secondary);
    setTertiary(next.tertiary);
  }, []);

  const loadStandards = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = resolveStandardsQuery(primary, secondary, tertiary);
    if (query === "empty") {
      setStandards([]);
      setSelected(null);
      setLoading(false);
      return;
    }

    try {
      const result = await listStandards(query.framework, includeLegacy);
      const filtered = result.filter(query.postFilter);
      setStandards(filtered);
      setSelected((current) => {
        if (current && filtered.some((item) => item.id === current.id)) {
          return current;
        }
        return filtered[0] ?? null;
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStandards([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [primary, secondary, tertiary, includeLegacy]);

  useEffect(() => {
    void loadStandards();
  }, [loadStandards]);

  const selectedSummary = useMemo(() => {
    if (!selected) {
      return null;
    }
    return standards.find((item) => item.id === selected.id) ?? selected;
  }, [selected, standards]);

  const openStandardById = useCallback(
    (standardId: string) => {
      const match = standards.find((item) => item.id === standardId);
      if (match) {
        applyNavigation(navigationForStandard(match));
        setSelected(match);
        return;
      }

      listStandards(null, true)
        .then((all) => {
          const found = all.find((item) => item.id === standardId) ?? null;
          if (found) {
            applyNavigation(navigationForStandard(found));
          }
          setSelected(found);
        })
        .catch(() => undefined);
    },
    [applyNavigation, standards],
  );

  const handlePrimaryChange = (value: StandardsPrimaryCategory) => {
    const nextSecondary = defaultSecondary(value);
    setPrimary(value);
    setSecondary(nextSecondary);
    setTertiary(defaultTertiary(value, nextSecondary));
  };

  const handleSecondaryChange = (value: StandardsSecondary) => {
    setSecondary(value);
    setTertiary(defaultTertiary(primary, value));
  };

  const emptyMessage = emptyStandardsMessage(primary, secondary);
  const showListingRulesEmptyState = primary === "listing-rules" && !loading && standards.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <SearchBar onSelectHit={openStandardById} />

      <StandardsCategoryNav
        primary={primary}
        secondary={secondary}
        tertiary={tertiary}
        includeLegacy={includeLegacy}
        onPrimaryChange={handlePrimaryChange}
        onSecondaryChange={handleSecondaryChange}
        onTertiaryChange={setTertiary}
        onIncludeLegacyChange={setIncludeLegacy}
      />

      {error && <p className="shrink-0 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,280px)_minmax(0,1fr)] gap-3 overflow-hidden">
        <div className="min-h-0 overflow-auto">
          {loading ? (
            <p className="rounded-lg bg-white p-6 text-sm text-slate-500">Loading standards…</p>
          ) : showListingRulesEmptyState ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
              <h3 className="text-sm font-semibold text-slate-900">Listing rules coming soon</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {emptyMessage}
              </p>
            </div>
          ) : (
            <StandardList
              standards={standards}
              selectedId={selectedSummary?.id ?? null}
              onSelect={setSelected}
              emptyMessage={emptyMessage}
            />
          )}
        </div>
        <div className="min-h-0 overflow-hidden">
          <StandardDetailPanel
            summary={selectedSummary}
            onOpenSuperseded={openStandardById}
          />
        </div>
      </div>
    </div>
  );
}
