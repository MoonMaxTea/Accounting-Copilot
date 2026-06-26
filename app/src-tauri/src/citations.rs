use std::fs;
use std::path::Path;

use regex::Regex;
use serde::Deserialize;

use crate::models::CitationTarget;
use crate::pack::{load_registry, read_standard_body};

#[derive(Debug, Deserialize)]
struct ParagraphsFile {
    entries: Vec<ParagraphRecord>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct ParagraphRecord {
    pub(crate) standard_id: String,
    pub(crate) paragraph: String,
    paragraph_normalized: String,
    pack_path: String,
    pub(crate) char_start: u64,
    char_end: u64,
    pub(crate) snippet_en: String,
    pub(crate) status: String,
}

pub fn count_paragraphs(content_dir: &Path) -> Result<usize, String> {
    Ok(load_paragraphs(content_dir)?.len())
}

pub fn load_paragraphs(content_dir: &Path) -> Result<Vec<ParagraphRecord>, String> {
    let path = content_dir.join("index/paragraphs.json");
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read paragraphs.json: {error}"))?;
    let file: ParagraphsFile =
        serde_json::from_str(&raw).map_err(|error| format!("Invalid paragraphs.json: {error}"))?;
    Ok(file.entries)
}

pub fn parse_citation(raw: &str) -> Option<(String, String)> {
    let text = raw.trim();

    let ifrs_ias = Regex::new(
        r"(?i)(IFRS|IAS)\s+(\d+[A-Za-z]?)\s*(?:§|Paragraph)\s*(\d+(?:[–-]\d+)?)",
    )
    .ok()?;
    if let Some(caps) = ifrs_ias.captures(text) {
        let framework = caps.get(1)?.as_str().to_uppercase();
        let number = caps.get(2)?.as_str();
        let paragraph = caps.get(3)?.as_str().replace('–', "-");
        return Some((format!("{framework} {number}"), paragraph));
    }

    let asc = Regex::new(r"(?i)ASC\s+(?:\d+\s*(?:§|Paragraph)?\s*)?(\d{3}-\d{2}-\d{2}-\d+)").ok()?;
    if let Some(caps) = asc.captures(text) {
        let codification = caps.get(1)?.as_str().to_string();
        let topic = codification.split('-').next().unwrap_or("000");
        return Some((format!("ASC {topic}"), codification));
    }

    // Bare ASC topic reference (e.g. "ASC 842") — no specific paragraph
    let asc_topic = Regex::new(r"(?i)ASC\s+(\d{3})\s*$").ok()?;
    if let Some(caps) = asc_topic.captures(text) {
        let topic = caps.get(1)?.as_str();
        return Some((format!("ASC {topic}"), "1".to_string()));
    }

    None
}

pub fn resolve_citation(content_dir: &Path, citation: &str) -> Result<Option<CitationTarget>, String> {
    let Some((standard_id, paragraph)) = parse_citation(citation) else {
        return Ok(None);
    };

    if let Some(target) = resolve_from_index(content_dir, citation, &standard_id, &paragraph)? {
        return Ok(Some(target));
    }

    if let Some(target) = resolve_via_body_search(content_dir, citation, &standard_id, &paragraph)? {
        return Ok(Some(target));
    }

    resolve_standard_fallback(content_dir, citation, &standard_id, &paragraph)
}

/// Slice `len` UTF-16 code units from `body` starting at the UTF-16 offset
/// `start`, returning a valid UTF-8 `String`.  This mirrors the JavaScript
/// `String.prototype.slice(start, start + len)` semantics used by the pack
/// indexer, so offsets stored in `paragraphs.json` line up exactly and slicing
/// can never panic on a UTF-8 char boundary.
fn slice_utf16(body: &str, start: usize, len: usize) -> String {
    let units: Vec<u16> = body.encode_utf16().collect();
    let start = start.min(units.len());
    let end = start.saturating_add(len).min(units.len());
    String::from_utf16_lossy(&units[start..end])
}

fn is_amendment_snippet(snippet: &str) -> bool {
    let lower = snippet.to_ascii_lowercase();
    const KEYWORDS: &[&str] = &[
        "added by asu",
        "amended by",
        "accounting standards update",
        "superseded by",
        "paragraph superseded",
    ];
    KEYWORDS.iter().any(|kw| lower.contains(kw))
}

fn resolve_from_index(
    content_dir: &Path,
    citation: &str,
    standard_id: &str,
    paragraph: &str,
) -> Result<Option<CitationTarget>, String> {
    let entries = load_paragraphs(content_dir)?;
    let normalized = paragraph.split('-').next().unwrap_or(paragraph);

    // Prefer the entry with the highest char_start among matches.
    // ASC codification files have an amendment-metadata table ("00 Status")
    // at the top that repeats every paragraph number — those entries have
    // low char_start values and contain "Amended … Accounting Standards
    // Update" boilerplate, not the substantive standard text.  The real
    // paragraphs always appear later in the file with higher char_start.
    //
    // Two-step matching: first try exact paragraph match; only fall back to
    // normalized matching if no exact match exists.  This prevents ASC
    // codifications (whose paragraph_normalized is just the topic number,
    // e.g. "718") from matching every entry in the standard.
    let matched = entries
        .iter()
        .filter(|entry| {
            entry.standard_id.eq_ignore_ascii_case(standard_id)
                && entry.paragraph == paragraph
                && !is_amendment_snippet(&entry.snippet_en)
        })
        .max_by_key(|entry| entry.char_start)
        .or_else(|| {
            // Fallback: all exact matches are amendment entries
            entries
                .iter()
                .filter(|entry| {
                    entry.standard_id.eq_ignore_ascii_case(standard_id)
                        && entry.paragraph == paragraph
                })
                .max_by_key(|entry| entry.char_start)
        })
        .or_else(|| {
            // Fallback to normalized matching, prefer non-amendment
            entries
                .iter()
                .filter(|entry| {
                    entry.standard_id.eq_ignore_ascii_case(standard_id)
                        && (entry.paragraph_normalized == normalized
                            || entry.paragraph_normalized == paragraph)
                        && !is_amendment_snippet(&entry.snippet_en)
                })
                .max_by_key(|entry| entry.char_start)
        })
        .or_else(|| {
            // Last fallback: normalized match, all amendment entries
            entries
                .iter()
                .filter(|entry| {
                    entry.standard_id.eq_ignore_ascii_case(standard_id)
                        && (entry.paragraph_normalized == normalized
                            || entry.paragraph_normalized == paragraph)
                })
                .max_by_key(|entry| entry.char_start)
        });

    let Some(entry) = matched else {
        return Ok(None);
    };

    // Read extended context from the actual file body.
    // The pre-built snippet is short — too little for substantive
    // paragraphs that follow header/amendment tables.  We read up to 4 000
    // chars from the file so the AI gets sufficient context.
    //
    // `char_start` is produced by the JS paragraph-indexer using JavaScript
    // string offsets, i.e. **UTF-16 code units** (`String.slice` / `match.index`).
    // Slicing the Rust `String` by raw byte indices therefore mis-aligns on any
    // file containing non-ASCII text (the packs include Chinese「中文提炼」
    // sections and emoji) and can panic on a non-char boundary.  We slice on the
    // UTF-16 code-unit sequence to match the indexer exactly.
    let extended_snippet = read_standard_body(content_dir, &entry.pack_path)
        .map(|body| slice_utf16(&body, entry.char_start as usize, 4_000))
        .unwrap_or_else(|_| entry.snippet_en.clone());

    Ok(Some(CitationTarget {
        citation: citation.trim().to_string(),
        standard_id: entry.standard_id.clone(),
        paragraph: entry.paragraph.clone(),
        pack_path: entry.pack_path.clone(),
        char_start: entry.char_start,
        char_end: entry.char_end,
        snippet_en: extended_snippet,
        status: entry.status.clone(),
        resolved: true,
        paragraph_resolved: true,
    }))
}

fn resolve_via_body_search(
    content_dir: &Path,
    citation: &str,
    standard_id: &str,
    paragraph: &str,
) -> Result<Option<CitationTarget>, String> {
    let registry = load_registry(content_dir)?;
    let Some(record) = registry
        .standards
        .iter()
        .find(|entry| entry.id.eq_ignore_ascii_case(standard_id))
    else {
        return Ok(None);
    };

    let body = read_standard_body(content_dir, &record.pack_path)?;
    let normalized = paragraph.split('-').next().unwrap_or(paragraph);

    let Some((char_start, char_end, snippet_en)) = find_paragraph_in_body(&body, normalized) else {
        return Ok(None);
    };

    Ok(Some(CitationTarget {
        citation: citation.trim().to_string(),
        standard_id: record.id.clone(),
        paragraph: paragraph.to_string(),
        pack_path: record.pack_path.clone(),
        char_start,
        char_end,
        snippet_en,
        status: record.status.clone(),
        resolved: true,
        paragraph_resolved: true,
    }))
}

fn resolve_standard_fallback(
    content_dir: &Path,
    citation: &str,
    standard_id: &str,
    paragraph: &str,
) -> Result<Option<CitationTarget>, String> {
    let registry = load_registry(content_dir)?;
    let Some(record) = registry
        .standards
        .iter()
        .find(|entry| entry.id.eq_ignore_ascii_case(standard_id))
    else {
        return Ok(None);
    };

    Ok(Some(CitationTarget {
        citation: citation.trim().to_string(),
        standard_id: record.id.clone(),
        paragraph: paragraph.to_string(),
        pack_path: record.pack_path.clone(),
        char_start: 0,
        char_end: 0,
        snippet_en: String::new(),
        status: record.status.clone(),
        resolved: true,
        paragraph_resolved: false,
    }))
}

fn find_paragraph_in_body(body: &str, paragraph: &str) -> Option<(u64, u64, String)> {
    if let Some(found) = find_paragraph_via_toc(body, paragraph) {
        return Some(found);
    }

    let heading = Regex::new(&format!(
        r"(?im)^(?:Paragraph|§)\s*{}\b",
        regex::escape(paragraph)
    ))
    .ok()?;
    let matched = heading.find(body)?;
    let start = matched.start() as u64;
    let end = body[matched.start()..]
        .find("\n\n")
        .map(|offset| matched.start() as u64 + offset as u64)
        .unwrap_or((matched.end() + 120).min(body.len()) as u64);
    let snippet = snippet_from(body, start as usize);
    Some((start, end, snippet))
}

fn find_paragraph_via_toc(body: &str, paragraph: &str) -> Option<(u64, u64, String)> {
    let toc = &body[..body.len().min(12_000)];
    let toc_line = Regex::new(&format!(r"(?m)^(.+?)\s+{}\s*$", regex::escape(paragraph))).ok()?;
    let caps = toc_line.captures(toc)?;
    let title = caps.get(1)?.as_str().trim();
    if title.len() < 3 || should_skip_toc_title(title) {
        return None;
    }

    let heading = Regex::new(&format!(r"(?m)^{}\s*$", regex::escape(title))).ok()?;
    let matched = heading.find(body)?;
    let start = matched.start() as u64;
    let end = body[matched.start()..]
        .find("\n\n")
        .map(|offset| matched.start() as u64 + offset as u64)
        .unwrap_or((matched.end() + 240).min(body.len()) as u64);
    Some((start, end, snippet_from(body, start as usize)))
}

fn should_skip_toc_title(title: &str) -> bool {
    let upper = title.to_ascii_uppercase();
    upper.contains("IFRS")
        || upper.contains("CONTENTS")
        || upper.contains("APPEND")
        || upper.contains("APPROVAL")
        || upper.starts_with("FOR THE")
        || upper.starts_with("INTERNATIONAL FINANCIAL")
}

fn snippet_from(body: &str, start: usize) -> String {
    body[start..body.len().min(start + 120)]
        .replace('\n', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn scan_citations(content: &str) -> Vec<String> {
    let mut found = Vec::new();
    let patterns = [
        Regex::new(r"(?i)(IFRS|IAS)\s+\d+[A-Za-z]?\s*(?:§|Paragraph)\s*\d+(?:[–-]\d+)?").unwrap(),
        Regex::new(r"(?i)ASC\s+(?:\d+\s*(?:§|Paragraph)?\s*)?\d{3}-\d{2}-\d{2}-\d+").unwrap(),
        // Also match bare ASC topic references (e.g. "ASC 842")
        Regex::new(r"(?i)ASC\s+\d{3}\b").unwrap(),
    ];

    for pattern in patterns {
        for caps in pattern.find_iter(content) {
            found.push(caps.as_str().to_string());
        }
    }

    found.sort();
    found.dedup();
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slice_utf16_matches_js_offsets_without_panicking() {
        // Mixed Chinese + emoji + ASCII. JS String.slice uses UTF-16 offsets.
        let body = "📌中文提炼ABCDEF";
        // UTF-16 units: 📌 = 2 units, then 中文提炼 = 4 units → "ABCDEF" starts at 6.
        assert_eq!(slice_utf16(body, 6, 3), "ABC");
        // A start that would fall mid-byte for byte slicing must not panic.
        assert_eq!(slice_utf16(body, 2, 4), "中文提炼");
        // Out-of-range start yields empty, never panics.
        assert_eq!(slice_utf16(body, 9999, 10), "");
    }

    #[test]
    fn parses_ifrs_citation() {
        let parsed = parse_citation("IFRS 11 §7-8").expect("parsed");
        assert_eq!(parsed.0, "IFRS 11");
        assert_eq!(parsed.1, "7-8");
    }

    #[test]
    fn parses_asc_citation() {
        let parsed = parse_citation("ASC 740-10-25-5").expect("parsed");
        assert_eq!(parsed.0, "ASC 740");
        assert_eq!(parsed.1, "740-10-25-5");
    }

    #[test]
    fn parses_bare_asc_topic() {
        let parsed = parse_citation("ASC 842").expect("parsed");
        assert_eq!(parsed.0, "ASC 842");
        assert_eq!(parsed.1, "1");
    }

    #[test]
    fn parses_asc_full_codification_over_bare_topic() {
        // Full codification should still be preferred
        let parsed = parse_citation("ASC 842-10-25-5").expect("parsed");
        assert_eq!(parsed.0, "ASC 842");
        assert_eq!(parsed.1, "842-10-25-5");
    }

    #[test]
    fn scans_bare_asc_topic() {
        let content = "See ASC 842 for lease accounting and IFRS 11 §7 for joint arrangements.";
        let citations = scan_citations(content);
        assert!(citations.iter().any(|c| c == "ASC 842"));
        assert!(citations.iter().any(|c| c == "IFRS 11 §7"));
    }

    #[test]
    fn resolves_citation_from_index() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("mkdir");
        fs::write(
            temp.path().join("index/paragraphs.json"),
            r#"{"entries":[{"standard_id":"IFRS 11","paragraph":"7-8","paragraph_normalized":"7","pack_path":"current/IFRS/x.md","char_start":10,"char_end":20,"snippet_en":"Joint control","status":"current"}]}"#,
        )
        .expect("write");

        let resolved = resolve_citation(temp.path(), "IFRS 11 §7-8")
            .expect("resolve")
            .expect("target");
        assert_eq!(resolved.standard_id, "IFRS 11");
        assert_eq!(resolved.char_start, 10);
    }

    #[test]
    fn resolves_ifrs_citation_via_toc_fallback() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("mkdir");
        fs::create_dir_all(temp.path().join("current/IFRS")).expect("mkdir standards");
        fs::write(
            temp.path().join("index/paragraphs.json"),
            r#"{"entries":[]}"#,
        )
        .expect("write paragraphs");
        fs::write(
            temp.path().join("registry.json"),
            r#"{"schema_version":1,"content_version":"2026.06.19","standards":[{"id":"IFRS 11","title":"Joint Arrangements","framework":"IFRS","status":"current","official_url":"https://example.com","pack_path":"current/IFRS/ifrs11.md"}]}"#,
        )
        .expect("write registry");
        fs::write(
            temp.path().join("current/IFRS/ifrs11.md"),
            "CONTENTS\nJoint control 7\n\nJoint control\nJoint control is contractually agreed sharing of control.\n",
        )
        .expect("write body");

        let resolved = resolve_citation(temp.path(), "IFRS 11 §7")
            .expect("resolve")
            .expect("target");
        assert_eq!(resolved.standard_id, "IFRS 11");
        assert!(resolved.char_start > 0);
        assert!(resolved.snippet_en.contains("Joint control"));
    }

    #[test]
    fn falls_back_to_standard_when_paragraph_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("mkdir");
        fs::create_dir_all(temp.path().join("current/IAS")).expect("mkdir standards");
        fs::write(temp.path().join("index/paragraphs.json"), r#"{"entries":[]}"#)
            .expect("write paragraphs");
        fs::write(
            temp.path().join("registry.json"),
            r#"{"schema_version":1,"content_version":"2026.06.19","standards":[{"id":"IAS 12","title":"Income Taxes","framework":"IAS","status":"current","official_url":"https://example.com","pack_path":"current/IAS/ias12.md"}]}"#,
        )
        .expect("write registry");
        fs::write(
            temp.path().join("current/IAS/ias12.md"),
            "# IAS 12\n\nIncome tax standard body.",
        )
        .expect("write body");

        let resolved = resolve_citation(temp.path(), "IAS 12 §27")
            .expect("resolve")
            .expect("target");
        assert_eq!(resolved.standard_id, "IAS 12");
        assert!(resolved.resolved);
        assert!(!resolved.paragraph_resolved);
        assert_eq!(resolved.char_start, 0);
    }

    #[test]
    fn prefers_substantive_over_amendment_entry() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("mkdir");
        fs::create_dir_all(temp.path().join("current/ASC")).expect("mkdir standards");

        // Amendment entry has HIGHER char_start (10000) than substantive (5000).
        // The bug: old max_by_key would pick the amendment boilerplate.
        // The fix: keyword filter skips the amendment entry, returning the substantive one.
        // Body padding aligns char_start with real UTF-16 offsets (slice_utf16 reads from file).
        // Amendment is placed beyond the 4 000-char read window from the substantive offset.
        const SUBSTANTIVE_OFFSET: usize = 5000;
        const AMENDMENT_OFFSET: usize = 10_000;
        let substantive =
            "842-20-25-1 A lessee shall recognize a right-of-use asset and a lease liability at commencement date";
        let amendment =
            "842-20-25-1 Added by ASU 2016-02 Lease. Amendments to Subtopic 842-20";
        let between_len = AMENDMENT_OFFSET
            .saturating_sub(SUBSTANTIVE_OFFSET)
            .saturating_sub(substantive.encode_utf16().count());
        let body = format!(
            "{}{}{}{}",
            " ".repeat(SUBSTANTIVE_OFFSET),
            substantive,
            " ".repeat(between_len),
            amendment
        );

        fs::write(
            temp.path().join("index/paragraphs.json"),
            r#"{"entries":[
                {"standard_id":"ASC 842","paragraph":"842-20-25-1","paragraph_normalized":"842","pack_path":"current/ASC/asc842.md","char_start":10000,"char_end":10200,"snippet_en":"842-20-25-1 Added by ASU 2016-02 Lease. Amendments to Subtopic 842-20","status":"current"},
                {"standard_id":"ASC 842","paragraph":"842-20-25-1","paragraph_normalized":"842","pack_path":"current/ASC/asc842.md","char_start":5000,"char_end":5200,"snippet_en":"842-20-25-1 A lessee shall recognize a right-of-use asset and a lease liability at commencement date","status":"current"}
            ]}"#,
        )
        .expect("write paragraphs");
        fs::write(
            temp.path().join("registry.json"),
            r#"{"schema_version":1,"content_version":"test","standards":[{"id":"ASC 842","title":"Leases","framework":"US GAAP","status":"current","official_url":"https://example.com","pack_path":"current/ASC/asc842.md"}]}"#,
        )
        .expect("write registry");
        fs::write(temp.path().join("current/ASC/asc842.md"), body).expect("write body");

        let resolved = resolve_citation(temp.path(), "ASC 842-20-25-1")
            .expect("resolve")
            .expect("target");
        assert!(resolved.snippet_en.contains("right-of-use"));
        assert!(!resolved.snippet_en.contains("Added by ASU"));
        assert_eq!(resolved.char_start, 5000);
    }

    #[test]
    fn falls_back_when_all_entries_are_amendments() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("mkdir");
        fs::create_dir_all(temp.path().join("current/ASC")).expect("mkdir standards");

        fs::write(
            temp.path().join("index/paragraphs.json"),
            r#"{"entries":[
                {"standard_id":"ASC 842","paragraph":"842-20-25-1","paragraph_normalized":"842","pack_path":"current/ASC/asc842.md","char_start":100,"char_end":200,"snippet_en":"842-20-25-1 Added by ASU 2016-02 Lease","status":"current"}
            ]}"#,
        )
        .expect("write paragraphs");
        fs::write(
            temp.path().join("registry.json"),
            r#"{"schema_version":1,"content_version":"test","standards":[{"id":"ASC 842","title":"Leases","framework":"US GAAP","status":"current","official_url":"https://example.com","pack_path":"current/ASC/asc842.md"}]}"#,
        )
        .expect("write registry");
        fs::write(
            temp.path().join("current/ASC/asc842.md"),
            "842-20-25-1 Added by ASU 2016-02 Lease.",
        )
        .expect("write body");

        let resolved = resolve_citation(temp.path(), "ASC 842-20-25-1")
            .expect("resolve")
            .expect("target");
        // Should fallback to the only entry (amendment), rather than return None
        assert!(resolved.resolved);
        assert!(resolved.paragraph_resolved);
    }
}
