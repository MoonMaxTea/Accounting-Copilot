import { useEffect, useMemo, useState } from "react";
import { getStandard, openOfficialUrl } from "../api";
import { HighlightedBody } from "./HighlightedBody";
import { MarkdownPreview } from "./MarkdownPreview";
import type { CitationHighlight, CitationTarget, StandardDetail } from "../types";

interface EvidenceStandardPanelProps {
  target: CitationTarget | null;
  highlight: CitationHighlight | null;
  missMessage: string | null;
  onOpenSuperseded: (standardId: string) => void;
}

export function EvidenceStandardPanel({
  target,
  highlight,
  missMessage,
  onOpenSuperseded,
}: EvidenceStandardPanelProps) {
  const [detail, setDetail] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const standardId = target?.standard_id || null;
  const citationKey = target ? `${target.citation}:${target.char_start}:${target.char_end}` : null;

  useEffect(() => {
    if (!standardId || !target?.resolved) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getStandard(standardId)
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
  }, [standardId, target?.resolved, citationKey]);

  const heading = useMemo(() => {
    if (!detail && !target) {
      return "准则原文";
    }
    const active = detail;
    if (active?.title_zh) {
      return `${active.id} — ${active.title_zh}`;
    }
    if (active) {
      return `${active.id} — ${active.title}`;
    }
    return target?.standard_id || "准则原文";
  }, [detail, target]);

  if (!target) {
    return (
      <section className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">
        在左侧笔记中点击准则引用（如 IFRS 11 §7-8），这里会显示对应原文并高亮段落。
      </section>
    );
  }

  if (!target.resolved || missMessage) {
    return (
      <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
        <header className="border-b border-amber-200 bg-amber-50 px-5 py-4">
          <h2 className="text-lg font-semibold text-amber-950">未找到对应段落</h2>
          <p className="mt-2 text-sm text-amber-900">{missMessage ?? `未在本地 pack 找到引用：${target.citation}`}</p>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4 text-sm leading-6 text-slate-600">
          <p>可能原因：</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>IFRS/IAS 段落索引尚未覆盖该 § 号（ASC 引用通常更完整）</li>
            <li>content pack 版本与 Vault 知识库不一致</li>
            <li>引用写法与 pack 索引规则不匹配</li>
          </ul>
          <p className="mt-4">请继续点击其他引用，或到「设置」检查 content pack 是否为最新版本。</p>
        </div>
      </section>
    );
  }

  const activeHighlight = highlight ?? {
    char_start: target.char_start,
    char_end: target.char_end,
    snippet_en: target.snippet_en,
    paragraph: target.paragraph,
  };

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-900">{heading}</h2>
              {(detail?.status ?? target.status) === "legacy" && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                  {detail?.legacy_label ?? "旧准则"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              引用：{target.citation} · 段落 {activeHighlight.paragraph}
            </p>
          </div>
          {detail && (
            <button
              type="button"
              onClick={() => openOfficialUrl(detail.official_url)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              在官网验证 ↗
            </button>
          )}
        </div>

        {(detail?.status ?? target.status) === "legacy" && (
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

        {activeHighlight.snippet_en && (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            匹配片段：{activeHighlight.snippet_en}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto px-5 py-4 sm:px-6 sm:py-5">
        {loading && <p className="text-sm text-slate-500">正在加载准则正文…</p>}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {!loading && !error && detail && (
          highlight && highlight.char_end > highlight.char_start ? (
            <HighlightedBody
              key={`${target.citation}-${highlight.char_start}-${highlight.char_end}`}
              body={detail.body}
              charStart={highlight.char_start}
              charEnd={highlight.char_end}
            />
          ) : (
            <MarkdownPreview key={target.citation} content={detail.body} />
          )
        )}
      </div>
    </section>
  );
}
