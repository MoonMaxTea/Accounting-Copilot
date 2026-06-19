import { useMemo, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { MarkdownPreview } from "./MarkdownPreview";
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

function isResolved(scanResults: CitationScanResult[], citation: string): boolean {
  const normalized = citation.trim();
  return scanResults.some(
    (item) => item.citation === normalized && item.resolved,
  );
}

function CitationLink({
  citation,
  resolved,
  onCitationClick,
  children,
}: {
  citation: string;
  resolved: boolean;
  onCitationClick: (citation: string) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCitationClick(citation);
      }}
      className={[
        "inline rounded px-0.5 font-medium underline decoration-2 underline-offset-2",
        resolved
          ? "text-blue-700 decoration-blue-400 hover:bg-blue-50"
          : "text-amber-800 decoration-amber-400 hover:bg-amber-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function NotePanel({
  title,
  content,
  scanResults,
  loading,
  onCitationClick,
}: NotePanelProps) {
  const unresolved = useMemo(
    () => scanResults.filter((item) => !item.resolved),
    [scanResults],
  );

  const linkedContent = useMemo(() => injectCitationLinks(content), [content]);

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
              onCitationClick={onCitationClick}
            >
              {children}
            </CitationLink>
          );
        }

        // Obsidian vault links and other markdown links must not navigate away.
        return (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className="inline text-slate-600 underline decoration-dotted underline-offset-2"
            title="此链接仅在 Obsidian 中有效，请在 Evidence 中使用 IFRS/IAS/ASC 引用格式"
          >
            {children}
          </button>
        );
      },
    }),
    [onCitationClick, scanResults],
  );

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">点击正文中的准则引用，右侧将打开对应段落</p>
      </header>

      {unresolved.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-900">
          <p className="font-medium">以下引用未在本地 pack 中找到，请检查版本或到官网核对：</p>
          <ul className="mt-2 list-disc pl-5">
            {unresolved.map((item) => (
              <li key={item.citation}>{item.citation}</li>
            ))}
          </ul>
        </div>
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
        {loading && <p className="text-sm text-slate-500">正在加载笔记…</p>}
        {!loading && (
          <MarkdownPreview content={linkedContent} components={components} />
        )}
      </div>
    </section>
  );
}
