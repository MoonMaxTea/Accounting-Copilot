import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface HighlightedBodyProps {
  body: string;
  charStart: number;
  charEnd: number;
}

export function HighlightedBody({ body, charStart, charEnd }: HighlightedBodyProps) {
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
