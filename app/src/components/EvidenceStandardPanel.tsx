import { useEffect, useMemo, useState } from "react";
import { getStandard, openOfficialUrl } from "../api";
import { BodySearchBar } from "./BodySearchBar";
import { useBodySearch } from "../hooks/useBodySearch";
import { usePreferences } from "../context/PreferencesContext";
import { HighlightedBody } from "./HighlightedBody";
import { MarkdownPreview } from "./MarkdownPreview";
import { IconChevronDown } from "./icons";
import type { CitationHighlight, CitationTarget, StandardDetail } from "../types";

interface EvidenceStandardPanelProps {
  target: CitationTarget | null;
  highlight: CitationHighlight | null;
  missMessage: string | null;
  onOpenSuperseded: (standardId: string) => void;
  compact?: boolean;
}

export function EvidenceStandardPanel({
  target,
  highlight,
  missMessage,
  onOpenSuperseded,
  compact = false,
}: EvidenceStandardPanelProps) {
  const { tr, trf } = usePreferences();
  const [detail, setDetail] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excerptExpanded, setExcerptExpanded] = useState(true);
  const bodySearch = useBodySearch(detail?.body);

  const standardId = target?.standard_id || null;
  const citationKey = target ? `${target.citation}:${target.char_start}:${target.char_end}` : null;

  useEffect(() => {
    if (citationKey) {
      setExcerptExpanded(true);
    }
  }, [citationKey]);

  useEffect(() => {
    if (!standardId || !target?.resolved) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getStandard(standardId)
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
  }, [standardId, target?.resolved, citationKey]);

  const heading = useMemo(() => {
    if (!detail && !target) {
      return tr("standardText");
    }
    const active = detail;
    if (active?.title_zh) {
      return `${active.id} — ${active.title_zh}`;
    }
    if (active) {
      return `${active.id} — ${active.title}`;
    }
    return target?.standard_id || tr("standardText");
  }, [detail, target, tr]);

  const shellClass = compact
    ? "flex h-full min-h-[240px] flex-col overflow-hidden bg-brand-surface"
    : "ui-panel flex h-full flex-col overflow-hidden rounded-lg shadow-sm";

  if (!target) {
    return (
      <section
        className={`${shellClass} ${compact ? "items-center justify-center p-6" : "items-center justify-center rounded-lg border border-dashed border-brand-border p-8"} text-brand-muted`}
      >
        <p className="text-sm leading-6">{tr("citationPanelEmpty")}</p>
      </section>
    );
  }

  if (!target.resolved || missMessage) {
    return (
      <section className={`${shellClass} ${compact ? "" : "border-amber-200 dark:border-amber-900"}`}>
        <header
          className={`border-b px-4 py-3 ${compact ? "border-brand-border bg-brand-paper" : "ui-alert-warning border-0 border-b px-5 py-4"}`}
        >
          <h2 className={`font-semibold ${compact ? "text-sm text-brand-ink" : "text-lg"}`}>
            {tr("paragraphNotFound")}
          </h2>
          <p className="mt-1 text-xs">
            {missMessage ??
              trf("citationNotFoundInPack", { citation: target.citation })}
          </p>
        </header>
        <div className="flex-1 overflow-auto px-4 py-3 text-xs leading-6 text-brand-muted">
          <p>{tr("possibleReasons")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{tr("citationMissReason1")}</li>
            <li>{tr("citationMissReason2")}</li>
            <li>{tr("citationMissReason3")}</li>
          </ul>
          <p className="mt-4">{tr("tryAnotherCitation")}</p>
        </div>
      </section>
    );
  }

  const activeHighlight = highlight ?? {
    char_start: target.char_start,
    char_end: target.char_end,
    snippet_en: target.snippet_en,
    paragraph: target.paragraph,
  };

  const isStandardFallback = target.paragraph_resolved === false;
  const paragraphSuffix = activeHighlight.paragraph
    ? trf("paragraphSuffix", { paragraph: activeHighlight.paragraph })
    : "";

  return (
    <section className={shellClass}>
      <header className={`border-b border-brand-border ${compact ? "px-4 py-3" : "px-5 py-3"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`font-semibold text-brand-ink ${compact ? "text-sm" : "text-xl"}`}>
                {heading}
              </h2>
              {(detail?.status ?? target.status) === "legacy" && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {detail?.legacy_label ?? tr("legacy")}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-brand-muted">
              {trf("citationLine", {
                citation: target.citation,
                paragraph: paragraphSuffix,
              })}
            </p>
          </div>
          {detail && (
            <button
              type="button"
              onClick={() => openOfficialUrl(detail.official_url)}
              className={`ui-btn-primary ui-focus-ring rounded-lg font-medium ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
            >
              {tr("viewOfficialSite")}
            </button>
          )}
        </div>

        {isStandardFallback && (
          <div className="ui-alert-info mt-4 rounded-lg px-4 py-3 text-sm">
            {trf("standardFallbackMessage", {
              citation: target.citation,
              standard: target.standard_id,
            })}
          </div>
        )}

        {(detail?.status ?? target.status) === "legacy" && (
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

        {activeHighlight.snippet_en && !isStandardFallback && (
          compact ? (
            <div className="mt-3 rounded-lg bg-brand-paper">
              <button
                type="button"
                onClick={() => setExcerptExpanded((prev) => !prev)}
                className="ui-focus-ring flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-brand-ink hover:bg-brand-hover/50"
                aria-label={excerptExpanded ? "Collapse excerpt" : "Expand excerpt"}
                aria-expanded={excerptExpanded}
              >
                <IconChevronDown
                  className={`h-4 w-4 shrink-0 text-brand-muted transition-transform ${excerptExpanded ? "rotate-180" : ""}`}
                />
                {excerptExpanded
                  ? trf("matchedExcerpt", { snippet: activeHighlight.snippet_en })
                  : activeHighlight.snippet_en.slice(0, 80).replace(/\n/g, " ") + "…"}
              </button>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-brand-paper px-4 py-3 text-sm text-brand-ink">
              {trf("matchedExcerpt", { snippet: activeHighlight.snippet_en })}
            </p>
          )
        )}
      </header>

      <BodySearchBar search={bodySearch} tr={tr} trf={trf} compact={compact} />

      <div
        ref={bodySearch.bodyRef}
        className={`flex-1 overflow-auto ${compact ? "px-4 py-3" : "px-5 py-4 sm:px-6 sm:py-5"}`}
      >
        {loading && <p className="text-sm text-brand-muted">{tr("loadingStandardText")}</p>}
        {error && <p className="ui-alert-error rounded-lg px-4 py-3 text-sm">{error}</p>}
        {!loading && !error && detail && (
          highlight && highlight.char_end > highlight.char_start ? (
            <HighlightedBody
              key={`${target.citation}-${highlight.char_start}-${highlight.char_end}`}
              body={detail.body}
              charStart={highlight.char_start}
              charEnd={highlight.char_end}
            />
          ) : (
            <MarkdownPreview key={target.citation} content={detail.body} />
          )
        )}
      </div>
    </section>
  );
}
