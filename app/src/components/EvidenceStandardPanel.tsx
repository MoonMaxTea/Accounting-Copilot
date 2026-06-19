import { useEffect, useMemo, useState } from "react";
import { getStandard, openOfficialUrl } from "../api";
import { HighlightedBody } from "./HighlightedBody";
import { MarkdownPreview } from "./MarkdownPreview";
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
  const [detail, setDetail] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const standardId = target?.standard_id || null;
  const citationKey = target ? `${target.citation}:${target.char_start}:${target.char_end}` : null;

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
      return "Standard text";
    }
    const active = detail;
    if (active?.title_zh) {
      return `${active.id} — ${active.title_zh}`;
    }
    if (active) {
      return `${active.id} — ${active.title}`;
    }
    return target?.standard_id || "Standard text";
  }, [detail, target]);

  const shellClass = compact
    ? "flex h-full min-h-[240px] flex-col overflow-hidden bg-white"
    : "flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm";

  if (!target) {
    return (
      <section className={`${shellClass} ${compact ? "items-center justify-center p-6" : "items-center justify-center rounded-lg border border-dashed border-slate-300 p-8"} text-slate-500`}>
        <p className="text-sm leading-6">
          Click a standard citation in your note (e.g. IFRS 11 §7-8) to view the matching text
          from the content pack here.
        </p>
      </section>
    );
  }

  if (!target.resolved || missMessage) {
    return (
      <section className={`${shellClass} ${compact ? "" : "border-amber-200"}`}>
        <header className={`border-b px-4 py-3 ${compact ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50 px-5 py-4"}`}>
          <h2 className={`font-semibold text-amber-950 ${compact ? "text-sm" : "text-lg"}`}>Paragraph not found</h2>
          <p className="mt-1 text-xs text-amber-900">{missMessage ?? `Citation not found in local pack: ${target.citation}`}</p>
        </header>
        <div className="flex-1 overflow-auto px-4 py-3 text-xs leading-6 text-slate-600">
          <p>Possible reasons:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The IFRS/IAS paragraph index may not cover this § number (ASC citations are usually more complete)</li>
            <li>The content pack version may differ from your Vault knowledge base</li>
            <li>The citation format may not match the pack indexing rules</li>
          </ul>
          <p className="mt-4">Try another citation, or check Settings to confirm your content pack is up to date.</p>
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

  return (
    <section className={shellClass}>
      <header className={`border-b border-slate-200 ${compact ? "px-4 py-3" : "px-5 py-3"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`font-semibold text-slate-900 ${compact ? "text-sm" : "text-xl"}`}>{heading}</h2>
              {(detail?.status ?? target.status) === "legacy" && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                  {detail?.legacy_label ?? "Legacy"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Citation: {target.citation}
              {activeHighlight.paragraph ? ` · Paragraph ${activeHighlight.paragraph}` : ""}
            </p>
          </div>
          {detail && (
            <button
              type="button"
              onClick={() => openOfficialUrl(detail.official_url)}
              className={`ui-focus-ring rounded-lg bg-slate-900 font-medium text-white transition hover:bg-slate-700 ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
            >
              Official site ↗
            </button>
          )}
        </div>

        {isStandardFallback && (
          <div className="mt-4 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-950">
            Could not locate paragraph &ldquo;{target.citation}&rdquo;. Showing full text of{" "}
            <strong>{target.standard_id}</strong> instead. When drafting notes with AI, use citation
            formats the pack can resolve.
          </div>
        )}

        {(detail?.status ?? target.status) === "legacy" && (
          <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This standard has been superseded and is shown for reference only.
            {detail?.effective_until && (
              <span className="ml-1">Superseded on: {detail.effective_until}</span>
            )}
            {detail?.superseded_by && (
              <button
                type="button"
                onClick={() => onOpenSuperseded(detail.superseded_by!)}
                className="ui-focus-ring ml-2 font-medium underline"
              >
                View replacement {detail.superseded_by}
              </button>
            )}
          </div>
        )}

        {activeHighlight.snippet_en && !isStandardFallback && (
          <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Matched excerpt: {activeHighlight.snippet_en}
          </p>
        )}
      </header>

      <div className={`flex-1 overflow-auto ${compact ? "px-4 py-3" : "px-5 py-4 sm:px-6 sm:py-5"}`}>
        {loading && <p className="text-sm text-slate-500">Loading standard text…</p>}
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
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
