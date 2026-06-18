import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { buildSearchIndex, searchIndex } from '../src/search-indexer.js';

describe('search indexer', () => {
  it('creates FTS index searchable by keyword', () => {
    const dbPath = path.join(os.tmpdir(), `search-${Date.now()}.sqlite`);
    buildSearchIndex(dbPath, [
      {
        pack_path: 'current/IFRS/a.md',
        standard_id: 'IFRS 11',
        title: 'Joint Arrangements',
        body: 'joint control contractually agreed sharing of control',
      },
    ]);
    const hits = searchIndex(dbPath, 'joint control');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.standard_id).toBe('IFRS 11');
  });
});
