import { useEffect, useRef } from "react";
import { MarkdownPreview } from "./MarkdownPreview";

interface HighlightedBodyProps {
  body: string;
  charStart: number;
  charEnd: number;
}

export function HighlightedBody({ body, charStart, charEnd }: HighlightedBodyProps) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const safeStart = Math.max(0, Math.min(charStart, body.length));
  const safeEnd = Math.max(safeStart, Math.min(charEnd, body.length));
  const before = body.slice(0, safeStart);
  const highlight = body.slice(safeStart, safeEnd);
  const after = body.slice(safeEnd);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [charStart, charEnd, body]);

  return (
    <div className="markdown-preview">
      {before && <MarkdownPreview content={before} />}
      <div ref={highlightRef} id="citation-highlight" className="markdown-preview-highlight">
        <MarkdownPreview content={highlight || " "} />
      </div>
      {after && <MarkdownPreview content={after} />}
    </div>
  );
}
