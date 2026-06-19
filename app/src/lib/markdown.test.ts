import { describe, expect, it } from "vitest";
import { parseNoteFrontmatter } from "./markdown";

describe("parseNoteFrontmatter", () => {
  it("splits yaml metadata from note body", () => {
    const content = `---
tags: [ifrs, ifrs11]
date: 2026-06-18
status: active
type: A-概念梳理
standards: [IFRS 11, IAS 28]
related: []
---

# Title

Body text
`;

    const { frontmatter, body } = parseNoteFrontmatter(content);
    expect(frontmatter?.tags).toEqual(["ifrs", "ifrs11"]);
    expect(frontmatter?.date).toBe("2026-06-18");
    expect(frontmatter?.status).toBe("active");
    expect(frontmatter?.type).toBe("A-概念梳理");
    expect(frontmatter?.standards).toEqual(["IFRS 11", "IAS 28"]);
    expect(body.startsWith("# Title")).toBe(true);
    expect(body).not.toContain("tags:");
  });
});
