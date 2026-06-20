import { useMemo, useState, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { usePreferences } from "../context/PreferencesContext";
import { parseNoteFrontmatter } from "../lib/markdown";
import { MarkdownPreview } from "./MarkdownPreview";
import { NoteMetadata } from "./NoteMetadata";
import {
  citationFromKey,
  injectCitationLinks,
  parseCitation,
} from "../lib/citations";
import type { CitationScanResult } from "../types";

interface NotePanelProps {
  title: string;
  content: string;
  scanResults: CitationScanResult[];
  loading: boolean;
  onCitationClick: (citation: string) => void;
}

function citationFromHref(href: string | undefined): string | null {
  if (!href) {
    return null;
  }
  if (href.startsWith("#asd-cite-")) {
    return citationFromKey(href.slice("#asd-cite-".length));
  }
  if (href.startsWith("citation:")) {
    return citationFromKey(href.slice("citation:".length));
  }
  return null;
}

function citationFromLinkLabel(label: string): string | null {
  const parsed = parseCitation(label);
  return parsed ? label.trim() : null;
}

function isParagraphResolved(scanResults: CitationScanResult[], citation: string): boolean {
  const normalized = citation.trim();
  const match = scanResults.find((item) => item.citation === normalized);
  return match?.target?.paragraph_resolved !== false;
}

function isResolved(scanResults: CitationScanResult[], citation: string): boolean {
  const normalized = citation.trim();
  return scanResults.some(
    (item) => item.citation === normalized && item.resolved,
  );
}

function citationTarget(scanResults: CitationScanResult[], citation: string): CitationScanResult | null {
  const normalized = citation.trim();
  return scanResults.find((item) => item.citation === normalized) ?? null;
}

function CitationLink({
  citation,
  resolved,
  paragraphResolved,
  scanResults,
  onCitationClick,
  children,
  tr,
}: {
  citation: string;
  resolved: boolean;
  paragraphResolved: boolean;
  scanResults: CitationScanResult[];
  onCitationClick: (citation: string) => void;
  children: ReactNode;
  tr: (key: import("../lib/i18n").MessageKey) => string;
}) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const scan = citationTarget(scanResults, citation);
  const preview = scan?.target?.snippet_en?.trim();

  return (
    <span
      className="relative inline"
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onCitationClick(citation);
        }}
        className={[
          "inline rounded px-0.5 font-medium underline decoration-2 underline-offset-2",
          !resolved
            ? "text-amber-800 decoration-amber-400 hover:bg-amber-50"
            : paragraphResolved
              ? "text-blue-700 decoration-blue-400 hover:bg-blue-50"
              : "text-violet-700 decoration-violet-400 hover:bg-violet-50",
        ].join(" ")}
      >
        {children}
      </button>
      {hoverOpen && (
        <span className="ui-tooltip absolute bottom-full left-0 z-20 mb-2 block w-72 rounded-lg bg-brand-ink px-3 py-2 text-left text-xs leading-5 text-white shadow-lg dark:bg-brand-accent">
          <span className="block font-medium">{citation}</span>
          <span className="mt-1 block text-white/80">
            {preview
              ? preview.length > 180
                ? `${preview.slice(0, 180)}�`
                : preview
              : resolved
                ? paragraphResolved
                  ? tr("citationHoverResolved")
                  : tr("citationHoverParagraphMissing")
                : tr("citationHoverUnresolved")}
          </span>
        </span>
      )}
    </span>
  );
}

export function NotePanel({
  title,
  content,
  scanResults,
  loading,
  onCitationClick,
}: NotePanelProps) {
  const { tr, trf } = usePreferences();

  const { frontmatter, body } = useMemo(
    () => parseNoteFrontmatter(content),
    [content],
  );

  const unresolved = useMemo(
    () => scanResults.filter((item) => !item.resolved),
    [scanResults],
  );

  const linkedContent = useMemo(() => injectCitationLinks(body), [body]);
  const isContentEmpty = !body.trim();

  const exampleNotePrompts = useMemo(
    () => [tr("exampleNote1"), tr("exampleNote2"), tr("exampleNote3")],
    [tr],
  );

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const fromHref = citationFromHref(href);
        const label = String(children);
        const citation = fromHref ?? citationFromLinkLabel(label);

        if (citation) {
          return (
            <CitationLink
              citation={citation}
              resolved={isResolved(scanResults, citation)}
              paragraphResolved={isParagraphResolved(scanResults, citation)}
              scanResults={scanResults}
              onCitationClick={onCitationClick}
              tr={tr}
            >
              {children}
            </CitationLink>
          );
        }

        return (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className="inline text-brand-muted underline decoration-dotted underline-offset-2"
            title={tr("obsidianLinkHint")}
          >
            {children}
          </button>
        );
      },
    }),
    [onCitationClick, scanResults, tr],
  );

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-brand-border bg-brand-surface shadow-sm">
      <header className="border-b border-brand-border px-5 py-3">
        <h2 className="text-base font-semibold text-brand-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-brand-muted">{tr("noteCitationHint")}</p>
      </header>

      {unresolved.length > 0 && (
        <details className="group ui-alert-warning border-x-0 border-t-0">
          <summary className="cursor-pointer list-none px-5 py-2.5 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="text-xs transition group-open:rotate-90">?</span>
              {trf("unresolvedCitations", { count: unresolved.length })}
            </span>
          </summary>
          <div className="border-t border-amber-200 px-5 py-2.5 text-sm dark:border-amber-900">
            <p className="mb-2 text-xs opacity-90">{tr("unresolvedCitationsHint")}</p>
            <ul className="list-disc space-y-1 pl-5">
              {unresolved.map((item) => (
                <li key={item.citation}>
                  <button
                    type="button"
                    className="ui-focus-ring text-left underline decoration-amber-400 underline-offset-2 hover:opacity-90"
                    onClick={() => onCitationClick(item.citation)}
                  >
                    {item.citation}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <div
        className="flex-1 overflow-auto px-5 py-4 sm:px-6 sm:py-5"
        onClickCapture={(event) => {
          const anchor = (event.target as HTMLElement).closest("a");
          if (anchor) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {loading && <p className="text-sm text-brand-muted">{tr("loadingNote")}</p>}
        {!loading && isContentEmpty && (
          <div className="space-y-2">
            <p className="text-sm text-brand-muted">{tr("noNoteContent")}</p>
            <div className="flex flex-col gap-2">
              {exampleNotePrompts.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="ui-focus-ring rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-left text-xs text-brand-ink hover:bg-brand-hover"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {!loading && !isContentEmpty && (
          <>
            {frontmatter && <NoteMetadata metadata={frontmatter} />}
            <MarkdownPreview content={linkedContent} components={components} />
          </>
        )}
      </div>
    </section>
  );
}
