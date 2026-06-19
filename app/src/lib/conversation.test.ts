import { describe, expect, it } from "vitest";
import { groupConversationRounds, truncatePreview } from "./conversation";
import type { AiConversationTurn } from "../types";

describe("groupConversationRounds", () => {
  it("groups user turns with following tool and assistant steps", () => {
    const turns: AiConversationTurn[] = [
      {
        role: "user",
        kind: "create",
        content: "50:50 持股如何判断？",
        timestamp_secs: 100,
      },
      {
        role: "assistant",
        kind: "tool",
        content: "搜索知识库：joint control",
        timestamp_secs: 101,
      },
      {
        role: "assistant",
        kind: "create",
        content: "已生成/更新项目笔记",
        timestamp_secs: 102,
      },
      {
        role: "user",
        kind: "continue",
        content: "若一方有融资否决权呢？",
        timestamp_secs: 200,
      },
      {
        role: "assistant",
        kind: "tool",
        content: "读取段落：IFRS 11 §7",
        timestamp_secs: 201,
      },
    ];

    const rounds = groupConversationRounds(turns);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.userQuestion).toContain("50:50");
    expect(rounds[0]?.steps).toHaveLength(2);
    expect(rounds[1]?.kind).toBe("continue");
    expect(rounds[1]?.steps).toHaveLength(1);
  });
});

describe("truncatePreview", () => {
  it("shortens long single-line text", () => {
    const text = "a".repeat(100);
    expect(truncatePreview(text, 20)).toBe(`${"a".repeat(20)}…`);
  });
});
