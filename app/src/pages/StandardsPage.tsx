import { useCallback, useEffect, useMemo, useState } from "react";
import { listStandards } from "../api";
import { SearchBar } from "../components/SearchBar";
import { StandardDetailPanel } from "../components/StandardDetailPanel";
import { StandardList } from "../components/StandardList";
import { StandardsCategoryNav } from "../components/StandardsCategoryNav";
import {
  defaultTertiaryForMarket,
  emptyStandardsMessage,
  navigationForStandard,
  resolveStandardsQuery,
  type StandardsMarket,
  type StandardsPrimaryCategory,
} from "../lib/standards-navigation";
import type { FrameworkFilter, StandardSummary } from "../types";

export function StandardsPage() {
  const [primary, setPrimary] = useState<StandardsPrimaryCategory>("accounting-standards");
  const [market, setMarket] = useState<StandardsMarket>("ifrs");
  const [tertiary, setTertiary] = useState<FrameworkFilter>("ALL");
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [standards, setStandards] = useState<StandardSummary[]>([]);
  const [selected, setSelected] = useState<StandardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyNavigation = useCallback((next: ReturnType<typeof navigationForStandard>) => {
    setPrimary(next.primary);
    setMarket(next.market);
    setTertiary(next.tertiary);
  }, []);

  const loadStandards = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = resolveStandardsQuery(primary, market, tertiary);
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
  }, [primary, market, tertiary, includeLegacy]);

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
    setPrimary(value);
    setMarket("ifrs");
    setTertiary(defaultTertiaryForMarket(value, "ifrs"));
  };

  const handleMarketChange = (value: StandardsMarket) => {
    setMarket(value);
    setTertiary(defaultTertiaryForMarket(primary, value));
  };

  const emptyMessage = emptyStandardsMessage(primary, market);

  return (
    <div className="flex h-full flex-col gap-4">
      <SearchBar onSelectHit={openStandardById} />

      <StandardsCategoryNav
        primary={primary}
        market={market}
        tertiary={tertiary}
        includeLegacy={includeLegacy}
        onPrimaryChange={handlePrimaryChange}
        onMarketChange={handleMarketChange}
        onTertiaryChange={setTertiary}
        onIncludeLegacyChange={setIncludeLegacy}
      />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,280px)_minmax(0,1fr)] gap-3">
        <div className="min-h-0 overflow-auto">
          {loading ? (
            <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">正在加载准则列表…</p>
          ) : (
            <StandardList
              standards={standards}
              selectedId={selectedSummary?.id ?? null}
              onSelect={setSelected}
              emptyMessage={emptyMessage}
            />
          )}
        </div>
        <StandardDetailPanel
          summary={selectedSummary}
          onOpenSuperseded={openStandardById}
        />
      </div>
    </div>
  );
}
