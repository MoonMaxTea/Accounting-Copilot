use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::models::SearchHit;

pub fn search_standards(content_path: &Path, query: &str, limit: u32) -> Result<Vec<SearchHit>, String> {
    let db_path = content_path.join("index/search.sqlite");
    if !db_path.is_file() {
        return Ok(Vec::new());
    }

    let sanitized = query.trim().replace('"', "\"\"");
    if sanitized.is_empty() {
        return Ok(Vec::new());
    }

    let connection = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| error.to_string())?;

    let mut statement = connection
        .prepare(
            "
            SELECT
              standard_id,
              pack_path,
              title,
              snippet(standards_fts, 3, '<mark>', '</mark>', '...', 32) AS snippet
            FROM standards_fts
            WHERE standards_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            ",
        )
        .map_err(|error| error.to_string())?;

    let hits = statement
        .query_map((format!("\"{sanitized}\"*"), limit), |row| {
            Ok(SearchHit {
                standard_id: row.get(0)?,
                pack_path: row.get(1)?,
                title: row.get(2)?,
                snippet: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pack::is_valid_pack;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn search_returns_hits_for_indexed_content() {
        let temp = tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("create index dir");
        fs::write(
            temp.path().join("registry.json"),
            r#"{"schema_version":1,"content_version":"1","standards":[]}"#,
        )
        .expect("write registry");

        let db_path = temp.path().join("index/search.sqlite");
        {
            let connection = Connection::open(&db_path).expect("open db");
            connection
                .execute_batch(
                    "
                    CREATE VIRTUAL TABLE standards_fts USING fts5(
                      standard_id UNINDEXED,
                      pack_path UNINDEXED,
                      title,
                      body,
                      tokenize = 'unicode61'
                    );
                    INSERT INTO standards_fts (standard_id, pack_path, title, body)
                    VALUES ('IFRS 11', 'current/IFRS/a.md', 'Joint Arrangements', 'joint control contractually agreed');
                    ",
                )
                .expect("create fts");
        }

        assert!(is_valid_pack(temp.path()));
        let hits = search_standards(temp.path(), "joint control", 10).expect("search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].standard_id, "IFRS 11");
    }
}
