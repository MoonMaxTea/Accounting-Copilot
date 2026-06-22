use std::collections::{BTreeSet, HashMap};
use std::path::Path;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::citations::{load_paragraphs, parse_citation, resolve_citation, ParagraphRecord};
use crate::db;
use crate::pack;

/// Phase A / 规则层产出：检索计划
#[derive(Debug, Deserialize, Default, Clone, PartialEq, Eq)]
pub struct RetrievalPlan {
    #[serde(default)]
    pub queries: Vec<String>,
    #[serde(default)]
    pub standards: Vec<String>,
}

/// FTS5 / registry 准则级命中（不是段落级）
#[derive(Debug, Clone, PartialEq)]
pub struct PackSearchHit {
    pub standard_id: String,
    pub title: String,
    pub snippet: String,
    pub pack_path: String,
    /// 越小越相关（FTS5 bm25 序）；registry 兜底命中使用较大默认值
    pub rank: f64,
}

/// Phase B 组装的单条证据（段落级）
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct EvidenceItem {
    pub citation: String,
    pub standard_id: String,
    pub title: String,
    pub snippet_en: String,
}

/// Phase B 的产出：注入 Phase C 的证据包
#[derive(Debug, Default, Serialize, PartialEq, Eq)]
pub struct EvidencePack {
    pub items: Vec<EvidenceItem>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EvidenceBudget {
    pub max_items: usize,
    pub max_item_chars: usize,
    pub max_total_chars: usize,
}

pub const CREATE_EVIDENCE_BUDGET: EvidenceBudget = EvidenceBudget {
    max_items: 8,
    max_item_chars: 1500,
    max_total_chars: 8000,
};

pub const CONTINUE_EVIDENCE_BUDGET: EvidenceBudget = EvidenceBudget {
    max_items: 5,
    max_item_chars: 1500,
    max_total_chars: 5000,
};

const REGISTRY_FALLBACK_RANK: f64 = 1000.0;
const STANDARD_DIRECT_RANK: f64 = 500.0;
const SKIP_PARAGRAPH_SUFFIXES: [&str; 3] = ["00-1", "00-2", "00-3"];

/// 从问题/事实中用正则提取准则 ID，生成 baseline 查询词。不调用 LLM。
pub fn derive_plan_from_question(question: &str, facts: Option<&str>) -> RetrievalPlan {
    let mut standards = BTreeSet::new();
    let combined = match facts.map(str::trim).filter(|value| !value.is_empty()) {
        Some(facts) => format!("{}\n{facts}", question.trim()),
        None => question.trim().to_string(),
    };

    if let Ok(ifrs_ias) = Regex::new(r"(?i)\b(IFRS|IAS)\s+(\d+[A-Za-z]?)\b") {
        for caps in ifrs_ias.captures_iter(&combined) {
            if let (Some(fw), Some(num)) = (caps.get(1), caps.get(2)) {
                standards.insert(format!("{} {}", fw.as_str().to_uppercase(), num.as_str()));
            }
        }
    }

    if let Ok(asc) = Regex::new(r"(?i)\bASC\s+(\d{3})(?:-\d{2}(?:-\d{2})?(?:-\d+)*)?\b") {
        for caps in asc.captures_iter(&combined) {
            if let Some(topic) = caps.get(1) {
                standards.insert(format!("ASC {}", topic.as_str()));
            }
        }
    }

    let mut queries = vec![question.trim().to_string()];
    if let Some(facts) = facts.map(str::trim).filter(|value| !value.is_empty()) {
        if !queries.iter().any(|q| q == facts) {
            queries.push(facts.to_string());
        }
    }

    RetrievalPlan {
        queries,
        standards: standards.into_iter().collect(),
    }
}

pub fn merge_retrieval_plans(base: &RetrievalPlan, extra: &RetrievalPlan) -> RetrievalPlan {
    let mut queries: Vec<String> = base.queries.clone();
    for query in &extra.queries {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !queries.iter().any(|existing| existing.eq_ignore_ascii_case(trimmed)) {
            queries.push(trimmed.to_string());
        }
    }

    let mut standards: Vec<String> = base.standards.clone();
    for standard in &extra.standards {
        let trimmed = standard.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !standards
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(trimmed))
        {
            standards.push(trimmed.to_string());
        }
    }

    RetrievalPlan { queries, standards }
}

/// FTS5 全文 + registry 兜底 → 准则级命中
pub fn search_pack(
    content_dir: &Path,
    allow_legacy: bool,
    query: &str,
    limit: u32,
) -> Vec<PackSearchHit> {
    let limit = limit.clamp(1, 20);
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }

    let mut results: Vec<PackSearchHit> = Vec::new();
    let mut seen_ids: BTreeSet<String> = BTreeSet::new();

    if let Ok(fts_hits) = db::search_standards(content_dir, query, limit) {
        for (index, hit) in fts_hits.into_iter().enumerate() {
            if !allow_legacy && hit.standard_id.is_empty() {
                continue;
            }
            let sid = hit.standard_id.clone();
            results.push(PackSearchHit {
                standard_id: sid.clone(),
                title: hit.title,
                snippet: hit.snippet,
                pack_path: hit.pack_path,
                rank: index as f64,
            });
            seen_ids.insert(sid);
        }
    }

    if results.len() < limit as usize {
        let entries = load_paragraphs(content_dir).unwrap_or_default();
        if let Ok(registry) = pack::load_registry(content_dir) {
            let query_lower = query.to_lowercase();
            for std in &registry.standards {
                if seen_ids.contains(&std.id) {
                    continue;
                }
                if results.len() >= limit as usize {
                    break;
                }
                let id_lower = std.id.to_lowercase();
                let title_lower = std.title.to_lowercase();
                if id_lower == query_lower
                    || id_lower.contains(&query_lower)
                    || title_lower.contains(&query_lower)
                    || query_lower.contains(&id_lower)
                {
                    if !allow_legacy && std.status == "legacy" {
                        continue;
                    }
                    let para_count = entries
                        .iter()
                        .filter(|e| e.standard_id.eq_ignore_ascii_case(&std.id))
                        .count();
                    results.push(PackSearchHit {
                        standard_id: std.id.clone(),
                        title: std.title.clone(),
                        snippet: format!(
                            "{} — {}{}（{} 个索引段落可用）",
                            std.id,
                            if std.status == "legacy" { "[旧准则] " } else { "" },
                            std.title_zh.as_deref().unwrap_or(&std.title),
                            para_count,
                        ),
                        pack_path: std.pack_path.clone(),
                        rank: REGISTRY_FALLBACK_RANK,
                    });
                    seen_ids.insert(std.id.clone());
                }
            }
        }
    }

    results
}

/// 列出某准则已索引段落 citation（含 dedup）
pub fn list_paragraphs(
    content_dir: &Path,
    allow_legacy: bool,
    standard_id: &str,
) -> Vec<String> {
    let entries = match load_paragraphs(content_dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut citations: Vec<&ParagraphRecord> = entries
        .iter()
        .filter(|entry| entry.standard_id.eq_ignore_ascii_case(standard_id))
        .filter(|entry| allow_legacy || entry.status == "current")
        .collect();

    citations.sort_by(|a, b| {
        a.paragraph
            .cmp(&b.paragraph)
            .then_with(|| b.char_start.cmp(&a.char_start))
    });
    citations.dedup_by(|a, b| a.paragraph == b.paragraph);

    citations
        .iter()
        .map(|entry| format!("{} §{}", entry.standard_id, entry.paragraph))
        .collect()
}

/// 读取段落全文（复用 resolve_citation；按字符上限截断）
pub fn read_paragraph(
    content_dir: &Path,
    allow_legacy: bool,
    citation: &str,
    max_chars: usize,
) -> Option<EvidenceItem> {
    let citation = citation.trim();
    let target = resolve_citation(content_dir, citation).ok()??;
    if target.status == "legacy" && !allow_legacy {
        return None;
    }

    let snippet_en = truncate_chars(&target.snippet_en, max_chars);
    let standard_id = target.standard_id.clone();
    Some(EvidenceItem {
        citation: target.citation,
        standard_id: standard_id.clone(),
        title: standard_id,
        snippet_en,
    })
}

struct ScoredEvidence {
    rank: f64,
    item: EvidenceItem,
}

/// Phase B：检索 + 证据组装（纯 Rust）
pub fn gather_evidence(
    content_dir: &Path,
    allow_legacy: bool,
    plan: &RetrievalPlan,
    budget: EvidenceBudget,
) -> EvidencePack {
    let mut hit_map: HashMap<String, PackSearchHit> = HashMap::new();

    for query in &plan.queries {
        for hit in search_pack(content_dir, allow_legacy, query, 10) {
            hit_map
                .entry(hit.standard_id.clone())
                .and_modify(|existing| {
                    if hit.rank < existing.rank {
                        *existing = hit.clone();
                    }
                })
                .or_insert(hit);
        }
    }

    let mut scored: Vec<ScoredEvidence> = Vec::new();
    let mut seen_citations: BTreeSet<String> = BTreeSet::new();

    for hit in hit_map.values() {
        push_evidence_for_hit(
            content_dir,
            allow_legacy,
            plan,
            hit,
            budget.max_item_chars,
            &mut scored,
            &mut seen_citations,
        );
    }

    for standard_id in &plan.standards {
        let synthetic = PackSearchHit {
            standard_id: standard_id.clone(),
            title: standard_id.clone(),
            snippet: String::new(),
            pack_path: String::new(),
            rank: STANDARD_DIRECT_RANK,
        };
        push_evidence_for_hit(
            content_dir,
            allow_legacy,
            plan,
            &synthetic,
            budget.max_item_chars,
            &mut scored,
            &mut seen_citations,
        );
    }

    scored.sort_by(|a, b| {
        a.rank
            .partial_cmp(&b.rank)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut items = Vec::new();
    let mut total_chars = 0usize;
    for scored_item in scored {
        if items.len() >= budget.max_items {
            break;
        }
        let item_len = scored_item.item.snippet_en.chars().count();
        if total_chars + item_len > budget.max_total_chars {
            continue;
        }
        total_chars += item_len;
        items.push(scored_item.item);
    }

    EvidencePack { items }
}

fn push_evidence_for_hit(
    content_dir: &Path,
    allow_legacy: bool,
    plan: &RetrievalPlan,
    hit: &PackSearchHit,
    max_item_chars: usize,
    scored: &mut Vec<ScoredEvidence>,
    seen_citations: &mut BTreeSet<String>,
) {
    if let Some((standard_id, _paragraph)) = parse_citation(&hit.snippet) {
        if let Some(item) = read_paragraph(content_dir, allow_legacy, &format!("{standard_id} §{_paragraph}"), max_item_chars) {
            push_unique_evidence(scored, seen_citations, hit.rank, item);
            return;
        }
    }

    for citation in select_paragraph_citations(content_dir, allow_legacy, &hit.standard_id, plan) {
        if let Some(item) = read_paragraph(content_dir, allow_legacy, &citation, max_item_chars) {
            push_unique_evidence(scored, seen_citations, hit.rank, item);
        }
    }
}

fn push_unique_evidence(
    scored: &mut Vec<ScoredEvidence>,
    seen_citations: &mut BTreeSet<String>,
    rank: f64,
    item: EvidenceItem,
) {
    if seen_citations.insert(item.citation.clone()) {
        scored.push(ScoredEvidence { rank, item });
    }
}

fn select_paragraph_citations(
    content_dir: &Path,
    allow_legacy: bool,
    standard_id: &str,
    plan: &RetrievalPlan,
) -> Vec<String> {
    let entries = match load_paragraphs(content_dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut records: Vec<&ParagraphRecord> = entries
        .iter()
        .filter(|entry| entry.standard_id.eq_ignore_ascii_case(standard_id))
        .filter(|entry| allow_legacy || entry.status == "current")
        .collect();

    records.sort_by(|a, b| {
        a.paragraph
            .cmp(&b.paragraph)
            .then_with(|| b.char_start.cmp(&a.char_start))
    });
    records.dedup_by(|a, b| a.paragraph == b.paragraph);

    let query_terms = collect_query_terms(plan);
    let mut ranked: Vec<(&ParagraphRecord, usize)> = records
        .iter()
        .map(|record| (*record, score_snippet(&record.snippet_en, &query_terms)))
        .collect();

    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.char_start.cmp(&a.0.char_start)));

    let mut selected: Vec<String> = ranked
        .iter()
        .filter(|(record, score)| *score > 0 && !is_amendment_metadata(record))
        .take(2)
        .map(|(record, _)| format!("{} §{}", record.standard_id, record.paragraph))
        .collect();

    if selected.is_empty() {
        selected = records
            .iter()
            .filter(|record| !is_amendment_metadata(record))
            .take(2)
            .map(|record| format!("{} §{}", record.standard_id, record.paragraph))
            .collect();
    }

    selected
}

fn collect_query_terms(plan: &RetrievalPlan) -> Vec<String> {
    let mut terms = BTreeSet::new();
    for query in &plan.queries {
        for token in split_query_tokens(query) {
            terms.insert(token);
        }
    }
    terms.into_iter().collect()
}

fn split_query_tokens(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric() && c != '-')
        .filter(|part| part.chars().count() >= 2)
        .map(|part| part.to_lowercase())
        .collect()
}

fn score_snippet(snippet: &str, query_terms: &[String]) -> usize {
    if query_terms.is_empty() {
        return 0;
    }
    let lowered = snippet.to_lowercase();
    query_terms
        .iter()
        .filter(|term| lowered.contains(term.as_str()))
        .count()
}

fn is_amendment_metadata(record: &ParagraphRecord) -> bool {
    if record.paragraph.contains("00 Status") {
        return true;
    }
    SKIP_PARAGRAPH_SUFFIXES
        .iter()
        .any(|suffix| record.paragraph.ends_with(suffix))
}

/// Phase A 用：前 ~1500 字符摘要
pub fn summarize_for_planning(markdown: &str) -> String {
    truncate_chars(markdown, 1500)
}

/// Render evidence items for injection into Continue writer user messages.
pub fn render_evidence_pack(pack: &EvidencePack) -> String {
    if pack.items.is_empty() {
        return "（本地检索未命中段落；请依据笔记已有内容作答，未覆盖处如实注明。）".to_string();
    }
    pack.items
        .iter()
        .map(|item| format!("### {}\n{}", item.citation, item.snippet_en))
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Phase C 用：按长度分级传入文档
pub fn truncate_for_continue(markdown: &str, question: &str) -> String {
    let char_count = markdown.chars().count();
    if char_count <= 12_000 {
        return markdown.to_string();
    }

    let mut parts = Vec::new();
    if let Some(frontmatter) = extract_frontmatter(markdown) {
        parts.push(frontmatter);
    }

    for section in ["## TL;DR", "## 结论", "## Conclusion"] {
        if let Some(body) = extract_section(markdown, section) {
            parts.push(format!("{section}\n{}", truncate_chars(&body, 2_000)));
        }
    }

    for line in markdown.lines() {
        if line.starts_with("## ") {
            parts.push(line.to_string());
        }
    }

    if char_count > 24_000 {
        let keywords = split_query_tokens(question);
        for line in markdown.lines() {
            if let Some(heading) = line.strip_prefix("## ") {
                let heading_lower = heading.to_lowercase();
                if keywords
                    .iter()
                    .any(|keyword| heading_lower.contains(keyword))
                {
                    if let Some(body) = extract_section(markdown, line) {
                        parts.push(format!(
                            "{line}\n{}",
                            truncate_chars(&body, 4_000)
                        ));
                    }
                }
            }
        }
    }

    let merged = parts.join("\n\n");
    if merged.chars().count() > 12_000 {
        truncate_chars(&merged, 12_000)
    } else if merged.is_empty() {
        truncate_chars(markdown, 12_000)
    } else {
        merged
    }
}

fn extract_frontmatter(markdown: &str) -> Option<String> {
    let trimmed = markdown.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = trimmed.trim_start_matches("---").trim_start();
    let end = rest.find("\n---")?;
    Some(format!("---\n{}\n---", &rest[..end]))
}

fn extract_section(markdown: &str, heading: &str) -> Option<String> {
    let start = markdown.find(heading)?;
    let section_start = start + heading.len();
    let tail = &markdown[section_start..];
    let rel_end = tail
        .find("\n## ")
        .unwrap_or(tail.len());
    let body = tail[..rel_end].trim();
    if body.is_empty() {
        None
    } else {
        Some(body.to_string())
    }
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    text.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn derive_plan_extracts_standard_ids() {
        let plan = derive_plan_from_question(
            "请分析 IFRS 11 与 ASC 718-10 的股份支付差异",
            Some("客户为上市公司"),
        );
        assert!(plan
            .standards
            .iter()
            .any(|id| id.eq_ignore_ascii_case("IFRS 11")));
        assert!(plan
            .standards
            .iter()
            .any(|id| id.eq_ignore_ascii_case("ASC 718")));
        assert!(plan.queries[0].contains("IFRS 11"));
    }

    #[test]
    fn merge_retrieval_plans_unions_without_duplicates() {
        let base = RetrievalPlan {
            queries: vec!["question".to_string()],
            standards: vec!["IFRS 11".to_string()],
        };
        let extra = RetrievalPlan {
            queries: vec!["Question".to_string(), "extra".to_string()],
            standards: vec!["ifrs 11".to_string(), "IAS 28".to_string()],
        };
        let merged = merge_retrieval_plans(&base, &extra);
        assert_eq!(merged.queries.len(), 2);
        assert_eq!(merged.standards.len(), 2);
    }

    #[test]
    fn list_paragraphs_dedups_by_highest_char_start() {
        let temp = tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("dir");
        fs::write(
            temp.path().join("index/paragraphs.json"),
            r#"{"entries":[
                {"standard_id":"ASC 718","paragraph":"718-10-35-3","paragraph_normalized":"718","pack_path":"x.md","char_start":100,"char_end":200,"snippet_en":"metadata","status":"current"},
                {"standard_id":"ASC 718","paragraph":"718-10-35-3","paragraph_normalized":"718","pack_path":"x.md","char_start":900,"char_end":1000,"snippet_en":"substantive","status":"current"}
            ]}"#,
        )
        .expect("write");

        let citations = list_paragraphs(temp.path(), false, "ASC 718");
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0], "ASC 718 §718-10-35-3");
    }

    #[test]
    fn search_pack_registry_fallback_matches_standard_id() {
        let temp = tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("dir");
        fs::write(
            temp.path().join("registry.json"),
            r#"{"schema_version":1,"content_version":"1","standards":[{"id":"IFRS 11","title":"Joint Arrangements","title_zh":"合营安排","framework":"IFRS","status":"current","official_url":"https://example.com","pack_path":"ifrs11.md"}]}"#,
        )
        .expect("registry");
        fs::write(
            temp.path().join("index/paragraphs.json"),
            r#"{"entries":[{"standard_id":"IFRS 11","paragraph":"7","paragraph_normalized":"7","pack_path":"ifrs11.md","char_start":0,"char_end":10,"snippet_en":"Joint control","status":"current"}]}"#,
        )
        .expect("paragraphs");

        let hits = search_pack(temp.path(), false, "IFRS 11", 5);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].standard_id, "IFRS 11");
        assert_eq!(hits[0].rank, REGISTRY_FALLBACK_RANK);
    }

    #[test]
    fn gather_evidence_respects_budget_limits() {
        let temp = tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("dir");
        fs::write(
            temp.path().join("registry.json"),
            r#"{"schema_version":1,"content_version":"1","standards":[]}"#,
        )
        .expect("registry");
        fs::write(
            temp.path().join("index/paragraphs.json"),
            r#"{"entries":[
                {"standard_id":"IFRS 11","paragraph":"7","paragraph_normalized":"7","pack_path":"ifrs11.md","char_start":0,"char_end":10,"snippet_en":"Joint control","status":"current"},
                {"standard_id":"IFRS 11","paragraph":"8","paragraph_normalized":"8","pack_path":"ifrs11.md","char_start":20,"char_end":30,"snippet_en":"Joint venture","status":"current"}
            ]}"#,
        )
        .expect("paragraphs");

        let plan = RetrievalPlan {
            queries: vec!["joint control".to_string()],
            standards: vec!["IFRS 11".to_string()],
        };
        let pack = gather_evidence(
            temp.path(),
            false,
            &plan,
            EvidenceBudget {
                max_items: 1,
                max_item_chars: 50,
                max_total_chars: 50,
            },
        );
        assert_eq!(pack.items.len(), 1);
        assert!(pack.items[0].snippet_en.chars().count() <= 50);
    }

    #[test]
    fn truncate_for_continue_keeps_full_text_for_short_docs() {
        let doc = "short doc";
        assert_eq!(truncate_for_continue(doc, "question"), doc);
    }

    #[test]
    fn truncate_for_continue_extracts_headings_for_long_docs() {
        let doc = format!(
            "---\ntitle: x\n---\n\n## TL;DR\nbrief\n\n{}\n\n## 结论\nfinal",
            "x".repeat(13_000)
        );
        let truncated = truncate_for_continue(&doc, "无关问题");
        assert!(truncated.contains("## TL;DR"));
        assert!(truncated.contains("## 结论"));
        assert!(truncated.chars().count() <= 12_000);
    }
}
