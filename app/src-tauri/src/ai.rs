use std::fs;
use std::path::Path;

use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::citations::{load_paragraphs, resolve_citation, scan_citations};
use crate::config::AiConfig;
use crate::models::{CitationScanResult, GenerateProjectResult, ProjectValidationReport};
use crate::projects::{self, ParsedAiDocument};

const PROJECT_NAME_START: &str = "<<<PROJECT_NAME>>>";
const PROJECT_NAME_END: &str = "<<<END_PROJECT_NAME>>>";
const MARKDOWN_START: &str = "<<<MARKDOWN>>>";
const MARKDOWN_END: &str = "<<<END_MARKDOWN>>>";

#[derive(Debug, Deserialize)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessage {
    content: String,
}

#[derive(Debug, Serialize)]
struct OpenAiRequest<'a> {
    model: &'a str,
    messages: Vec<OpenAiChatMessage<'a>>,
    temperature: f32,
}

#[derive(Debug, Serialize)]
struct OpenAiChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

pub fn load_writing_spec(content_dir: &Path) -> Result<(String, String), String> {
    let guide_path = content_dir.join("writing-spec/项目编写说明.md");
    let skill_path = content_dir.join("writing-spec/SKILL.md");
    let guide = fs::read_to_string(&guide_path)
        .map_err(|error| format!("无法读取 writing-spec/项目编写说明.md: {error}"))?;
    let skill = fs::read_to_string(&skill_path)
        .map_err(|error| format!("无法读取 writing-spec/SKILL.md: {error}"))?;
    Ok((guide, skill))
}

pub fn build_system_prompt(
    content_dir: &Path,
    allow_legacy: bool,
) -> Result<String, String> {
    let (guide, skill) = load_writing_spec(content_dir)?;
    let paragraphs = load_paragraphs(content_dir)?;
    let mut allowed: Vec<String> = paragraphs
        .iter()
        .filter(|entry| allow_legacy || entry.status == "current")
        .map(|entry| format!("{} §{}", entry.standard_id, entry.paragraph))
        .collect();
    allowed.sort();
    allowed.dedup();

    let allowed_list = if allowed.is_empty() {
        "(pack 中暂无可用段落索引)".to_string()
    } else {
        allowed.join("\n")
    };

    Ok(format!(
        "你是 AccoutingStandards Desktop 的项目笔记写作助手。\n\n\
         ## 编写规范\n{guide}\n\n## 写作技能\n{skill}\n\n\
         ## 引用约束\n\
         只能引用以下 pack 段落（status=current{}）：\n{allowed_list}\n\n\
         ## 分析约束（红线）\n\
         - 准则英文原文：只能使用 user message 中「知识库提供的准则原文」逐字引用\n\
         - 分析与结论：只能依据上述 pack 原文及 user message 中的 pack 段落进行推理，不得引入 pack 未提供的准则段落或凭模型记忆补充准则依据\n\
         - 若 pack 未覆盖所需段落，必须写「知识库暂无该准则」，不得编造\n\
         - 禁止联网或使用 pack 以外的准则来源\n\n\
         ## 输出格式（必须严格遵守）\n\
         1. 先输出短项目名（2-12 字中文，用于文件名与 # 标题）\n\
         2. 再输出完整 Markdown 正文\n\
         3. Markdown 正文必须以 YAML frontmatter 开头（tags、date、status、type、standards、related），格式见编写规范第三节\n\
         4. 「准则原文（知识库）」节只能使用 user message 中「知识库提供的准则原文」的英文原文，禁止凭模型记忆或网络知识编写\n\
         5. 使用以下分隔符，不要添加其它前言或结语：\n\
         {PROJECT_NAME_START}\n项目名\n{PROJECT_NAME_END}\n\
         {MARKDOWN_START}\n---\n...\n---\n\n# 项目名\n...\n{MARKDOWN_END}\n\n\
         正文首个一级标题必须与项目名一致。引用格式示例：IFRS 11 §7-8、IAS 28 §16、ASC 740-10-25-5。",
        if allow_legacy { "，含 legacy" } else { "" },
    ))
}

pub fn build_user_prompt(question: &str, facts: Option<&str>) -> String {
    let trimmed = question.trim();
    let Some(facts_text) = facts.map(str::trim).filter(|value| !value.is_empty()) else {
        return format!("用户问题：\n{trimmed}");
    };
    format!("用户问题：\n{trimmed}\n\n补充事实：\n{facts_text}")
}

pub fn build_user_prompt_with_pack(
    question: &str,
    facts: Option<&str>,
    pack_snippets: &[(String, String)],
) -> String {
    let mut prompt = build_user_prompt(question, facts);
    if pack_snippets.is_empty() {
        return prompt;
    }

    prompt.push_str(
        "\n\n## 知识库提供的准则原文\n\
         「准则原文（知识库）」节必须逐字使用以下英文原文；若某段落未列出，写「知识库暂无该准则」并勿编造。\n",
    );
    for (citation, snippet) in pack_snippets {
        prompt.push_str(&format!("\n### {citation}\n{snippet}\n"));
    }
    prompt
}

pub fn build_continue_user_prompt(
    existing_markdown: &str,
    question: &str,
    facts: Option<&str>,
    pack_snippets: &[(String, String)],
) -> String {
    let mut prompt = format!(
        "现有项目笔记（请在此基础上更新，输出完整新版 Markdown）：\n\n{existing_markdown}\n\n---\n\n用户追问：\n{}",
        question.trim()
    );
    if let Some(facts_text) = facts.map(str::trim).filter(|value| !value.is_empty()) {
        prompt.push_str(&format!("\n\n补充事实：\n{facts_text}"));
    }
    prompt.push_str(
        "\n\n更新要求：\n\
         - 保留 frontmatter 中的初稿 date\n\
         - 在文末「日志」追加今日更新记录\n\
         - 新增或修改的准则原文必须来自下方知识库片段\n\
         - 输出格式与新建笔记相同（PROJECT_NAME + MARKDOWN 区块）",
    );
    if !pack_snippets.is_empty() {
        prompt.push_str("\n\n## 知识库提供的准则原文\n");
        for (citation, snippet) in pack_snippets {
            prompt.push_str(&format!("\n### {citation}\n{snippet}\n"));
        }
    }
    prompt
}

pub fn collect_relevant_pack_snippets(
    content_dir: &Path,
    question: &str,
    facts: Option<&str>,
    existing_content: Option<&str>,
    allow_legacy: bool,
    limit: usize,
) -> Result<Vec<(String, String)>, String> {
    let combined = format!(
        "{question}\n{}\n{}",
        facts.unwrap_or(""),
        existing_content.unwrap_or("")
    );
    let entries = load_paragraphs(content_dir)?;
    let mut scored: Vec<(i32, String, String)> = Vec::new();

    for citation in scan_citations(&combined) {
        if let Some(target) = resolve_citation(content_dir, &citation)? {
            if target.paragraph_resolved
                && (allow_legacy || target.status == "current")
                && !target.snippet_en.trim().is_empty()
            {
                scored.push((
                    100,
                    format!("{} §{}", target.standard_id, target.paragraph),
                    target.snippet_en,
                ));
            }
        }
    }

    let standard_pattern =
        Regex::new(r"(?i)(IFRS|IAS)\s+(\d+[A-Za-z]?)").map_err(|error| error.to_string())?;
    for caps in standard_pattern.captures_iter(&combined) {
        let standard_id = format!(
            "{} {}",
            caps.get(1).map(|value| value.as_str()).unwrap_or("IFRS").to_uppercase(),
            caps.get(2).map(|value| value.as_str()).unwrap_or("")
        );
        for entry in &entries {
            if !entry.standard_id.eq_ignore_ascii_case(&standard_id) {
                continue;
            }
            if entry.status != "current" && !allow_legacy {
                continue;
            }
            let citation = format!("{} §{}", entry.standard_id, entry.paragraph);
            if let Some(target) = resolve_citation(content_dir, &citation)? {
                if target.paragraph_resolved && !target.snippet_en.trim().is_empty() {
                    scored.push((40, citation, target.snippet_en));
                }
            }
        }
    }

    scored.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| left.1.cmp(&right.1)));
    let mut selected = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for (_, citation, snippet) in scored {
        if seen.insert(citation.clone()) {
            selected.push((citation, snippet));
        }
        if selected.len() >= limit {
            break;
        }
    }
    Ok(selected)
}

fn extract_citation_from_quote_header(line: &str) -> Option<String> {
    let start = line.find("**")? + 2;
    let rest = line.get(start..)?;
    let end = rest.find('（')?;
    Some(rest[..end].trim().to_string())
}

pub fn inject_pack_quotes(content_dir: &Path, markdown: &str) -> Result<(String, Vec<String>), String> {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut out_lines: Vec<String> = Vec::new();
    let mut warnings = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        if line.contains("（知识库原文）") {
            if let Some(citation) = extract_citation_from_quote_header(line) {
                match resolve_citation(content_dir, &citation)? {
                    Some(target)
                        if target.paragraph_resolved && !target.snippet_en.trim().is_empty() =>
                    {
                        let label = format!("{} §{}", target.standard_id, target.paragraph);
                        out_lines.push(format!("> **{label}（知识库原文）：**"));
                        out_lines.push(">".to_string());
                        for snippet_line in target.snippet_en.lines() {
                            out_lines.push(format!("> {snippet_line}"));
                        }
                        index += 1;
                        while index < lines.len()
                            && (lines[index].starts_with('>')
                                || (lines[index].trim().is_empty()
                                    && index + 1 < lines.len()
                                    && lines[index + 1].starts_with('>')))
                        {
                            index += 1;
                        }
                        continue;
                    }
                    Some(_) => {
                        out_lines.push(line.to_string());
                    }
                    None => {
                        warnings
                            .push(format!("知识库暂无该段落，已保留 AI 原文：{citation}"));
                        out_lines.push(line.to_string());
                    }
                }
            } else {
                out_lines.push(line.to_string());
            }
        } else {
            out_lines.push(line.to_string());
        }
        index += 1;
    }

    Ok((out_lines.join("\n"), warnings))
}

fn finalize_project_markdown(
    content_dir: &Path,
    project_name: &str,
    markdown: &str,
    folder_relative: Option<&str>,
    preserve_date: Option<&str>,
    allow_legacy: bool,
) -> Result<(String, ProjectValidationReport), String> {
    let heading_aligned = projects::ensure_heading_matches_name(project_name, markdown);
    let (with_pack_quotes, pack_warnings) = inject_pack_quotes(content_dir, &heading_aligned)?;
    let with_frontmatter = projects::ensure_frontmatter(
        &with_pack_quotes,
        project_name,
        folder_relative,
        preserve_date,
    );
    let mut validation = validate_project_content(&with_frontmatter, content_dir, allow_legacy)?;
    validation.warnings.extend(pack_warnings);
    if !projects::has_yaml_frontmatter(&with_frontmatter) {
        validation
            .warnings
            .push("缺少 YAML frontmatter（tags/date/status/type/standards）。".to_string());
    }
    Ok((with_frontmatter, validation))
}

pub fn parse_ai_response(raw: &str) -> Result<ParsedAiDocument, String> {
    let project_name = extract_block(raw, PROJECT_NAME_START, PROJECT_NAME_END)
        .ok_or_else(|| "AI 响应缺少 PROJECT_NAME 区块".to_string())?;
    let markdown = extract_block(raw, MARKDOWN_START, MARKDOWN_END)
        .ok_or_else(|| "AI 响应缺少 MARKDOWN 区块".to_string())?;

    let project_name = projects::sanitize_project_name(&project_name);
    if project_name.is_empty() {
        return Err("AI 生成的项目名为空".to_string());
    }

    let markdown = markdown.trim().to_string();
    if markdown.is_empty() {
        return Err("AI 生成的正文为空".to_string());
    }

    Ok(ParsedAiDocument {
        project_name,
        markdown,
    })
}

fn extract_block(raw: &str, start: &str, end: &str) -> Option<String> {
    let start_index = raw.find(start)? + start.len();
    let end_index = raw[start_index..].find(end)? + start_index;
    Some(raw[start_index..end_index].trim().to_string())
}

pub async fn call_openai(
    ai: &AiConfig,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let provider = ai
        .provider
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("openai");

    let api_key = ai
        .api_key
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("请先在「设置 → AI 写作」中配置 {provider} 的 API Key。"))?;

    let model = ai
        .model
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("gpt-4o");

    let base_url = ai
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("https://api.openai.com/v1")
        .trim_end_matches('/');

    let endpoint = format!("{base_url}/chat/completions");

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?;

    let request = OpenAiRequest {
        model,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: system_prompt,
            },
            OpenAiChatMessage {
                role: "user",
                content: user_prompt,
            },
        ],
        temperature: 0.3,
    };

    let response = client
        .post(&endpoint)
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|error| format!("{provider} 请求失败: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("{provider} 返回错误 ({status}): {body}"));
    }

    let payload: OpenAiResponse = response
        .json()
        .await
        .map_err(|error| format!("无法解析 {provider} 响应: {error}"))?;

    payload
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .ok_or_else(|| format!("{provider} 响应为空"))
}

pub fn validate_project_content(
    content: &str,
    content_dir: &Path,
    allow_legacy: bool,
) -> Result<ProjectValidationReport, String> {
    use crate::citations::resolve_citation;

    let citations = scan_citations(content);
    let mut citation_results = Vec::new();
    let mut warnings = Vec::new();

    for citation in citations {
        let target = resolve_citation(content_dir, &citation)?;
        let resolved = target.is_some();
        if !resolved {
            warnings.push(format!("未在本地 pack 找到引用：{citation}"));
        } else if let Some(ref hit) = target {
            if hit.status == "legacy" && !allow_legacy {
                warnings.push(format!("引用了旧准则（默认不允许）：{citation}"));
            }
        }
        citation_results.push(CitationScanResult {
            citation: citation.clone(),
            resolved,
            target,
        });
    }

    if content.contains('「') && !content.contains("原文") {
        warnings.push("正文含中文提炼，请确认是否已标注「原文」。".to_string());
    }

    if content.contains("B-实务") || content.contains("## B") {
        let has_conclusion = content.contains("结论")
            || content.contains("建议")
            || content.contains("判断")
            || content.contains("应");
        if !has_conclusion {
            warnings.push("B-实务决策 节可能缺少明确的操作结论。".to_string());
        }
    }

    Ok(ProjectValidationReport {
        citations: citation_results,
        warnings,
    })
}

pub async fn generate_and_save_project(
    projects_root: &Path,
    content_dir: &Path,
    ai: &AiConfig,
    question: &str,
    facts: Option<&str>,
    folder_relative: Option<&str>,
) -> Result<GenerateProjectResult, String> {
    let system_prompt = build_system_prompt(content_dir, ai.allow_legacy_citations)?;
    let pack_snippets = collect_relevant_pack_snippets(
        content_dir,
        question,
        facts,
        None,
        ai.allow_legacy_citations,
        24,
    )?;
    let user_prompt = build_user_prompt_with_pack(question, facts, &pack_snippets);
    let raw = call_openai(ai, &system_prompt, &user_prompt).await?;
    let parsed = parse_ai_response(&raw)?;
    let similar_projects = projects::find_similar_projects(projects_root, &parsed.project_name)?;
    let (normalized_markdown, mut validation) = finalize_project_markdown(
        content_dir,
        &parsed.project_name,
        &parsed.markdown,
        folder_relative,
        None,
        ai.allow_legacy_citations,
    )?;
    for item in &similar_projects {
        validation.warnings.push(format!(
            "发现相似历史项目「{}」（{}）：{}",
            item.title, item.relative_path, item.reason
        ));
    }
    let entry = projects::save_generated_project(
        projects_root,
        &parsed.project_name,
        &normalized_markdown,
        folder_relative,
    )?;

    Ok(GenerateProjectResult {
        project_name: parsed.project_name,
        file_path: entry.path.clone(),
        relative_path: entry.relative_path.clone(),
        title: entry.title.clone(),
        content: normalized_markdown,
        validation,
        similar_projects,
    })
}

pub async fn continue_and_update_project(
    projects_root: &Path,
    content_dir: &Path,
    ai: &AiConfig,
    file_path: &Path,
    question: &str,
    facts: Option<&str>,
) -> Result<GenerateProjectResult, String> {
    let existing = projects::read_project_file(projects_root, file_path)?;
    let preserve_date = projects::extract_frontmatter_date(&existing);
    let project_name = projects::extract_title_for_entry(&existing, "项目");
    let folder_relative = file_path
        .parent()
        .and_then(|parent| parent.strip_prefix(projects_root).ok())
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .filter(|value| !value.is_empty());

    let system_prompt = format!(
        "{}\n\n## 更新模式\n\
         你正在更新已有项目笔记，不是新建。保留 frontmatter 中的初稿 date，在「日志」追加今日更新。",
        build_system_prompt(content_dir, ai.allow_legacy_citations)?
    );
    let pack_snippets = collect_relevant_pack_snippets(
        content_dir,
        question,
        facts,
        Some(&existing),
        ai.allow_legacy_citations,
        24,
    )?;
    let user_prompt = build_continue_user_prompt(&existing, question, facts, &pack_snippets);
    let raw = call_openai(ai, &system_prompt, &user_prompt).await?;
    let parsed = parse_ai_response(&raw)?;
    let resolved_name = if parsed.project_name.trim().is_empty() {
        project_name.clone()
    } else {
        parsed.project_name.clone()
    };
    let (normalized_markdown, validation) = finalize_project_markdown(
        content_dir,
        &resolved_name,
        &parsed.markdown,
        folder_relative.as_deref(),
        preserve_date.as_deref(),
        ai.allow_legacy_citations,
    )?;
    let entry = projects::update_project_file(projects_root, file_path, &normalized_markdown)?;

    Ok(GenerateProjectResult {
        project_name: resolved_name,
        file_path: entry.path.clone(),
        relative_path: entry.relative_path.clone(),
        title: entry.title.clone(),
        content: normalized_markdown,
        validation,
        similar_projects: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ai_response_blocks() {
        let raw = format!(
            "{PROJECT_NAME_START}\n合营安排判断\n{PROJECT_NAME_END}\n\
             {MARKDOWN_START}\n# 合营安排判断\n\n正文 IFRS 11 §7-8\n{MARKDOWN_END}"
        );
        let parsed = parse_ai_response(&raw).expect("parsed");
        assert_eq!(parsed.project_name, "合营安排判断");
        assert!(parsed.markdown.contains("IFRS 11 §7-8"));
    }

    #[test]
    fn build_user_prompt_includes_facts() {
        let prompt = build_user_prompt("如何判断合营？", Some("50:50 持股"));
        assert!(prompt.contains("50:50 持股"));
    }

    #[test]
    fn build_user_prompt_with_pack_includes_snippets() {
        let snippets = vec![(
            "IFRS 11 §7".to_string(),
            "Joint control is ...".to_string(),
        )];
        let prompt = build_user_prompt_with_pack("问题", None, &snippets);
        assert!(prompt.contains("Joint control is"));
        assert!(prompt.contains("IFRS 11 §7"));
    }
}
