import { useEffect, useMemo, useState } from "react";
import { usePreferences } from "../context/PreferencesContext";
import { EvidenceStandardPanel } from "./EvidenceStandardPanel";
import { IconBook, IconChevronLeft, IconSparkles } from "./icons";
import {
  groupConversationRounds,
  roundKindLabel,
  truncatePreview,
  type ConversationRound,
} from "../lib/conversation";
import type { MessageKey } from "../lib/i18n";
import type {
  AiConversationTurn,
  CitationHighlight,
  CitationTarget,
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
  citationTarget: CitationTarget | null;
  highlight: CitationHighlight | null;
  missMessage: string | null;
  onOpenSuperseded: (standardId: string) => void;
}

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
  tr,
  trf,
  locale,
}: {
  round: ConversationRound;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  tr: (key: MessageKey) => string;
  trf: (key: MessageKey, vars: Record<string, string | number>) => string;
  locale: "en" | "zh";
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-brand-border">
      <button
        type="button"
        onClick={onToggle}
        className="ui-focus-ring flex w-full items-start gap-2 bg-brand-surface px-3 py-2 text-left hover:bg-brand-hover"
      >
        <span className="mt-1 text-caption text-brand-muted">{expanded ? "\u2212" : "+"}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-medium text-brand-ink">
            {trf("roundLabel", { n: index + 1 })}
            {" \u00b7 "}
            {roundKindLabel(round.kind, locale)}
            {" \u00b7 "}
            {formatTurnTime(round.timestamp_secs)}
          </span>
          <span className="mt-1 block text-xs leading-5 text-brand-muted">
            {expanded ? tr("collapse") : truncatePreview(round.userQuestion, 88)}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-brand-border bg-brand-paper px-3 py-2">
          <div className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2">
            <p className="mb-1 text-caption text-brand-muted">{tr("yourQuestion")}</p>
            <p className="whitespace-pre-wrap text-xs leading-5 text-brand-ink">
              {round.userQuestion}
            </p>
          </div>

          {round.steps.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-caption text-brand-muted">{tr("knowledgeBaseActivity")}</p>
              {round.steps.map((step, stepIndex) => (
                <div
                  key={`${step.timestamp_secs}-${stepIndex}`}
                  className={[
                    "rounded-lg px-3 py-2 text-xs leading-5",
                    step.kind === "tool" ? "ui-alert-info" : "ui-alert-success",
                  ].join(" ")}
                >
                  <p className="mb-1 text-caption text-brand-muted">
                    {step.kind === "tool" ? tr("packSearch") : tr("assistant")}
                    {" \u00b7 "}
                    {formatTurnTime(step.timestamp_secs)}
                  </p>
                  <p className="whitespace-pre-wrap">{step.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-brand-muted">{tr("noPackSearchActivity")}</p>
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
  citationTarget,
  highlight,
  missMessage,
  onOpenSuperseded,
}: EvidenceSidePanelProps) {
  const { tr, trf, locale } = usePreferences();
  const [activeTab, setActiveTab] = useState<SidePanelTab>("assistant");
  const [expandedRoundIds, setExpandedRoundIds] = useState<Set<string>>(new Set());

  const saveLocationLabel = selectedFolderRelative ?? tr("root");
  const isContinueMode = Boolean(selected);
  const submitLabel = generating
    ? isContinueMode
      ? tr("updatingNote")
      : tr("generating")
    : isContinueMode
      ? tr("sendFollowUp")
      : tr("generateProjectNote");

  const exampleQuestions = useMemo(
    () => [tr("exampleQ1"), tr("exampleQ2"), tr("exampleQ3")],
    [tr],
  );

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
      return trf("rounds", { title: selected.title, count: conversationRounds.length });
    }
    return trf("newConversation", { count: conversationRounds.length });
  }, [selected, conversationRounds.length, trf]);

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
      <div className="flex h-full w-10 shrink-0 flex-col items-center border-l border-brand-border bg-brand-surface py-3">
        <button
          type="button"
          title={tr("expandPanel")}
          onClick={() => onToggleCollapsed(false)}
          className="ui-focus-ring rounded-lg p-2 text-brand-muted hover:bg-brand-hover"
        >
          <IconChevronLeft className="h-4 w-4 rotate-180" />
        </button>
        <span className="mt-2 [writing-mode:vertical-rl] text-caption text-brand-muted">
          {tr("panel")}
        </span>
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-l border-brand-border bg-brand-surface">
      <header className="flex items-center justify-between border-b border-brand-border px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("assistant")}
            className={[
              "ui-focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
              activeTab === "assistant" ? "ui-tab-active" : "ui-tab-inactive",
            ].join(" ")}
          >
            <IconSparkles className="h-4 w-4" />
            {tr("assistant")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("standards")}
            className={[
              "ui-focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
              activeTab === "standards" ? "ui-tab-active" : "ui-tab-inactive",
            ].join(" ")}
          >
            <IconBook className="h-4 w-4" />
            {tr("standards")}
          </button>
        </div>
        <button
          type="button"
          title={tr("collapsePanel")}
          onClick={() => onToggleCollapsed(true)}
          className="ui-focus-ring rounded-lg p-2 text-brand-muted hover:bg-brand-hover"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
      </header>

      {activeTab === "assistant" ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          <p className="text-caption text-brand-muted">
            {isContinueMode
              ? tr("followUpOpenNote")
              : trf("newNoteSaveUnder", { folder: saveLocationLabel })}
          </p>

          <div className="flex max-h-[min(42vh,520px)] min-h-[160px] flex-col overflow-hidden rounded-lg border border-brand-border bg-brand-paper">
            <div className="flex items-center justify-between border-b border-brand-border px-3 py-2">
              <p className="text-xs font-medium text-brand-ink">{historyLabel}</p>
              {conversationRounds.length > 1 && (
                <button
                  type="button"
                  className="ui-focus-ring text-caption text-brand-muted hover:text-brand-ink"
                  onClick={() => {
                    if (expandedRoundIds.size === conversationRounds.length) {
                      setExpandedRoundIds(new Set());
                      return;
                    }
                    setExpandedRoundIds(new Set(conversationRounds.map((round) => round.id)));
                  }}
                >
                  {expandedRoundIds.size === conversationRounds.length
                    ? tr("collapseAll")
                    : tr("expandAll")}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {conversationRounds.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-brand-muted">{tr("noConversationYet")}</p>
                  <div className="flex flex-col gap-2">
                    {exampleQuestions.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => onExampleQuestion?.(example)}
                        className="ui-focus-ring rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-left text-xs text-brand-ink hover:bg-brand-hover"
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
                    tr={tr}
                    trf={trf}
                    locale={locale}
                  />
                ))
              )}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-brand-ink">
              {isContinueMode ? tr("followUp") : tr("question")}
            </span>
            <textarea
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              rows={3}
              placeholder={tr("questionPlaceholder")}
              className="ui-focus-ring w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-brand-ink">{tr("additionalFacts")}</span>
            <textarea
              value={facts}
              onChange={(event) => onFactsChange(event.target.value)}
              rows={2}
              placeholder={tr("factsPlaceholder")}
              className="ui-focus-ring w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            disabled={generating}
            onClick={handleSubmit}
            className="ui-focus-ring w-full rounded-lg bg-brand-ink dark:bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitLabel}
          </button>
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
