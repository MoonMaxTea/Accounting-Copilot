use std::path::Path;

use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::citations::{resolve_citation, scan_citations};
use crate::config::AiConfig;
use crate::ai_agent::{AgentMode, AgentRunInput, run_standards_agent};
use crate::models::{AiAgentMessage, AiConversationTurn, CitationScanResult, GenerateProjectResult, ProjectValidationReport};
use crate::projects::{self, ParsedAiDocument};

pub(crate) const PROJECT_NAME_START: &str = "<<<PROJECT_NAME>>>";
pub(crate) const PROJECT_NAME_END: &str = "<<<END_PROJECT_NAME>>>";
pub(crate) const MARKDOWN_START: &str = "<<<MARKDOWN>>>";
pub(crate) const MARKDOWN_END: &str = "<<<END_MARKDOWN>>>";

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

fn extract_citation_from_quote_header(line: &str) -> Option<String> {
    let start = line.find("**")? + 2;
    let rest = line.get(start..)?;
    let end = rest.find('（')?;
    Some(rest[..end].trim().to_string())
}

/// Maximum number of characters allowed inside a single「知识库原文」blockquote.
/// The system prompt (铁律 2) caps quotes at ~4 sentences; this is the
/// code-level safety net that guarantees no multi-thousand-character English
/// dump survives into the saved note, regardless of model behaviour.
const MAX_QUOTE_CHARS: usize = 600;

/// Collapse the body lines of a「知识库原文」blockquote (the `>`-prefixed lines
/// following the header) and, if the quoted text exceeds `MAX_QUOTE_CHARS`,
/// truncate it at a UTF-8 character boundary.  Returns the (possibly rewritten)
/// blockquote body lines and whether truncation occurred.
fn cap_quote_body(body_lines: &[String]) -> (Vec<String>, bool) {
    let text = body_lines
        .iter()
        .map(|line| line.trim_start_matches('>').trim())
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if text.chars().count() <= MAX_QUOTE_CHARS {
        return (body_lines.to_vec(), false);
    }

    let truncated: String = text.chars().take(MAX_QUOTE_CHARS).collect();
    let capped = format!("{}…", truncated.trim_end());
    (vec![">".to_string(), format!("> {capped}")], true)
}

/// Enforce the「知识库原文」引用 length limits in the model's output.
///
/// Historically this function *expanded* each quote by pasting up to 4 000
/// characters of pack text into the document — which directly contradicted the
/// system prompt's "2-4 sentences, never paste" rule and produced multi-thousand
/// character English dumps.  It now only *caps* over-long quotes and flags
/// citations that cannot be resolved in the local pack; it never inflates them.
pub fn inject_pack_quotes(content_dir: &Path, markdown: &str) -> Result<(String, Vec<String>), String> {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut out_lines: Vec<String> = Vec::new();
    let mut warnings = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        if line.contains("（知识库原文）") {
            if let Some(citation) = extract_citation_from_quote_header(line) {
                if resolve_citation(content_dir, &citation)?.is_none() {
                    warnings.push(format!(
                        "段落未在本地准则库中找到，已保留 AI 原文，请人工核实：{citation}"
                    ));
                }
            }
            out_lines.push(line.to_string());
            index += 1;

            let mut body_lines: Vec<String> = Vec::new();
            while index < lines.len()
                && (lines[index].starts_with('>')
                    || (lines[index].trim().is_empty()
                        && index + 1 < lines.len()
                        && lines[index + 1].starts_with('>')))
            {
                body_lines.push(lines[index].to_string());
                index += 1;
            }

            let (capped_body, truncated) = cap_quote_body(&body_lines);
            out_lines.extend(capped_body);
            if truncated {
                warnings.push(
                    "检测到超长准则原文引用，已自动截断（铁律：每段英文引用 ≤ 4 句）。".to_string(),
                );
            }
            continue;
        }

        out_lines.push(line.to_string());
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
    question: Option<&str>,
    is_continue: bool,
) -> Result<(String, ProjectValidationReport), String> {
    let heading_aligned = projects::ensure_heading_matches_name(project_name, markdown);
    let (with_pack_quotes, pack_warnings) = inject_pack_quotes(content_dir, &heading_aligned)?;
    let with_frontmatter = projects::ensure_frontmatter(
        &with_pack_quotes,
        project_name,
        folder_relative,
        preserve_date,
    );
    let stripped = projects::strip_trailing_log_section(&with_frontmatter);
    let with_log = if let Some(q) = question.filter(|value| !value.trim().is_empty()) {
        projects::append_log_for_turn(&stripped, q.trim(), is_continue, preserve_date)
    } else {
        stripped
    };
    let (sanitized, ban_warnings) = sanitize_banned_phrases(&with_log);
    let mut validation = validate_project_content(&sanitized, content_dir, allow_legacy)?;
    validation.warnings.extend(pack_warnings);
    validation.warnings.extend(ban_warnings);
    if !projects::has_yaml_frontmatter(&sanitized) {
        validation
            .warnings
            .push("缺少 YAML frontmatter（tags/date/status/type/standards）。".to_string());
    }
    let with_disclaimer = append_ai_disclaimer(&sanitized);
    Ok((with_disclaimer, validation))
}

/// AI 生成文档免责声明
const AI_DISCLAIMER: &str =
    "\n\n> ⚠️ 本文档由 AI 辅助生成，引用来源为本地会计准则库。所有准则引用均需人工核对官网原文。需人工进行专业复核。\n";

fn append_ai_disclaimer(markdown: &str) -> String {
    if markdown.contains("本文档由 AI 辅助生成") {
        return markdown.to_string();
    }
    let mut out = markdown.to_string();
    out.push_str(AI_DISCLAIMER);
    out
}

/// 扫描并替换 AI 输出中禁止出现的短语
fn sanitize_banned_phrases(markdown: &str) -> (String, Vec<String>) {
    let banned: &[&str] = &[
        "知识库暂无该准则",
        "知识库暂无该段落",
        "知识库暂无",
        "暂无该准则",
        "暂无该段落",
    ];
    let replacement = "当前本地准则库版本中未收录该段落，建议查阅官网原文确认。";
    let mut warnings = Vec::new();
    let mut result = markdown.to_string();
    for phrase in banned {
        if result.contains(phrase) {
            warnings.push(format!(
                "AI 输出中包含不推荐的短语「{phrase}」，已自动替换为专业表述。"
            ));
            result = result.replace(phrase, replacement);
        }
    }
    // 去重连续重复的替换文本
    let doubled = format!("{replacement}\n\n{replacement}");
    while result.contains(&doubled) {
        result = result.replace(&doubled, replacement);
    }
    (result, warnings)
}

pub fn parse_ai_response(raw: &str, fallback_question: Option<&str>) -> Result<ParsedAiDocument, String> {
    let project_name = extract_block(raw, PROJECT_NAME_START, PROJECT_NAME_END)
        .or_else(|| {
            // Fallback: extract from the first "# Title" in the markdown block
            let md = extract_block(raw, MARKDOWN_START, MARKDOWN_END)
                .or_else(|| Some(raw.to_string()))?;
            md.lines()
                .find(|line| line.starts_with("# ") && !line.starts_with("## "))
                .map(|line| line.trim_start_matches("# ").trim().to_string())
        })
        .or_else(|| {
            fallback_question.map(|q| {
                let trimmed = q.trim().replace('\n', " ");
                if trimmed.chars().count() > 12 {
                    trimmed.chars().take(12).collect::<String>()
                } else {
                    trimmed
                }
            })
        })
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
    app_handle: Option<&tauri::AppHandle>,
    projects_root: &Path,
    content_dir: &Path,
    ai: &AiConfig,
    question: &str,
    facts: Option<&str>,
    folder_relative: Option<&str>,
    prior_session: Vec<AiAgentMessage>,
) -> Result<(GenerateProjectResult, Vec<AiAgentMessage>, Vec<AiConversationTurn>), String> {
    let agent_output = run_standards_agent(
        app_handle,
        content_dir,
        ai,
        AgentRunInput {
            mode: AgentMode::Create,
            question,
            facts,
            existing_markdown: None,
            prior_messages: prior_session,
        },
    )
    .await?;
    let parsed = parse_ai_response(&agent_output.raw_response, Some(question))?;
    let similar_projects = projects::find_similar_projects(projects_root, &parsed.project_name)?;
    let (normalized_markdown, mut validation) = finalize_project_markdown(
        content_dir,
        &parsed.project_name,
        &parsed.markdown,
        folder_relative,
        None,
        ai.allow_legacy_citations,
        Some(question),
        false,
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

    Ok((
        GenerateProjectResult {
            project_name: parsed.project_name,
            file_path: entry.path.clone(),
            relative_path: entry.relative_path.clone(),
            title: entry.title.clone(),
            content: normalized_markdown,
            validation,
            similar_projects,
        },
        agent_output.session_messages,
        agent_output.activity_log,
    ))
}

pub async fn continue_and_update_project(
    app_handle: Option<&tauri::AppHandle>,
    projects_root: &Path,
    content_dir: &Path,
    ai: &AiConfig,
    file_path: &Path,
    question: &str,
    facts: Option<&str>,
    prior_session: Vec<AiAgentMessage>,
) -> Result<(GenerateProjectResult, Vec<AiAgentMessage>, Vec<AiConversationTurn>), String> {
    let existing = projects::read_project_file(projects_root, file_path)?;
    let preserve_date = projects::extract_frontmatter_date(&existing);
    let project_name = projects::extract_title_for_entry(&existing, "项目");
    let folder_relative = file_path
        .parent()
        .and_then(|parent| parent.strip_prefix(projects_root).ok())
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .filter(|value| !value.is_empty());

    let agent_output = run_standards_agent(
        app_handle,
        content_dir,
        ai,
        AgentRunInput {
            mode: AgentMode::Continue,
            question,
            facts,
            existing_markdown: Some(&existing),
            prior_messages: prior_session,
        },
    )
    .await?;
    let parsed = parse_ai_response(&agent_output.raw_response, Some(question))?;
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
        Some(question),
        true,
    )?;
    let entry = projects::update_project_file(projects_root, file_path, &normalized_markdown)?;

    Ok((
        GenerateProjectResult {
            project_name: resolved_name,
            file_path: entry.path.clone(),
            relative_path: entry.relative_path.clone(),
            title: entry.title.clone(),
            content: normalized_markdown,
            validation,
            similar_projects: Vec::new(),
        },
        agent_output.session_messages,
        agent_output.activity_log,
    ))
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
        let parsed = parse_ai_response(&raw, None).expect("parsed");
        assert_eq!(parsed.project_name, "合营安排判断");
        assert!(parsed.markdown.contains("IFRS 11 §7-8"));
    }

    #[test]
    fn cap_quote_body_keeps_short_quotes_verbatim() {
        let body = vec![
            ">".to_string(),
            "> A deferred tax asset shall be recognised.".to_string(),
        ];
        let (out, truncated) = cap_quote_body(&body);
        assert!(!truncated);
        assert_eq!(out, body);
    }

    #[test]
    fn cap_quote_body_truncates_long_quotes() {
        let long = "Sentence. ".repeat(200); // ~2000 chars, far over the cap
        let body = vec![">".to_string(), format!("> {long}")];
        let (out, truncated) = cap_quote_body(&body);
        assert!(truncated);
        let rendered = out.join("\n");
        assert!(rendered.ends_with('…'));
        let quoted_chars = rendered
            .lines()
            .map(|line| line.trim_start_matches('>').trim().chars().count())
            .sum::<usize>();
        assert!(quoted_chars <= MAX_QUOTE_CHARS + 1);
    }

    #[test]
    fn inject_pack_quotes_does_not_expand_quotes() {
        // Citation header that does not parse → no disk access, exercises the
        // cap-only path and guarantees no 4 000-char expansion happens.
        let temp = std::path::Path::new("/nonexistent-content-dir");
        let long = "x".repeat(1500);
        let markdown = format!("> **Note（知识库原文）：**\n>\n> {long}\n\n后续中文分析。");
        let (out, _warnings) = inject_pack_quotes(temp, &markdown).expect("inject");
        assert!(out.chars().count() < markdown.chars().count());
        assert!(out.contains("…"));
        assert!(out.contains("后续中文分析。"));
    }
}
