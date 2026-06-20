import type { AiConversationTurn } from "../types";

export interface ConversationRound {
  id: string;
  kind: "create" | "continue";
  timestamp_secs: number;
  userQuestion: string;
  steps: AiConversationTurn[];
}

function isUserRoundTurn(turn: AiConversationTurn): boolean {
  return turn.role === "user" && (turn.kind === "create" || turn.kind === "continue");
}

export function groupConversationRounds(turns: AiConversationTurn[]): ConversationRound[] {
  const rounds: ConversationRound[] = [];
  let current: ConversationRound | null = null;

  for (const turn of turns) {
    if (isUserRoundTurn(turn)) {
      if (current) {
        rounds.push(current);
      }
      current = {
        id: `${turn.timestamp_secs}-${rounds.length}`,
        kind: turn.kind === "create" ? "create" : "continue",
        timestamp_secs: turn.timestamp_secs,
        userQuestion: turn.content,
        steps: [],
      };
      continue;
    }

    if (current) {
      current.steps.push(turn);
    }
  }

  if (current) {
    rounds.push(current);
  }

  return rounds;
}

export function truncatePreview(text: string, maxChars = 72): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}…`;
}

export function roundKindLabel(
  kind: ConversationRound["kind"],
  locale: "en" | "zh" = "en",
): string {
  return kind === "create"
    ? locale === "zh"
      ? "初稿"
      : "Draft"
    : locale === "zh"
      ? "追问"
      : "Follow-up";
}
