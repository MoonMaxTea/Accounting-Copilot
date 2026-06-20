import { useEffect, useMemo, useState } from "react";
import { getStandard, openOfficialUrl } from "../api";
import { BodySearchBar } from "./BodySearchBar";
import { MarkdownPreview } from "./MarkdownPreview";
import { useBodySearch } from "../hooks/useBodySearch";
import { usePreferences } from "../context/PreferencesContext";
import type { StandardDetail, StandardSummary } from "../types";

interface StandardDetailPanelProps {
  summary: StandardSummary | null;
  onOpenSuperseded: (standardId: string) => void;
}

export function StandardDetailPanel({
  summary,
  onOpenSuperseded,
}: StandardDetailPanelProps) {
  const { tr, trf } = usePreferences();
  const [detail, setDetail] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodySearch = useBodySearch(detail?.body);

  useEffect(() => {
    if (!summary) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getStandard(summary.id)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [summary]);

  const heading = useMemo(() => {
    if (!detail && !summary) {
      return tr("selectStandard");
    }
    const active = detail ?? summary;
    if (!active) {
      return tr("selectStandard");
    }
    return active.title_zh ? `${active.id} � ${active.title_zh}` : `${active.id} � ${active.title}`;
  }, [detail, summary, tr]);

  if (!summary) {
    return (
      <section className="ui-panel flex h-full items-center justify-center rounded-lg border-dashed p-8 text-brand-muted">
        {tr("selectStandardHint")}
      </section>
    );
  }

  return (
    <section className="ui-panel flex h-full flex-col overflow-hidden rounded-lg shadow-sm">
      <header className="border-b border-brand-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-brand-ink">{heading}</h2>
              {(detail?.status ?? summary.status) === "legacy" && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {detail?.legacy_label ?? summary.legacy_label ?? tr("legacy")}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-brand-muted">{summary.framework}</p>
          </div>
          <button
            type="button"
            onClick={() => openOfficialUrl(summary.official_url)}
            className="ui-btn-primary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            {tr("viewOfficialSite")}
          </button>
        </div>

        {(detail?.status ?? summary.status) === "legacy" && (
          <div className="ui-alert-warning mt-4 rounded-lg px-4 py-3 text-sm">
            {tr("legacySuperseded")}
            {detail?.effective_until && (
              <span className="ml-1">
                {trf("supersededOn", { date: detail.effective_until })}
              </span>
            )}
            {detail?.superseded_by && (
              <button
                type="button"
                onClick={() => onOpenSuperseded(detail.superseded_by!)}
                className="ui-focus-ring ml-2 font-medium underline"
              >
                {trf("viewReplacement", { id: detail.superseded_by })}
              </button>
            )}
          </div>
        )}

        {detail?.official_url_note && (
          <p className="mt-3 text-sm text-brand-muted">{detail.official_url_note}</p>
        )}
      </header>

      <BodySearchBar search={bodySearch} tr={tr} trf={trf} />

      <div
        ref={bodySearch.bodyRef}
        className="flex-1 overflow-auto px-5 py-4 sm:px-6 sm:py-5"
      >
        {loading && <p className="text-sm text-brand-muted">{tr("loadingStandardText")}</p>}
        {error && <p className="ui-alert-error rounded-lg px-4 py-3 text-sm">{error}</p>}
        {!loading && !error && detail && <MarkdownPreview content={detail.body} />}
      </div>
    </section>
  );
}
