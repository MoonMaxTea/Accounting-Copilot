export interface NoteFrontmatter {
  tags: string[];
  date: string | null;
  status: string | null;
  type: string | null;
  standards: string[];
  related: string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseInlineList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return trimmed ? [trimmed] : [];
  }
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseNoteFrontmatter(content: string): {
  frontmatter: NoteFrontmatter | null;
  body: string;
} {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: null, body: content };
  }

  const parsed: NoteFrontmatter = {
    tags: [],
    date: null,
    status: null,
    type: null,
    standards: [],
    related: [],
  };

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    switch (key) {
      case "tags":
        parsed.tags = parseInlineList(value);
        break;
      case "date":
        parsed.date = parseScalar(value) || null;
        break;
      case "status":
        parsed.status = parseScalar(value) || null;
        break;
      case "type":
        parsed.type = parseScalar(value) || null;
        break;
      case "standards":
        parsed.standards = parseInlineList(value);
        break;
      case "related":
        parsed.related = parseInlineList(value);
        break;
      default:
        break;
    }
  }

  return {
    frontmatter: parsed,
    body: content.slice(match[0].length).replace(/^\s+/, ""),
  };
}
