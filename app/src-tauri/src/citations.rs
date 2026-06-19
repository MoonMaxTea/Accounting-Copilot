use std::fs;
use std::path::Path;

use regex::Regex;
use serde::Deserialize;

use crate::models::CitationTarget;

#[derive(Debug, Deserialize)]
struct ParagraphsFile {
    entries: Vec<ParagraphRecord>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct ParagraphRecord {
    standard_id: String,
    paragraph: String,
    paragraph_normalized: String,
    pack_path: String,
    char_start: u64,
    char_end: u64,
    snippet_en: String,
    status: String,
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

    let entries = load_paragraphs(content_dir)?;
    let normalized = paragraph.split('-').next().unwrap_or(&paragraph).to_string();

    let matched = entries.iter().find(|entry| {
        entry.standard_id.eq_ignore_ascii_case(&standard_id)
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
    }))
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
}
