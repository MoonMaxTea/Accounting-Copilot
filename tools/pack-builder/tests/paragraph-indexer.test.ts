import { describe, it, expect } from 'vitest';
import { indexParagraphs } from '../src/paragraph-indexer.js';

describe('indexParagraphs', () => {
  it('extracts IFRS Paragraph references', () => {
    const content = 'Some text.\n\nParagraph 7\n\nJoint control is contractually agreed sharing of control.';
    const entries = indexParagraphs({
      standardId: 'IFRS 11',
      packPath: 'current/IFRS/x.md',
      content,
      status: 'current',
    });
    expect(entries.some((entry) => entry.paragraph_normalized === '7')).toBe(true);
  });

  it('extracts ASC codification references', () => {
    const content = 'Per 740-10-25-5, deferred tax liabilities shall be recognized.';
    const entries = indexParagraphs({
      standardId: 'ASC 740',
      packPath: 'current/ASC/x.md',
      content,
      status: 'current',
    });
    expect(entries.some((entry) => entry.paragraph === '740-10-25-5')).toBe(true);
  });
});
