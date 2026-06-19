use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::{
    build_system_prompt, load_writing_spec, parse_ai_response, MARKDOWN_END, MARKDOWN_START,
    PROJECT_NAME_END, PROJECT_NAME_START,
};
use crate::citations::{load_paragraphs, resolve_citation};
use crate::config::AiConfig;
use crate::db;
use crate::models::{AiAgentMessage, AiAgentToolCall, AiConversationTurn};

const MAX_TOOL_ROUNDS: usize = 12;
const MAX_SESSION_MESSAGES: usize = 80;

#[derive(Debug, Clone, Copy)]
pub enum AgentMode {
    Create,
    Continue,
}

pub struct AgentRunInput<'a> {
    pub mode: AgentMode,
    pub question: &'a str,
    pub facts: Option<&'a str>,
    pub existing_markdown: Option<&'a str>,
    pub prior_messages: Vec<AiAgentMessage>,
}

pub struct AgentRunOutput {
    pub raw_response: String,
    pub session_messages: Vec<AiAgentMessage>,
    pub activity_log: Vec<AiConversationTurn>,
}

#[derive(Debug, Deserialize)]
struct SearchLocalPackArgs {
    query: String,
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct GetPackParagraphArgs {
    citation: String,
}

#[derive(Debug, Deserialize)]
struct ListStandardParagraphsArgs {
    standard_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ApiChatMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ApiToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ApiToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: ApiToolFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ApiToolFunction {
    name: String,
    arguments: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: ApiChatMessage,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn pack_agent_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "search_local_pack",
                "description": "Search the local IFRS/IAS/US GAAP content pack (full-text). Returns standard id, title, and snippet. This is the ONLY allowed way to discover standards.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search keywords in English or Chinese" },
                        "limit": { "type": "integer", "description": "Max results (1-20, default 10)" }
                    },
                    "required": ["query"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "get_pack_paragraph",
                "description": "Fetch exact English paragraph text from local pack by citation, e.g. IFRS 11 §7 or ASC 740-10-25-5.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "citation": { "type": "string", "description": "Citation string" }
                    },
                    "required": ["citation"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "list_standard_paragraphs",
                "description": "List paragraph numbers indexed in local pack for a standard, e.g. IFRS 11.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "standard_id": { "type": "string", "description": "Standard id like IFRS 11 or IAS 28" }
                    },
                    "required": ["standard_id"]
                }
            }
        }),
    ]
}

pub fn build_agent_system_prompt(content_dir: &Path, allow_legacy: bool) -> Result<String, String> {
    let writing = build_system_prompt(content_dir, allow_legacy)?;
    Ok(format!(
        "{writing}\n\n\
         ## Agent 模式（方案 B）\n\
         你是「只能做准则分析」的 Agent，所有准则依据必须通过工具从本地 content pack 获取。\n\n\
         ### 工作流程\n\
         1. 使用 `search_local_pack` 搜索相关准则\n\
         2. 使用 `list_standard_paragraphs` / `get_pack_paragraph` 精确获取 § 原文\n\
         3. 仅基于工具返回的 pack 原文撰写分析与结论\n\
         4. 信息足够后，输出最终笔记（{name_start}…{name_end} + {md_start}…{md_end}）\n\n\
         ### 红线\n\
         - 禁止凭模型记忆或网络补充准则；工具未返回的段落不得引用\n\
         - 「准则原文（知识库）」必须来自 `get_pack_paragraph` 返回的 snippet_en\n\
         - 分析与结论只能引用已通过工具确认存在于 pack 的段落\n\
         - 若 pack 无覆盖，写「知识库暂无该准则」\n\n\
         在输出最终笔记前，可多次调用工具；不要在没有检索 pack 的情况下直接输出最终笔记。",
        name_start = PROJECT_NAME_START,
        name_end = PROJECT_NAME_END,
        md_start = MARKDOWN_START,
        md_end = MARKDOWN_END,
    ))
}

fn build_user_turn(input: &AgentRunInput<'_>) -> String {
    let mut text = match input.mode {
        AgentMode::Create => format!("用户问题：\n{}", input.question.trim()),
        AgentMode::Continue => format!(
            "用户追问（请更新项目笔记，输出完整新版 Markdown）：\n{}",
            input.question.trim()
        ),
    };
    if let Some(facts) = input.facts.map(str::trim).filter(|value| !value.is_empty()) {
        text.push_str(&format!("\n\n补充事实：\n{facts}"));
    }
    if let Some(existing) = input.existing_markdown {
        text.push_str(&format!("\n\n---\n\n当前项目笔记全文：\n{existing}"));
    }
    text
}

fn trim_session(messages: Vec<AiAgentMessage>) -> Vec<AiAgentMessage> {
    if messages.len() <= MAX_SESSION_MESSAGES {
        return messages;
    }
    let mut start = messages.len().saturating_sub(MAX_SESSION_MESSAGES);
    while start < messages.len() && messages[start].role == "tool" {
        start += 1;
    }
    messages[start..].to_vec()
}

fn to_api_message(message: &AiAgentMessage) -> ApiChatMessage {
    ApiChatMessage {
        role: message.role.clone(),
        content: message.content.clone(),
        tool_calls: message.tool_calls.as_ref().map(|calls| {
            calls
                .iter()
                .map(|call| ApiToolCall {
                    id: call.id.clone(),
                    call_type: "function".to_string(),
                    function: ApiToolFunction {
                        name: call.name.clone(),
                        arguments: call.arguments.clone(),
                    },
                })
                .collect()
        }),
        tool_call_id: message.tool_call_id.clone(),
        name: message.name.clone(),
    }
}

fn from_api_message(message: &ApiChatMessage) -> AiAgentMessage {
    AiAgentMessage {
        role: message.role.clone(),
        content: message.content.clone(),
        tool_calls: message.tool_calls.as_ref().map(|calls| {
            calls
                .iter()
                .map(|call| AiAgentToolCall {
                    id: call.id.clone(),
                    name: call.function.name.clone(),
                    arguments: call.function.arguments.clone(),
                })
                .collect()
        }),
        tool_call_id: message.tool_call_id.clone(),
        name: message.name.clone(),
    }
}

pub fn execute_pack_tool(
    content_dir: &Path,
    allow_legacy: bool,
    tool_name: &str,
    arguments: &str,
) -> Result<String, String> {
    match tool_name {
        "search_local_pack" => {
            let args: SearchLocalPackArgs =
                serde_json::from_str(arguments).map_err(|error| format!("参数解析失败: {error}"))?;
            let limit = args.limit.unwrap_or(10).clamp(1, 20);
            let hits = db::search_standards(content_dir, &args.query, limit)?;
            let filtered: Vec<_> = hits
                .into_iter()
                .filter(|hit| allow_legacy || !hit.standard_id.is_empty())
                .map(|hit| {
                    json!({
                        "standard_id": hit.standard_id,
                        "title": hit.title,
                        "snippet": hit.snippet,
                        "pack_path": hit.pack_path,
                    })
                })
                .collect();
            serde_json::to_string(&json!({ "results": filtered, "count": filtered.len() }))
                .map_err(|error| error.to_string())
        }
        "get_pack_paragraph" => {
            let args: GetPackParagraphArgs =
                serde_json::from_str(arguments).map_err(|error| format!("参数解析失败: {error}"))?;
            let target = resolve_citation(content_dir, args.citation.trim())?
                .ok_or_else(|| format!("知识库暂无该段落：{}", args.citation.trim()))?;
            if target.status == "legacy" && !allow_legacy {
                return Err(format!(
                    "段落 {} 为 legacy，默认不允许（可在设置中开启 legacy 引用）",
                    args.citation
                ));
            }
            serde_json::to_string(&json!({
                "citation": args.citation,
                "standard_id": target.standard_id,
                "paragraph": target.paragraph,
                "status": target.status,
                "snippet_en": target.snippet_en,
                "paragraph_resolved": target.paragraph_resolved,
            }))
            .map_err(|error| error.to_string())
        }
        "list_standard_paragraphs" => {
            let args: ListStandardParagraphsArgs =
                serde_json::from_str(arguments).map_err(|error| format!("参数解析失败: {error}"))?;
            let entries = load_paragraphs(content_dir)?;
            let mut citations: Vec<String> = entries
                .iter()
                .filter(|entry| entry.standard_id.eq_ignore_ascii_case(&args.standard_id))
                .filter(|entry| allow_legacy || entry.status == "current")
                .map(|entry| format!("{} §{}", entry.standard_id, entry.paragraph))
                .collect();
            citations.sort();
            citations.dedup();
            serde_json::to_string(&json!({
                "standard_id": args.standard_id,
                "paragraphs": citations,
                "count": citations.len(),
            }))
            .map_err(|error| error.to_string())
        }
        _ => Err(format!("未知工具：{tool_name}")),
    }
}

fn tool_activity_label(tool_name: &str, arguments: &str) -> String {
    match tool_name {
        "search_local_pack" => {
            let query = serde_json::from_str::<SearchLocalPackArgs>(arguments)
                .map(|args| args.query)
                .unwrap_or_else(|_| arguments.to_string());
            format!("搜索知识库：{query}")
        }
        "get_pack_paragraph" => {
            let citation = serde_json::from_str::<GetPackParagraphArgs>(arguments)
                .map(|args| args.citation)
                .unwrap_or_else(|_| arguments.to_string());
            format!("读取段落：{citation}")
        }
        "list_standard_paragraphs" => {
            let standard_id = serde_json::from_str::<ListStandardParagraphsArgs>(arguments)
                .map(|args| args.standard_id)
                .unwrap_or_else(|_| arguments.to_string());
            format!("列出段落索引：{standard_id}")
        }
        _ => format!("调用工具：{tool_name}"),
    }
}

fn response_has_final_blocks(text: &str) -> bool {
    text.contains(MARKDOWN_START) && text.contains(MARKDOWN_END)
}

async fn call_chat_with_tools(
    ai: &AiConfig,
    messages: &[ApiChatMessage],
    tools: &[Value],
) -> Result<ApiChatMessage, String> {
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
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|error| error.to_string())?;

    let mut payload = json!({
        "model": model,
        "messages": messages,
        "temperature": 0.2,
    });
    if !tools.is_empty() {
        payload["tools"] = json!(tools);
        payload["tool_choice"] = json!("auto");
    }

    let response = client
        .post(&endpoint)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("{provider} 请求失败: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("{provider} 返回错误 ({status}): {body}"));
    }

    let body: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|error| format!("无法解析 {provider} 响应: {error}"))?;

    body.choices
        .first()
        .map(|choice| choice.message.clone())
        .ok_or_else(|| format!("{provider} 响应为空"))
}

pub async fn run_standards_agent(
    content_dir: &Path,
    ai: &AiConfig,
    input: AgentRunInput<'_>,
) -> Result<AgentRunOutput, String> {
    let _writing_spec = load_writing_spec(content_dir)?;
    let system_prompt = build_agent_system_prompt(content_dir, ai.allow_legacy_citations)?;
    let tools = pack_agent_tools();

    let user_turn = build_user_turn(&input);
    let mut session = trim_session(input.prior_messages);
    session.push(AiAgentMessage {
        role: "user".to_string(),
        content: Some(user_turn),
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });

    let mut api_messages = vec![ApiChatMessage {
        role: "system".to_string(),
        content: Some(system_prompt),
        tool_calls: None,
        tool_call_id: None,
        name: None,
    }];
    for message in &session {
        api_messages.push(to_api_message(message));
    }

    let mut activity_log = Vec::new();
    activity_log.push(AiConversationTurn {
        role: "user".to_string(),
        content: input.question.trim().to_string(),
        timestamp_secs: now_secs(),
        kind: match input.mode {
            AgentMode::Create => "create".to_string(),
            AgentMode::Continue => "continue".to_string(),
        },
    });

    let mut final_raw = String::new();

    for _round in 0..MAX_TOOL_ROUNDS {
        let assistant = call_chat_with_tools(ai, &api_messages, &tools).await?;
        let stored_assistant = from_api_message(&assistant);
        session.push(stored_assistant.clone());
        api_messages.push(assistant.clone());

        if let Some(tool_calls) = assistant.tool_calls.as_ref() {
            if tool_calls.is_empty() {
                final_raw = assistant.content.unwrap_or_default();
                break;
            }
            for tool_call in tool_calls {
                let label = tool_activity_label(&tool_call.function.name, &tool_call.function.arguments);
                activity_log.push(AiConversationTurn {
                    role: "assistant".to_string(),
                    content: label.clone(),
                    timestamp_secs: now_secs(),
                    kind: "tool".to_string(),
                });

                let tool_result = match execute_pack_tool(
                    content_dir,
                    ai.allow_legacy_citations,
                    &tool_call.function.name,
                    &tool_call.function.arguments,
                ) {
                    Ok(result) => result,
                    Err(error) => json!({ "error": error }).to_string(),
                };

                let tool_message = AiAgentMessage {
                    role: "tool".to_string(),
                    content: Some(tool_result.clone()),
                    tool_calls: None,
                    tool_call_id: Some(tool_call.id.clone()),
                    name: Some(tool_call.function.name.clone()),
                };
                session.push(tool_message.clone());
                api_messages.push(to_api_message(&tool_message));
            }
            continue;
        }

        final_raw = assistant.content.unwrap_or_default();
        if response_has_final_blocks(&final_raw) {
            break;
        }
        if _round + 1 >= MAX_TOOL_ROUNDS {
            break;
        }

        let nudge = AiAgentMessage {
            role: "user".to_string(),
            content: Some(
                "请继续调用工具补全 pack 依据，或输出最终笔记（必须包含 PROJECT_NAME 与 MARKDOWN 区块）。"
                    .to_string(),
            ),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };
        session.push(nudge.clone());
        api_messages.push(to_api_message(&nudge));
    }

    if final_raw.trim().is_empty() || !response_has_final_blocks(&final_raw) {
        let synthesis_user = AiAgentMessage {
            role: "user".to_string(),
            content: Some(format!(
                "请根据以上工具检索到的 pack 原文，输出最终项目笔记。\n\
                 必须包含 {PROJECT_NAME_START}…{PROJECT_NAME_END} 与 {MARKDOWN_START}…{MARKDOWN_END} 区块。\n\
                 不要调用工具，直接输出完整 Markdown。"
            )),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };
        session.push(synthesis_user.clone());
        api_messages.push(to_api_message(&synthesis_user));

        let assistant = call_chat_with_tools(ai, &api_messages, &[]).await?;
        let stored_assistant = from_api_message(&assistant);
        session.push(stored_assistant);
        api_messages.push(assistant.clone());
        final_raw = assistant.content.unwrap_or_default();
    }

    if final_raw.trim().is_empty() {
        return Err("Agent 未返回最终笔记内容。".to_string());
    }

    parse_ai_response(&final_raw).map_err(|error| {
        format!("Agent 响应格式无效：{error}。请重试或缩短问题。")
    })?;

    activity_log.push(AiConversationTurn {
        role: "assistant".to_string(),
        content: "已生成/更新项目笔记".to_string(),
        timestamp_secs: now_secs(),
        kind: match input.mode {
            AgentMode::Create => "create".to_string(),
            AgentMode::Continue => "continue".to_string(),
        },
    });

    Ok(AgentRunOutput {
        raw_response: final_raw,
        session_messages: trim_session(session),
        activity_log,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn list_standard_paragraphs_returns_indexed_citations() {
        let temp = tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("index")).expect("dir");
        fs::write(
            temp.path().join("index/paragraphs.json"),
            r#"{"entries":[{"standard_id":"IFRS 11","paragraph":"7","paragraph_normalized":"7","pack_path":"x.md","char_start":0,"char_end":10,"snippet_en":"Joint control","status":"current"}]}"#,
        )
        .expect("write");

        let result = execute_pack_tool(
            temp.path(),
            false,
            "list_standard_paragraphs",
            r#"{"standard_id":"IFRS 11"}"#,
        )
        .expect("tool");
        assert!(result.contains("IFRS 11 §7"));
    }
}
