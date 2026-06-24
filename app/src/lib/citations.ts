import type { CitationRef, CitationTarget, ParagraphIndexEntry } from "../types";

const IFRS_IAS_PATTERN =
  /(?:IFRS|IAS)\s+(\d+[A-Za-z]?)\s*(?:§|Paragraph)\s*(\d+(?:[–-]\d+)?)/gi;

const ASC_PATTERN =
  /ASC\s+(?:\d+\s*(?:§|Paragraph)?\s*)?(\d{3}-\d{2}-\d{2}-\d+)/gi;

export function parseCitation(text: string): CitationRef | null {
  const trimmed = text.trim();

  IFRS_IAS_PATTERN.lastIndex = 0;
  const ifrsMatch = IFRS_IAS_PATTERN.exec(trimmed);
  if (ifrsMatch) {
    const framework = ifrsMatch[0].match(/^(IFRS|IAS)/i)?.[1]?.toUpperCase();
    if (framework) {
      return {
        standardId: `${framework} ${ifrsMatch[1]}`,
        paragraph: ifrsMatch[2].replace("–", "-"),
      };
    }
  }

  ASC_PATTERN.lastIndex = 0;
  const ascMatch = ASC_PATTERN.exec(trimmed);
  if (ascMatch) {
    const codification = ascMatch[1];
    const topic = codification.split("-")[0] ?? "000";
    return {
      standardId: `ASC ${topic}`,
      paragraph: codification,
    };
  }

  return null;
}

/** @deprecated Used only by tests. Frontend resolves citations via Tauri backend (`api.ts`). */
export function resolveCitation(
  citation: string,
  paragraphsIndex: ParagraphIndexEntry[],
): CitationTarget | null {
  const parsed = parseCitation(citation);
  if (!parsed) {
    return null;
  }

  const normalized = parsed.paragraph.split("-")[0] ?? parsed.paragraph;
  const entry = paragraphsIndex.find(
    (item) =>
      item.standard_id.toLowerCase() === parsed.standardId.toLowerCase() &&
      (item.paragraph === parsed.paragraph ||
        item.paragraph_normalized === normalized ||
        item.paragraph_normalized === parsed.paragraph),
  );

  if (!entry) {
    return null;
  }

  return {
    citation: citation.trim(),
    standard_id: entry.standard_id,
    paragraph: entry.paragraph,
    pack_path: entry.pack_path,
    char_start: entry.char_start,
    char_end: entry.char_end,
    snippet_en: entry.snippet_en,
    status: entry.status,
    resolved: true,
  };
}

export const CITATION_PATTERN =
  /(?:IFRS|IAS)\s+\d+[A-Za-z]?\s*(?:§|Paragraph)\s*\d+(?:[–-]\d+)?|ASC\s+(?:\d+\s*(?:§|Paragraph)?\s*)?\d{3}-\d{2}-\d{2}-\d+/gi;

export function citationKey(citation: string): string {
  return encodeURIComponent(citation.trim());
}

export function citationFromKey(key: string): string {
  return decodeURIComponent(key);
}

/** Replace inline citations with markdown hash links (handled as buttons in UI). */
export function injectCitationLinks(content: string): string {
  let result = content;

  for (const pattern of [CITATION_PATTERN]) {
    result = result.replace(pattern, (match) => {
      const key = citationKey(match);
      return `[${match}](#asd-cite-${key})`;
    });
  }

  return result;
}

/** @deprecated Used only by tests. Citation scanning is handled by Rust backend (`citations.rs`). */
export function scanCitations(content: string): string[] {
  const found: string[] = [];

  for (const match of content.matchAll(CITATION_PATTERN)) {
    found.push(match[0]);
  }

  return [...new Set(found)].sort();
}
