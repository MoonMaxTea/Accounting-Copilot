import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { SearchDocument, SearchHit } from '@asd/shared-types';

export function buildSearchIndex(dbPath: string, documents: SearchDocument[]): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new Database(dbPath);
  db.exec(`
    CREATE VIRTUAL TABLE standards_fts USING fts5(
      standard_id UNINDEXED,
      pack_path UNINDEXED,
      title,
      body,
      tokenize = 'unicode61'
    );
  `);

  const insert = db.prepare(`
    INSERT INTO standards_fts (standard_id, pack_path, title, body)
    VALUES (@standard_id, @pack_path, @title, @body)
  `);

  const insertMany = db.transaction((rows: SearchDocument[]) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  insertMany(documents);
  db.close();
}

export function searchIndex(dbPath: string, query: string, limit = 20): SearchHit[] {
  const db = new Database(dbPath, { readonly: true });
  const sanitized = query.trim().replace(/"/g, '""');
  if (!sanitized) {
    db.close();
    return [];
  }

  const rows = db
    .prepare(
      `
      SELECT
        standard_id,
        pack_path,
        title,
        snippet(standards_fts, 3, '<mark>', '</mark>', '...', 32) AS snippet
      FROM standards_fts
      WHERE standards_fts MATCH ?
      LIMIT ?
    `,
    )
    .all(`"${sanitized}"*`, limit) as SearchHit[];

  db.close();
  return rows;
}
