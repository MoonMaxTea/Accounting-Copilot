import type { ParagraphEntry, Status } from '@asd/shared-types';

const IFRS_IAS_HEADING_RE = /^(?:#{1,6}\s*)?(?:Paragraph|§)\s*(\d+(?:[–-]\d+)?)/gim;
const ASC_CODIFICATION_RE = /\b(\d{3}-\d{2}-\d{2}-\d+)\b/g;
const TOC_LINE_RE = /^([A-Za-z][^\n\d]{2,80}?)\s+(\d{1,3}[A-Za-z]?)\s*$/gm;

const TOC_SKIP_RE =
  /^(IFRS|IAS|CONTENTS|OBJECTIVE|SCOPE|APPEND|APPROVAL|FOR THE|INTERNATIONAL FINANCIAL)/i;

export interface IndexParagraphsOptions {
  standardId: string;
  packPath: string;
  content: string;
  status: Status;
}

function normalizeParagraph(value: string): string {
  return value.split(/[–-]/)[0] ?? value;
}

function snippetFrom(content: string, start: number, length = 120): string {
  return content.slice(start, start + length).replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pushEntry(
  entries: ParagraphEntry[],
  seen: Set<string>,
  options: IndexParagraphsOptions,
  paragraph: string,
  charStart: number,
  charEnd: number,
): void {
  const key = `${options.standardId}:${paragraph}:${charStart}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);

  entries.push({
    standard_id: options.standardId,
    paragraph,
    paragraph_normalized: normalizeParagraph(paragraph),
    pack_path: options.packPath,
    char_start: charStart,
    char_end: charEnd,
    snippet_en: snippetFrom(options.content, charStart),
    status: options.status,
  });
}

function indexTocParagraphs(
  entries: ParagraphEntry[],
  seen: Set<string>,
  options: IndexParagraphsOptions,
): void {
  const { content } = options;
  const tocSection = content.slice(0, Math.min(content.length, 12_000));
  const titlesByParagraph = new Map<string, string>();

  for (const match of tocSection.matchAll(TOC_LINE_RE)) {
    const title = match[1]?.trim();
    const paragraph = match[2];
    if (!title || !paragraph || title.length < 3 || TOC_SKIP_RE.test(title)) {
      continue;
    }
    titlesByParagraph.set(paragraph, title);
    titlesByParagraph.set(normalizeParagraph(paragraph), title);
  }

  for (const [paragraph, title] of titlesByParagraph) {
    const headingRe = new RegExp(`^${escapeRegExp(title)}\\s*$`, 'im');
    const headingMatch = headingRe.exec(content);
    if (!headingMatch || headingMatch.index === undefined) {
      continue;
    }

    const charStart = headingMatch.index;
    const afterHeading = charStart + headingMatch[0].length;
    const nextBreak = content.indexOf('\n\n', afterHeading);
    const charEnd = nextBreak === -1 ? afterHeading : nextBreak;
    pushEntry(entries, seen, options, paragraph, charStart, charEnd);
  }
}

export function indexParagraphs(options: IndexParagraphsOptions): ParagraphEntry[] {
  const entries: ParagraphEntry[] = [];
  const seen = new Set<string>();
  const { content } = options;

  for (const match of content.matchAll(IFRS_IAS_HEADING_RE)) {
    const paragraph = match[1];
    if (!paragraph) {
      continue;
    }
    const charStart = match.index ?? 0;
    const charEnd = charStart + match[0].length;
    pushEntry(entries, seen, options, paragraph, charStart, charEnd);
  }

  indexTocParagraphs(entries, seen, options);

  for (const match of content.matchAll(ASC_CODIFICATION_RE)) {
    const paragraph = match[1];
    if (!paragraph) {
      continue;
    }
    const charStart = match.index ?? 0;
    const charEnd = charStart + match[0].length;
    pushEntry(entries, seen, options, paragraph, charStart, charEnd);
  }

  return entries.sort((left, right) => left.char_start - right.char_start);
}

export function indexCopiedFiles(
  files: Array<{
    entry: { id: string; status: Status };
    packPath: string;
    content: string;
  }>,
): ParagraphEntry[] {
  return files.flatMap((file) =>
    indexParagraphs({
      standardId: file.entry.id,
      packPath: file.packPath,
      content: file.content,
      status: file.entry.status,
    }),
  );
}
