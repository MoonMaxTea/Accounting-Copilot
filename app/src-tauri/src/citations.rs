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
    char_start: u64,
    char_end: u64,
    snippet_en: String,
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

fn resolve_from_index(
    content_dir: &Path,
    citation: &str,
    standard_id: &str,
    paragraph: &str,
) -> Result<Option<CitationTarget>, String> {
    let entries = load_paragraphs(content_dir)?;
    let normalized = paragraph.split('-').next().unwrap_or(paragraph);

    let matched = entries.iter().find(|entry| {
        entry.standard_id.eq_ignore_ascii_case(standard_id)
            && (entry.paragraph == paragraph
                || entry.paragraph_normalized == normalized
                || entry.paragraph_normalized == paragraph)
    });

    let Some(entry) = matched else {
        return Ok(None);
    };

    Ok(Some(CitationTarget {
        citation: citation.trim().to_string(),
        standard_id: entry.standard_id.clone(),
        paragraph: entry.paragraph.clone(),
        pack_path: entry.pack_path.clone(),
        char_start: entry.char_start,
        char_end: entry.char_end,
        snippet_en: entry.snippet_en.clone(),
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
}
