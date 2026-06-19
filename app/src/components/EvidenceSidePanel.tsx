import { useEffect, useMemo, useState } from "react";
import { EvidenceStandardPanel } from "./EvidenceStandardPanel";
import { IconBook, IconChevronLeft, IconSparkles } from "./icons";
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

type SidePanelTab = "assistant" | "standards";

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
  onExampleQuestion?: (value: string) => void;
  lastResult: GenerateProjectResult | null;
  citationTarget: CitationTarget | null;
  highlight: CitationHighlight | null;
  missMessage: string | null;
  onOpenSuperseded: (standardId: string) => void;
}

const EXAMPLE_QUESTIONS = [
  "How should we classify a 50:50 joint arrangement?",
  "When does ASC 842 require a lease liability?",
  "What are the IFRS 15 performance obligations in a bundled SaaS contract?",
];

function formatTurnTime(timestampSecs: number): string {
  return new Date(timestampSecs * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
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
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="ui-focus-ring flex w-full items-start gap-2 bg-white px-3 py-2 text-left hover:bg-slate-50"
      >
        <span className="mt-1 text-caption text-slate-400">{expanded ? "−" : "+"}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-medium text-slate-700">
            Round {index + 1} · {roundKindLabel(round.kind)} · {formatTurnTime(round.timestamp_secs)}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-600">
            {expanded ? "Collapse" : truncatePreview(round.userQuestion, 88)}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="mb-1 text-caption text-slate-500">Your question</p>
            <p className="whitespace-pre-wrap text-xs leading-5 text-slate-800">
              {round.userQuestion}
            </p>
          </div>

          {round.steps.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-caption text-slate-500">Knowledge base activity</p>
              {round.steps.map((step, stepIndex) => (
                <div
                  key={`${step.timestamp_secs}-${stepIndex}`}
                  className={[
                    "rounded-lg px-3 py-2 text-xs leading-5",
                    step.kind === "tool"
                      ? "border border-sky-100 bg-sky-50 text-sky-950"
                      : "border border-emerald-100 bg-emerald-50 text-emerald-950",
                  ].join(" ")}
                >
                  <p className="mb-1 text-caption text-slate-500">
                    {step.kind === "tool" ? "Pack search" : "Assistant"} ·{" "}
                    {formatTurnTime(step.timestamp_secs)}
                  </p>
                  <p className="whitespace-pre-wrap">{step.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No pack search activity recorded for this round.</p>
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
  onExampleQuestion,
  lastResult,
  citationTarget,
  highlight,
  missMessage,
  onOpenSuperseded,
}: EvidenceSidePanelProps) {
  const [activeTab, setActiveTab] = useState<SidePanelTab>("assistant");
  const [expandedRoundIds, setExpandedRoundIds] = useState<Set<string>>(new Set());

  const saveLocationLabel = selectedFolderRelative ?? "Root";
  const isContinueMode = Boolean(selected);
  const submitLabel = generating
    ? isContinueMode
      ? "Updating note…"
      : "Generating…"
    : isContinueMode
      ? "Send follow-up"
      : "Generate project note";

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

  useEffect(() => {
    if (citationTarget?.resolved) {
      setActiveTab("standards");
    }
  }, [citationTarget?.resolved, citationTarget?.standard_id]);

  const handleSubmit = () => {
    if (isContinueMode) {
      onContinue();
      return;
    }
    onGenerate();
  };

  const historyLabel = useMemo(() => {
    if (selected) {
      return `${selected.title} · ${conversationRounds.length} rounds`;
    }
    return `New conversation · ${conversationRounds.length} rounds`;
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
          title="Expand panel"
          onClick={() => onToggleCollapsed(false)}
          className="ui-focus-ring rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <IconChevronLeft className="h-4 w-4 rotate-180" />
        </button>
        <span className="mt-2 [writing-mode:vertical-rl] text-caption text-slate-400">Panel</span>
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("assistant")}
            className={[
              "ui-focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
              activeTab === "assistant"
                ? "bg-sky-50 text-sky-950"
                : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            <IconSparkles className="h-4 w-4" />
            Assistant
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("standards")}
            className={[
              "ui-focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
              activeTab === "standards"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            <IconBook className="h-4 w-4" />
            Standards
          </button>
        </div>
        <button
          type="button"
          title="Collapse panel"
          onClick={() => onToggleCollapsed(true)}
          className="ui-focus-ring rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
      </header>

      {activeTab === "assistant" ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          <p className="text-caption text-slate-500">
            {isContinueMode
              ? "Follow up on the open note. The same file will be updated."
              : `A new note will be saved under ${saveLocationLabel}. Select a folder on the left first.`}
          </p>

          <div className="flex max-h-[min(42vh,520px)] min-h-[160px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-medium text-slate-700">{historyLabel}</p>
              {conversationRounds.length > 1 && (
                <button
                  type="button"
                  className="ui-focus-ring text-caption text-slate-500 hover:text-slate-800"
                  onClick={() => {
                    if (expandedRoundIds.size === conversationRounds.length) {
                      setExpandedRoundIds(new Set());
                      return;
                    }
                    setExpandedRoundIds(new Set(conversationRounds.map((round) => round.id)));
                  }}
                >
                  {expandedRoundIds.size === conversationRounds.length ? "Collapse all" : "Expand all"}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {conversationRounds.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">No conversation yet. Try one of these prompts:</p>
                  <div className="flex flex-col gap-2">
                    {EXAMPLE_QUESTIONS.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => onExampleQuestion?.(example)}
                        className="ui-focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
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
              {isContinueMode ? "Follow-up" : "Question"}
            </span>
            <textarea
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              rows={3}
              placeholder="e.g. How should a 50:50 joint arrangement be classified?"
              className="ui-focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Additional facts (optional)</span>
            <textarea
              value={facts}
              onChange={(event) => onFactsChange(event.target.value)}
              rows={2}
              placeholder="e.g. Both parties hold 50% and major decisions require unanimous consent."
              className="ui-focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            disabled={generating}
            onClick={handleSubmit}
            className="ui-focus-ring w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {submitLabel}
          </button>

          {lastResult && lastResult.validation.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p className="font-medium">Validation warnings (file saved):</p>
              <ul className="mt-1 list-disc pl-4">
                {lastResult.validation.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <EvidenceStandardPanel
            target={citationTarget}
            highlight={highlight}
            missMessage={missMessage}
            onOpenSuperseded={onOpenSuperseded}
            compact
          />
        </div>
      )}
    </aside>
  );
}
