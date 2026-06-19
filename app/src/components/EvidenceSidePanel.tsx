import { useEffect, useMemo, useState } from "react";
import { EvidenceStandardPanel } from "./EvidenceStandardPanel";
import {
  groupConversationRounds,
  roundKindLabel,
  truncatePreview,
  type ConversationRound,
} from "../lib/conversation";
import type {
  AiConversationTurn,
  CitationHighlight,
  CitationTarget,
  GenerateProjectResult,
  ProjectFileEntry,
} from "../types";

interface EvidenceSidePanelProps {
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  selected: ProjectFileEntry | null;
  selectedFolderRelative: string | null;
  conversationTurns: AiConversationTurn[];
  question: string;
  facts: string;
  onQuestionChange: (value: string) => void;
  onFactsChange: (value: string) => void;
  generating: boolean;
  onGenerate: () => void;
  onContinue: () => void;
  lastResult: GenerateProjectResult | null;
  citationTarget: CitationTarget | null;
  highlight: CitationHighlight | null;
  missMessage: string | null;
  onOpenSuperseded: (standardId: string) => void;
}

function formatTurnTime(timestampSecs: number): string {
  return new Date(timestampSecs * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConversationRoundItem({
  round,
  index,
  expanded,
  onToggle,
}: {
  round: ConversationRound;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 bg-white px-3 py-2 text-left hover:bg-slate-50"
      >
        <span className="mt-0.5 text-[10px] text-slate-400">{expanded ? "▼" : "▶"}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-slate-700">
            第 {index + 1} 轮 · {roundKindLabel(round.kind)} ·{" "}
            {formatTurnTime(round.timestamp_secs)}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-600">
            {expanded ? "点击收起" : truncatePreview(round.userQuestion, 88)}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">你的问题</p>
            <p className="whitespace-pre-wrap text-xs leading-5 text-slate-800">
              {round.userQuestion}
            </p>
          </div>

          {round.steps.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">知识库检索</p>
              {round.steps.map((step, stepIndex) => (
                <div
                  key={`${step.timestamp_secs}-${stepIndex}`}
                  className={[
                    "rounded-lg px-3 py-2 text-xs leading-5",
                    step.kind === "tool"
                      ? "bg-sky-50 text-sky-950 ring-1 ring-sky-100"
                      : "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100",
                  ].join(" ")}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                    {step.kind === "tool" ? "知识库" : "AI"} ·{" "}
                    {formatTurnTime(step.timestamp_secs)}
                  </p>
                  <p className="whitespace-pre-wrap">{step.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">该轮暂无知识库检索记录。</p>
          )}
        </div>
      )}
    </div>
  );
}

export function EvidenceSidePanel({
  collapsed,
  onToggleCollapsed,
  selected,
  selectedFolderRelative,
  conversationTurns,
  question,
  facts,
  onQuestionChange,
  onFactsChange,
  generating,
  onGenerate,
  onContinue,
  lastResult,
  citationTarget,
  highlight,
  missMessage,
  onOpenSuperseded,
}: EvidenceSidePanelProps) {
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [standardOpen, setStandardOpen] = useState(true);
  const [expandedRoundIds, setExpandedRoundIds] = useState<Set<string>>(new Set());

  const saveLocationLabel = selectedFolderRelative ?? "根目录";
  const isContinueMode = Boolean(selected);
  const submitLabel = generating
    ? isContinueMode
      ? "正在更新笔记…"
      : "正在生成并保存…"
    : isContinueMode
      ? "提交追问并更新"
      : "生成项目笔记";

  const conversationRounds = useMemo(
    () => groupConversationRounds(conversationTurns),
    [conversationTurns],
  );

  const conversationScopeKey = selected?.relative_path ?? "__draft__";

  useEffect(() => {
    if (conversationRounds.length === 0) {
      setExpandedRoundIds(new Set());
      return;
    }
    const latest = conversationRounds[conversationRounds.length - 1];
    if (latest) {
      setExpandedRoundIds(new Set([latest.id]));
    }
  }, [conversationScopeKey, conversationRounds]);

  const handleSubmit = () => {
    if (isContinueMode) {
      onContinue();
      return;
    }
    onGenerate();
  };

  const historyLabel = useMemo(() => {
    if (selected) {
      return `「${selected.title}」对话记录（${conversationRounds.length} 轮）`;
    }
    return `新建对话（${conversationRounds.length} 轮）`;
  }, [selected, conversationRounds.length]);

  const toggleRound = (roundId: string) => {
    setExpandedRoundIds((current) => {
      const next = new Set(current);
      if (next.has(roundId)) {
        next.delete(roundId);
      } else {
        next.add(roundId);
      }
      return next;
    });
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-3">
        <button
          type="button"
          title="展开功能区"
          onClick={() => onToggleCollapsed(false)}
          className="rounded-lg px-2 py-3 text-xs text-slate-600 hover:bg-slate-100"
        >
          ◀
        </button>
        <span className="mt-2 [writing-mode:vertical-rl] text-xs text-slate-400">
          AI · 准则
        </span>
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">功能区</h2>
          <p className="text-xs text-slate-500">AI 对话 · 准则对照</p>
        </div>
        <button
          type="button"
          title="折叠功能区，扩大笔记区域"
          onClick={() => onToggleCollapsed(true)}
          className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          折叠 ▶
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <section className="border-b border-slate-100">
          <button
            type="button"
            onClick={() => setAssistantOpen((current) => !current)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <span>AI 助手</span>
            <span className="text-xs text-slate-400">{assistantOpen ? "收起" : "展开"}</span>
          </button>
          {assistantOpen && (
            <div className="space-y-3 px-4 pb-4">
              <p className="text-xs leading-5 text-slate-500">
                {isContinueMode
                  ? `在当前笔记基础上追问，将更新同一文件。`
                  : `将在「${saveLocationLabel}」下新建项目笔记。先在左侧选中保存文件夹。`}
              </p>

              <div className="flex max-h-[min(42vh,520px)] min-h-[160px] flex-col overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-100">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <p className="text-xs font-medium text-slate-700">{historyLabel}</p>
                  {conversationRounds.length > 1 && (
                    <button
                      type="button"
                      className="text-[11px] text-slate-500 hover:text-slate-800"
                      onClick={() => {
                        if (expandedRoundIds.size === conversationRounds.length) {
                          setExpandedRoundIds(new Set());
                          return;
                        }
                        setExpandedRoundIds(new Set(conversationRounds.map((round) => round.id)));
                      }}
                    >
                      {expandedRoundIds.size === conversationRounds.length ? "全部收起" : "全部展开"}
                    </button>
                  )}
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                  {conversationRounds.length === 0 ? (
                    <p className="text-xs text-slate-500">暂无历史问题，在下方输入开始对话。</p>
                  ) : (
                    conversationRounds.map((round, index) => (
                      <ConversationRoundItem
                        key={round.id}
                        round={round}
                        index={index}
                        expanded={expandedRoundIds.has(round.id)}
                        onToggle={() => toggleRound(round.id)}
                      />
                    ))
                  )}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">
                  {isContinueMode ? "追问" : "你的问题"}
                </span>
                <textarea
                  value={question}
                  onChange={(event) => onQuestionChange(event.target.value)}
                  rows={3}
                  placeholder={
                    isContinueMode
                      ? "例如：若其中一方有 veto 权但不参与日常经营，结论会变吗？"
                      : "例如：50:50 持股的合营安排应如何判断？"
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900 focus:ring-2"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">补充事实（可选）</span>
                <textarea
                  value={facts}
                  onChange={(event) => onFactsChange(event.target.value)}
                  rows={2}
                  placeholder="例如：A 与 B 各持股 50%，重大决策需双方一致同意…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900 focus:ring-2"
                />
              </label>

              <button
                type="button"
                disabled={generating}
                onClick={handleSubmit}
                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
              >
                {submitLabel}
              </button>

              {lastResult && lastResult.validation.warnings.length > 0 && (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <p className="font-medium">校验警告（文件已保存）：</p>
                  <ul className="mt-1 list-disc pl-4">
                    {lastResult.validation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <button
            type="button"
            onClick={() => setStandardOpen((current) => !current)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <span>准则原文</span>
            <span className="text-xs text-slate-400">{standardOpen ? "收起" : "展开"}</span>
          </button>
          {standardOpen && (
            <div className="min-h-[min(50vh,520px)] border-t border-slate-100">
              <EvidenceStandardPanel
                target={citationTarget}
                highlight={highlight}
                missMessage={missMessage}
                onOpenSuperseded={onOpenSuperseded}
                compact
              />
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
