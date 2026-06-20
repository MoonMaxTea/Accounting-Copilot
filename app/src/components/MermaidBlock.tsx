import { useEffect, useId, useRef, useState } from "react";

interface MermaidBlockProps {
  chart: string;
}

let mermaidReady = false;
let mermaidPromise: Promise<void> | null = null;

function ensureMermaid(): Promise<void> {
  if (mermaidReady) return Promise.resolve();
  if (mermaidPromise) return mermaidPromise;

  mermaidPromise = import("mermaid").then((mermaid) => {
    mermaid.default.initialize({
      startOnLoad: false,
      theme: document.documentElement.classList.contains("dark")
        ? "dark"
        : "default",
      securityLevel: "loose",
      // Never render error messages into the DOM — we handle errors
      // silently by falling back to a plain code block.
      suppressErrorRendering: true,
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
      },
    });
    mermaidReady = true;
  });

  return mermaidPromise;
}

/**
 * Sanitize mermaid chart text to avoid common syntax errors:
 * - Replace fullwidth colons that confuse the parser
 * - Normalize line endings
 */
function sanitizeChart(chart: string): string {
  return chart
    .replace(/：/g, ":")   // fullwidth colon → ASCII
    .replace(/？/g, "?")   // fullwidth question mark
    .replace(/（/g, "(")   // fullwidth paren
    .replace(/）/g, ")")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export function MermaidBlock({ chart }: MermaidBlockProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const safeChart = sanitizeChart(chart);

    ensureMermaid()
      .then(() => import("mermaid"))
      .then(async (mermaid) => {
        if (cancelled) return;

        try {
          const { svg: rendered } = await mermaid.default.render(
            `mermaid-${id.replace(/:/g, "-")}`,
            safeChart,
          );
          if (!cancelled) {
            // Some mermaid versions render an error SVG instead of throwing.
            // Detect and treat these as failures.
            const hasError = /Syntax error|Parse error|Lexical error|Unsupported/i.test(rendered);
            if (hasError) {
              setSvg(null);
              setFailed(true);
            } else {
              setSvg(rendered);
              setFailed(false);
            }
          }
        } catch (_caught) {
          if (!cancelled) {
            setSvg(null);
            setFailed(true);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart, id, renderKey]);

  // Re-render on theme change
  useEffect(() => {
    const observer = new MutationObserver(() => {
      mermaidReady = false;
      mermaidPromise = null;
      setRenderKey((prev) => prev + 1);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // When rendering fails, silently fall back to a plain code block
  if (failed) {
    return (
      <div className="my-4 overflow-auto rounded-lg border border-brand-border bg-brand-paper p-4">
        <pre className="text-xs leading-relaxed text-brand-muted whitespace-pre-wrap">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-block my-5 flex justify-center overflow-x-auto rounded-xl border border-brand-border bg-brand-paper p-4"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
