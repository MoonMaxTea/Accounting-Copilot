import { lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const MermaidBlock = lazy(() =>
  import("./MermaidBlock").then((mod) => ({ default: mod.MermaidBlock })),
);

interface MarkdownPreviewProps {
  content: string;
  components?: Components;
  className?: string;
}

function MermaidFallback() {
  return (
    <div className="my-4 flex items-center justify-center rounded-lg border border-brand-border bg-brand-paper p-4 text-sm text-brand-muted">
      Loading diagram…
    </div>
  );
}

const defaultComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match?.[1];
    const codeString = String(children).replace(/\n$/, "");

    if (language === "mermaid" && typeof codeString === "string" && codeString.trim()) {
      return (
        <Suspense fallback={<MermaidFallback />}>
          <MermaidBlock chart={codeString.trim()} />
        </Suspense>
      );
    }

    // Default code block rendering
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export function MarkdownPreview({
  content,
  components,
  className,
}: MarkdownPreviewProps) {
  // Merge user-provided components with defaults (user wins for non-code, or for code too)
  const merged: Components = {
    ...defaultComponents,
    ...components,
    code: components?.code ?? defaultComponents.code,
  };

  return (
    <div
      className={[
        "markdown-preview max-w-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={merged}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
