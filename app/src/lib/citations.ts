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

export function scanCitations(content: string): string[] {
  const found: string[] = [];

  for (const pattern of [
    /(?:IFRS|IAS)\s+\d+[A-Za-z]?\s*(?:§|Paragraph)\s*\d+(?:[–-]\d+)?/gi,
    /ASC\s+(?:\d+\s*(?:§|Paragraph)?\s*)?\d{3}-\d{2}-\d{2}-\d+/gi,
  ]) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      found.push(match[0]);
    }
  }

  return [...new Set(found)].sort();
}

export function injectCitationLinks(content: string): string {
  let result = content;

  for (const pattern of [
    /(?:IFRS|IAS)\s+\d+[A-Za-z]?\s*(?:§|Paragraph)\s*\d+(?:[–-]\d+)?/gi,
    /ASC\s+(?:\d+\s*(?:§|Paragraph)?\s*)?\d{3}-\d{2}-\d{2}-\d+/gi,
  ]) {
    result = result.replace(pattern, (match) => {
      const encoded = encodeURIComponent(match);
      return `[${match}](citation:${encoded})`;
    });
  }

  return result;
}
