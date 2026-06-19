import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownPreviewProps {
  content: string;
  components?: Components;
  className?: string;
}

export function MarkdownPreview({
  content,
  components,
  className,
}: MarkdownPreviewProps) {
  return (
    <div
      className={[
        "markdown-preview prose prose-slate max-w-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
