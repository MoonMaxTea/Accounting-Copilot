import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getStandard, openOfficialUrl } from "../api";
import type { StandardDetail, StandardSummary } from "../types";

interface StandardDetailPanelProps {
  summary: StandardSummary | null;
  onOpenSuperseded: (standardId: string) => void;
}

export function StandardDetailPanel({
  summary,
  onOpenSuperseded,
}: StandardDetailPanelProps) {
  const [detail, setDetail] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!summary) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getStandard(summary.id)
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
  }, [summary]);

  const heading = useMemo(() => {
    if (!detail && !summary) {
      return "选择一条准则";
    }
    const active = detail ?? summary;
    if (!active) {
      return "选择一条准则";
    }
    return active.title_zh ? `${active.id} — ${active.title_zh}` : `${active.id} — ${active.title}`;
  }, [detail, summary]);

  if (!summary) {
    return (
      <section className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">
        从左侧列表选择一条准则，正文会显示在这里。
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-900">{heading}</h2>
              {(detail?.status ?? summary.status) === "legacy" && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                  {detail?.legacy_label ?? summary.legacy_label ?? "旧准则"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">{summary.framework}</p>
          </div>
          <button
            type="button"
            onClick={() => openOfficialUrl(summary.official_url)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            在官网查看原文 ↗
          </button>
        </div>

        {(detail?.status ?? summary.status) === "legacy" && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            此准则已废止，仅供对照。
            {detail?.effective_until && (
              <span className="ml-1">废止日期：{detail.effective_until}</span>
            )}
            {detail?.superseded_by && (
              <button
                type="button"
                onClick={() => onOpenSuperseded(detail.superseded_by!)}
                className="ml-2 font-medium underline"
              >
                查看取代准则 {detail.superseded_by}
              </button>
            )}
          </div>
        )}

        {detail?.official_url_note && (
          <p className="mt-3 text-sm text-slate-500">{detail.official_url_note}</p>
        )}
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading && <p className="text-sm text-slate-500">正在加载正文…</p>}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {!loading && !error && detail && (
          <div className="markdown-body prose prose-slate max-w-none text-slate-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.body}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}
