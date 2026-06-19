import { useMemo, useState, type ReactNode } from "react";
import type { Components } from "react-markdown";
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
  scanResults,
  onCitationClick,
  children,
}: {
  citation: string;
  resolved: boolean;
  scanResults: CitationScanResult[];
  onCitationClick: (citation: string) => void;
  children: ReactNode;
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
          resolved
            ? "text-blue-700 decoration-blue-400 hover:bg-blue-50"
            : "text-amber-800 decoration-amber-400 hover:bg-amber-50",
        ].join(" ")}
      >
        {children}
      </button>
      {hoverOpen && (
        <span className="absolute bottom-full left-0 z-20 mb-2 block w-72 rounded-xl bg-slate-900 px-3 py-2 text-left text-xs leading-5 text-white shadow-lg">
          <span className="block font-medium">{citation}</span>
          <span className="mt-1 block text-slate-200">
            {preview
              ? preview.length > 180
                ? `${preview.slice(0, 180)}…`
                : preview
              : resolved
                ? "悬停预览暂不可用，点击可在右侧打开段落。"
                : "未在本地 pack 中找到此引用。"}
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
  const { frontmatter, body } = useMemo(
    () => parseNoteFrontmatter(content),
    [content],
  );

  const unresolved = useMemo(
    () => scanResults.filter((item) => !item.resolved),
    [scanResults],
  );

  const linkedContent = useMemo(() => injectCitationLinks(body), [body]);

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
              scanResults={scanResults}
              onCitationClick={onCitationClick}
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
        <details className="group border-b border-amber-200 bg-amber-50">
          <summary className="cursor-pointer list-none px-5 py-2.5 text-sm font-medium text-amber-900 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="text-xs text-amber-700 transition group-open:rotate-90">▶</span>
              {unresolved.length} 处引用未在本地 pack 中找到（点击展开）
            </span>
          </summary>
          <div className="border-t border-amber-200 px-5 py-2.5 text-sm text-amber-900">
            <p className="mb-2 text-xs text-amber-800">
              这些引用可能来自知识库全文检索；桌面版 pack 尚未索引到对应段落，或需更新 content pack。
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {unresolved.map((item) => (
                <li key={item.citation}>
                  <button
                    type="button"
                    className="text-left underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
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
        {loading && <p className="text-sm text-slate-500">正在加载笔记…</p>}
        {!loading && (
          <>
            {frontmatter && <NoteMetadata metadata={frontmatter} />}
            <MarkdownPreview content={linkedContent} components={components} />
          </>
        )}
      </div>
    </section>
  );
}
