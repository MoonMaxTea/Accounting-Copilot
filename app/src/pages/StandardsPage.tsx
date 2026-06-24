import { useCallback, useEffect, useMemo, useState } from "react";
import { getPackInfo, listStandards } from "../api";
import { SearchBar } from "../components/SearchBar";
import { StandardDetailPanel } from "../components/StandardDetailPanel";
import { StandardList } from "../components/StandardList";
import { StandardsCategoryNav } from "../components/StandardsCategoryNav";
import { usePreferences } from "../context/PreferencesContext";
import { navLabel } from "../lib/i18n";
import {
  defaultSecondary,
  defaultTertiary,
  navigationForStandard,
  resolveStandardsQuery,
} from "../lib/standards-navigation";
import type { CategoryMeta, FrameworkFilter, StandardSummary } from "../types";

export function StandardsPage() {
  const { tr, trf, locale } = usePreferences();
  const [categoryMeta, setCategoryMeta] = useState<CategoryMeta[]>([]);

  const [primary, setPrimary] = useState<string>("accounting-standards");
  const [secondary, setSecondary] = useState<string>("ALL");
  const [tertiary, setTertiary] = useState<FrameworkFilter>("ALL");
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [standards, setStandards] = useState<StandardSummary[]>([]);
  const [selected, setSelected] = useState<StandardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load category meta from pack info on mount
  useEffect(() => {
    getPackInfo()
      .then((pack) => {
        const meta = pack.category_meta ?? [];
        setCategoryMeta(meta);
        if (meta.length > 0) {
          const firstCategory = meta[0].id;
          setPrimary(firstCategory);
          const defSec = defaultSecondary(firstCategory, meta);
          setSecondary(defSec);
          setTertiary(defaultTertiary(firstCategory, defSec));
        }
      })
      .catch(() => undefined);
  }, []);

  const applyNavigation = useCallback(
    (next: ReturnType<typeof navigationForStandard>) => {
      setPrimary(next.primary);
      setSecondary(next.secondary);
      setTertiary(next.tertiary);
    },
    [],
  );

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
    if (categoryMeta.length === 0) {
      return;
    }
    void loadStandards();
  }, [loadStandards, categoryMeta]);

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
        applyNavigation(navigationForStandard(match, categoryMeta));
        setSelected(match);
        return;
      }

      listStandards(null, true)
        .then((all) => {
          const found = all.find((item) => item.id === standardId) ?? null;
          if (found) {
            applyNavigation(navigationForStandard(found, categoryMeta));
          }
          setSelected(found);
        })
        .catch(() => undefined);
    },
    [applyNavigation, categoryMeta, standards],
  );

  const handlePrimaryChange = (value: string) => {
    const nextSecondary = defaultSecondary(value, categoryMeta);
    setPrimary(value);
    setSecondary(nextSecondary);
    setTertiary(defaultTertiary(value, nextSecondary));
  };

  const handleSecondaryChange = (value: string) => {
    setSecondary(value);
    setTertiary(defaultTertiary(primary, value));
  };

  const emptyMessage =
    primary === "listing-rules"
      ? trf("listingRulesEmpty", { market: navLabel(locale, secondary) })
      : tr("noStandardsMatch");
  const showListingRulesEmptyState =
    primary === "listing-rules" && !loading && standards.length === 0;

  // Fallback: if no pack loaded, show loading
  if (categoryMeta.length === 0 && !loading) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <p className="ui-panel p-6 text-sm text-brand-muted">{tr("loadingStandards")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <SearchBar onSelectHit={openStandardById} />

      <StandardsCategoryNav
        primary={primary}
        secondary={secondary}
        tertiary={tertiary}
        includeLegacy={includeLegacy}
        categoryMeta={categoryMeta}
        onPrimaryChange={handlePrimaryChange}
        onSecondaryChange={handleSecondaryChange}
        onTertiaryChange={setTertiary}
        onIncludeLegacyChange={setIncludeLegacy}
      />

      {error && <p className="ui-alert-error shrink-0 rounded-xl px-4 py-3 text-sm">{error}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,280px)_minmax(0,1fr)] gap-3 overflow-hidden">
        <div className="min-h-0 overflow-auto">
          {loading ? (
            <p className="ui-panel p-6 text-sm text-brand-muted">{tr("loadingStandards")}</p>
          ) : showListingRulesEmptyState ? (
            <div className="ui-panel rounded-lg border-dashed p-6">
              <h3 className="text-sm font-semibold text-brand-ink">{tr("listingRulesComingSoon")}</h3>
              <p className="mt-2 text-sm leading-6 text-brand-muted">{emptyMessage}</p>
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
