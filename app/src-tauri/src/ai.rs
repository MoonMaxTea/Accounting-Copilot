use std::fs;
use std::path::Path;

use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::citations::{load_paragraphs, scan_citations};
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
         ## 输出格式（必须严格遵守）\n\
         1. 先输出短项目名（2-12 字中文，用于文件名与 # 标题）\n\
         2. 再输出完整 Markdown 正文\n\
         3. 使用以下分隔符，不要添加其它前言或结语：\n\
         {PROJECT_NAME_START}\n项目名\n{PROJECT_NAME_END}\n\
         {MARKDOWN_START}\n# 项目名\n...\n{MARKDOWN_END}\n\n\
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
    let api_key = ai
        .api_key
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "请先在「设置」中配置 OpenAI API Key。".to_string())?;

    let model = ai
        .model
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("gpt-4o");

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
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|error| format!("OpenAI 请求失败: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI 返回错误 ({status}): {body}"));
    }

    let payload: OpenAiResponse = response
        .json()
        .await
        .map_err(|error| format!("无法解析 OpenAI 响应: {error}"))?;

    payload
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .ok_or_else(|| "OpenAI 响应为空".to_string())
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
    let user_prompt = build_user_prompt(question, facts);
    let raw = call_openai(ai, &system_prompt, &user_prompt).await?;
    let parsed = parse_ai_response(&raw)?;
    let normalized_markdown =
        projects::ensure_heading_matches_name(&parsed.project_name, &parsed.markdown);
    let validation = validate_project_content(
        &normalized_markdown,
        content_dir,
        ai.allow_legacy_citations,
    )?;
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
}
