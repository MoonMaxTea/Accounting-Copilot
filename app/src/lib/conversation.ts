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

export interface ConversationIndexEntry {
  relative_path: string;
  latest_timestamp_secs: number;
}

export function findLatestConversationFolder(
  index: ConversationIndexEntry[] | undefined,
  lastEvidenceFile: string | null,
  selectedRelativePath: string | null,
  folderRelativeForSelection: (
    relativePath: string | null,
    selectedFolderRelative: string | null,
  ) => string | null,
): string | null {
  if (selectedRelativePath) {
    return folderRelativeForSelection(selectedRelativePath, null);
  }

  let latestRelative: string | null = null;
  let latestTimestamp = 0;

  if (index) {
    for (const entry of index) {
      if (entry.relative_path === "__draft__" || entry.latest_timestamp_secs === 0) {
        continue;
      }
      if (entry.latest_timestamp_secs > latestTimestamp) {
        latestTimestamp = entry.latest_timestamp_secs;
        latestRelative = entry.relative_path;
      }
    }
  }

  if (latestRelative) {
    return folderRelativeForSelection(latestRelative, null);
  }

  if (lastEvidenceFile) {
    return folderRelativeForSelection(lastEvidenceFile, null);
  }

  return null;
}
