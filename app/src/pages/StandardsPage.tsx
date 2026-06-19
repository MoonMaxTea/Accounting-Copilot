import { useCallback, useEffect, useMemo, useState } from "react";
import { listStandards } from "../api";
import { SearchBar } from "../components/SearchBar";
import { StandardDetailPanel } from "../components/StandardDetailPanel";
import { StandardList } from "../components/StandardList";
import type { FrameworkFilter, StandardSummary } from "../types";

const FRAMEWORKS: FrameworkFilter[] = ["ALL", "IFRS", "IAS", "ASC"];

export function StandardsPage() {
  const [framework, setFramework] = useState<FrameworkFilter>("ALL");
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [standards, setStandards] = useState<StandardSummary[]>([]);
  const [selected, setSelected] = useState<StandardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStandards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listStandards(
        framework === "ALL" ? null : framework,
        includeLegacy,
      );
      setStandards(result);
      setSelected((current) => {
        if (current && result.some((item) => item.id === current.id)) {
          return current;
        }
        return result[0] ?? null;
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStandards([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [framework, includeLegacy]);

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
        setSelected(match);
        return;
      }
      setSelected({ id: standardId } as StandardSummary);
      listStandards(null, true)
        .then((all) => {
          const found = all.find((item) => item.id === standardId) ?? null;
          setSelected(found);
        })
        .catch(() => undefined);
    },
    [standards],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <SearchBar onSelectHit={openStandardById} />

      <div className="flex flex-wrap items-center gap-2">
        {FRAMEWORKS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFramework(item)}
            className={[
              "rounded-full px-4 py-2 text-sm font-medium transition",
              framework === item
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-400",
            ].join(" ")}
          >
            {item === "ALL" ? "全部" : item}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={includeLegacy}
            onChange={(event) => setIncludeLegacy(event.target.checked)}
          />
          显示旧准则
        </label>
      </div>

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
