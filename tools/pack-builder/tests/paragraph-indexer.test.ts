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

  it('extracts IFRS TOC heading paragraphs', () => {
    const content = [
      'CONTENTS',
      'from paragraph',
      'JOINT ARRANGEMENTS 4',
      'Joint control 7',
      'Types of joint arrangement 14',
      '',
      'Joint control',
      'Joint control is the contractually agreed sharing of control.',
    ].join('\n');

    const entries = indexParagraphs({
      standardId: 'IFRS 11',
      packPath: 'current/IFRS/x.md',
      content,
      status: 'current',
    });

    expect(entries.some((entry) => entry.paragraph_normalized === '7')).toBe(true);
  });

  it('extracts IFRS bold-number paragraphs (new format)', () => {
    const content = [
      '## Objective',
      '',
      '**1.** This Standard sets out the principles for the recognition.',
      '',
      '**2.** An entity shall consider the terms and conditions of contracts.',
      '',
      '## Scope',
      '',
      '**3.** An entity shall apply this Standard to all leases.',
    ].join('\n');

    const entries = indexParagraphs({
      standardId: 'IFRS 16',
      packPath: 'current/IFRS/x.md',
      content,
      status: 'current',
    });

    expect(entries.some((entry) => entry.paragraph === '1')).toBe(true);
    expect(entries.some((entry) => entry.paragraph === '2')).toBe(true);
    expect(entries.some((entry) => entry.paragraph === '3')).toBe(true);
  });

  it('extracts IFRS bold-number appendix paragraphs with letter suffixes', () => {
    const content = [
      '## Appendix B',
      '',
      '**B1.** A lessee shall apply this guidance.',
      '',
      '## Appendix C',
      '',
      '**C20E.** Transition for rent concessions.',
      '**C20BA.** First multi-letter suffix.',
      '**C20BB.** Second multi-letter suffix.',
    ].join('\n');

    const entries = indexParagraphs({
      standardId: 'IFRS 16',
      packPath: 'current/IFRS/x.md',
      content,
      status: 'current',
    });

    expect(entries.some((entry) => entry.paragraph === 'B1')).toBe(true);
    expect(entries.some((entry) => entry.paragraph === 'C20E')).toBe(true);
    expect(entries.some((entry) => entry.paragraph === 'C20BA')).toBe(true);
    expect(entries.some((entry) => entry.paragraph === 'C20BB')).toBe(true);
  });
});
