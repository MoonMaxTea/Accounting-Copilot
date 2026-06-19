import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { injectCitationLinks } from "../lib/citations";
import type { CitationScanResult } from "../types";

interface NotePanelProps {
  title: string;
  content: string;
  scanResults: CitationScanResult[];
  loading: boolean;
  onCitationClick: (citation: string) => void;
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
        if (href?.startsWith("citation:")) {
          const citation = decodeURIComponent(href.slice("citation:".length));
          const resolved = scanResults.find((item) => item.citation === citation)?.resolved;
          return (
            <button
              type="button"
              onClick={() => onCitationClick(citation)}
              className={[
                "rounded px-1 font-medium underline decoration-2 underline-offset-2",
                resolved
                  ? "text-blue-700 decoration-blue-400 hover:bg-blue-50"
                  : "text-amber-800 decoration-amber-400 hover:bg-amber-50",
              ].join(" ")}
            >
              {children}
            </button>
          );
        }
        return (
          <a href={href} className="text-blue-700 underline">
            {children}
          </a>
        );
      },
    }),
    [onCitationClick, scanResults],
  );

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">点击正文中的准则引用，右侧将打开对应段落</p>
      </header>

      {unresolved.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
          <p className="font-medium">以下引用未在本地 pack 中找到，请检查版本或到官网核对：</p>
          <ul className="mt-2 list-disc pl-5">
            {unresolved.map((item) => (
              <li key={item.citation}>{item.citation}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading && <p className="text-sm text-slate-500">正在加载笔记…</p>}
        {!loading && (
          <div className="markdown-body prose prose-slate max-w-none text-slate-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {linkedContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}

interface HighlightedBodyProps {
  body: string;
  charStart: number;
  charEnd: number;
}

function HighlightedBody({ body, charStart, charEnd }: HighlightedBodyProps) {
  const highlightRef = useRef<HTMLSpanElement>(null);
  const safeStart = Math.max(0, Math.min(charStart, body.length));
  const safeEnd = Math.max(safeStart, Math.min(charEnd, body.length));
  const before = body.slice(0, safeStart);
  const highlight = body.slice(safeStart, safeEnd);
  const after = body.slice(safeEnd);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [charStart, charEnd, body]);

  return (
    <div className="markdown-body prose prose-slate max-w-none text-slate-800">
      {before && <ReactMarkdown remarkPlugins={[remarkGfm]}>{before}</ReactMarkdown>}
      <span
        ref={highlightRef}
        id="citation-highlight"
        className="block rounded-xl bg-yellow-100 px-3 py-2 ring-2 ring-yellow-400"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{highlight || " "}</ReactMarkdown>
      </span>
      {after && <ReactMarkdown remarkPlugins={[remarkGfm]}>{after}</ReactMarkdown>}
    </div>
  );
}

export { HighlightedBody };
