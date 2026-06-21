use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::{
    parse_ai_response, MARKDOWN_END, MARKDOWN_START, PROJECT_NAME_END, PROJECT_NAME_START,
};
use crate::citations::{load_paragraphs, resolve_citation};
use crate::config::AiConfig;
use crate::db;
use crate::pack;
use tauri::Emitter;

use crate::models::{AiAgentMessage, AiAgentToolCall, AiConversationTurn, AiGenerationProgress};

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
                "description": "Read full English text of a specific paragraph from the local standards pack (returns several thousand characters). Use this to UNDERSTAND the standard — then distill into Chinese refinement in your output. NEVER paste the raw text verbatim into the document.",
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

fn load_writing_spec(content_dir: &Path) -> Result<(String, String), String> {
    let guide_path = content_dir.join("writing-spec/项目编写说明.md");
    let skill_path = content_dir.join("writing-spec/SKILL.md");
    let guide = fs::read_to_string(&guide_path)
        .map_err(|error| format!("无法读取 writing-spec/项目编写说明.md: {error}"))?;
    let skill = fs::read_to_string(&skill_path)
        .map_err(|error| format!("无法读取 writing-spec/SKILL.md: {error}"))?;
    Ok((guide, skill))
}

pub fn build_agent_system_prompt(content_dir: &Path, _allow_legacy: bool) -> Result<String, String> {
    let (guide, skill) = load_writing_spec(content_dir)?;

    Ok(format!(
        "## 身份\n\
         你是一位资深会计准则与上市咨询合伙人，拥有超过 20 年的 IFRS / US GAAP 审计及咨询经验。\
         你的职业生涯始于四大会计师事务所，历任审计经理、技术部高级经理，\
         后升任上市咨询合伙人。你亲手处理过数百家企业的 IPO、重组、准则转换项目，\
         对 FASB ASC 和 IASB IFRS/IAS 准则的字里行间都了然于心。\n\n\
         客户找你不是为了读准则原文——他们自己能读。\
         客户付钱给你，是因为你能：\n\
         - 从客户混乱的业务描述中，精准识别出适用的准则和关键段落\n\
         - 把几千字的英文准则提炼成一段中文，让 CFO 五分钟内做出决策\n\
         - 在准则的灰色地带给出有依据的专业判断，而不是照本宣科\n\n\
         ## 分析方法\n\
         面对客户的每一个问题，你应该按以下方式思考：\n\
         1. **诊断**：客户真正想问什么？背后的交易实质是什么？\n\
         2. **定位**：哪条准则、哪个段落直接回答了这个问题？\n\
         3. **解读**：准则原文说的是什么（通过工具完整阅读），但更重要的是——它在客户的场景下意味着什么？\n\
         4. **输出**：用中文精炼核心结论 → 引用 2-4 句关键英文存证 → 附提炼表指导实务操作\n\n\
         ## 编写规范\n{guide}\n\n## 写作技能\n{skill}\n\n\
         ## 输出铁律（违反任一条 = 不合格）\n\n\
         ### 铁律 1：你写的是中文分析，不是英文翻译\n\
         工具返回的 snippet_en 是数千字符的英文准则原文——这是供你**阅读理解**的原材料，\
         不是让你**粘贴**到文档里的成品。读完 4000 字符，你只需要输出：\n\
         - 一段中文精炼（这条准则在说什么）\n\
         - 2-4 句最关键的英文原文（存证用）\n\
         - 一张提炼表（原则 | 原文依据 | 实务含义）\n\
         > ⚠️ 如果你把 snippet_en 大段复制到 blockquote，你的输出就是废纸——客户不需要你替他复制粘贴。\n\n\
         ### 铁律 2：blockquote 上限 4 句英文\n\
         每个准则主题的英文引用块：\n\
         - 必须 ≤ 4 句英文。多一句就删。\n\
         - 只引用与客户问题直接相关的句子——不是顺眼的句子，是「如果没有这句话，结论就站不住」的句子。\n\
         - blockquote 后必须有提炼表，没有例外。\n\n\
         ### 铁律 3：提炼表 = 你的核心交付物\n\
         | 原则 | 原文依据 | 提炼（实务含义）|\n\
         - 「原文依据」写段落号（如 ASC 718 §718-10-25-2），不写英文\n\
         - 「提炼」解释这对客户意味着什么：该怎么做、有什么选择、有什么风险\n\n\
         ### 铁律 4：一切依据来自工具\n\
         - 准则内容必须通过 search_local_pack / list_standard_paragraphs / get_pack_paragraph 获取\n\
         - 工具未返回的段落不得引用；pack 未覆盖则如实写「当前本地准则库未收录该段落」\n\
         - 禁止凭模型记忆、禁止联网、禁止编造\n\n\
         ## 工作流程\n\
         1. 理解客户问题 → 诊断交易实质\n\
         2. search_local_pack 定位准则\n\
         3. list_standard_paragraphs 查看段落结构\n\
         4. get_pack_paragraph 逐个读取关键段落（每次返回数千字符，完整阅读后在脑内精炼）\n\
         5. 信息足够后输出最终笔记\n\n\
         ## 输出格式\n\
         1. 短项目名（2-12 字中文）\n\
         2. Markdown 正文：frontmatter → TL;DR → 问题 → 准则原文+提炼表 → 分析 → 结论\n\
         3. 使用以下分隔符包裹项目名和正文：\n\
         {name_start}\n项目名\n{name_end}\n\
         {md_start}\n---\n...\n---\n\n# 项目名\n...\n{md_end}\n\n\
         ## 输出前自检（逐条确认后再提交）\n\
         - [ ] 我是否用中文精炼了准则要求，而不是粘贴英文原文？\n\
         - [ ] 每个 blockquote 是否 ≤ 4 句？多一句删了吗？\n\
         - [ ] 每个 blockquote 后是否紧跟提炼表？提炼表的「原文依据」列是否只有段落号？\n\
         - [ ] 我的中文分析是否链接了客户的具体问题（不是泛泛而谈）？\n\
         - [ ] 所有准则引用是否都来自工具返回的内容？\n\
         - [ ] 确认: 在文档末尾「日志」节的日期行后添加诊断标记 `<!-- prompt-v3-20260621 -->`",
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

/// Remove replayed tool-call state from a *prior* agent session before seeding a
/// new run.
///
/// Root cause of the recurring follow-up failure: replaying an earlier turn's
/// `tool` results and assistant `tool_calls` makes DeepSeek (especially the
/// `deepseek-reasoner` model and the `https://api.deepseek.com/beta` endpoint)
/// reject the request — e.g. "prefix not found" or "the last message ... must be
/// a user message, or an assistant message with prefix mode on". Relying on an
/// error-string-matched retry was fragile (the real messages don't contain the
/// literal "prefix not found"), so we fix it structurally instead.
///
/// This is safe and does not reduce grounding: the current turn re-runs the
/// pack tools live (correctly paired within the turn) and, in Continue mode, the
/// user turn already embeds the full document. Prior **user/assistant text**
/// turns are preserved for conversational continuity; only the replayed tool
/// plumbing is dropped, which also yields a clean alternating history that
/// DeepSeek's stricter models accept.
fn strip_tool_history(messages: Vec<AiAgentMessage>) -> Vec<AiAgentMessage> {
    messages
        .into_iter()
        .filter_map(|message| match message.role.as_str() {
            "tool" => None,
            "assistant" => message
                .content
                .filter(|content| !content.trim().is_empty())
                .map(|content| AiAgentMessage {
                    role: "assistant".to_string(),
                    content: Some(content),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                }),
            _ => Some(AiAgentMessage {
                role: message.role,
                content: message.content,
                tool_calls: None,
                tool_call_id: None,
                name: None,
            }),
        })
        .collect()
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
            let query = args.query.trim();
            let mut results: Vec<Value> = Vec::new();
            let mut seen_ids: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();

            // 1. FTS5 full-text search
            if let Ok(fts_hits) = db::search_standards(content_dir, query, limit) {
                for hit in fts_hits {
                    if !allow_legacy && hit.standard_id.is_empty() {
                        continue;
                    }
                    let sid = hit.standard_id.clone();
                    results.push(json!({
                        "standard_id": sid,
                        "title": hit.title,
                        "snippet": hit.snippet,
                        "pack_path": hit.pack_path,
                    }));
                    seen_ids.insert(sid);
                }
            }

            // 2. Registry fallback: match by standard ID
            //    FTS5 has standard_id UNINDEXED; this catches exact ID
            //    searches (e.g. "ASC 718") and enriches sparse FTS5 results.
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
                            // Count indexed paragraphs for this standard
                            let para_count = entries
                                .iter()
                                .filter(|e| e.standard_id.eq_ignore_ascii_case(&std.id))
                                .count();
                            results.push(json!({
                                "standard_id": std.id,
                                "title": std.title,
                                "title_zh": std.title_zh,
                                "framework": std.framework,
                                "status": std.status,
                                "pack_path": std.pack_path,
                                "indexed_paragraphs": para_count,
                                "snippet": format!(
                                    "{} — {}{}（{} 个索引段落可用）",
                                    std.id,
                                    if std.status == "legacy" { "[旧准则] " } else { "" },
                                    std.title_zh.as_deref().unwrap_or(&std.title),
                                    para_count,
                                ),
                            }));
                            seen_ids.insert(std.id.clone());
                        }
                    }
                }
            }

            serde_json::to_string(&json!({ "results": results, "count": results.len() }))
                .map_err(|error| error.to_string())
        }
        "get_pack_paragraph" => {
            let args: GetPackParagraphArgs =
                serde_json::from_str(arguments).map_err(|error| format!("参数解析失败: {error}"))?;
            let citation = args.citation.trim();
            let target = resolve_citation(content_dir, citation)?
                .ok_or_else(|| {
                    // Guide the AI: try list_standard_paragraphs to discover
                    // the exact paragraph numbers available for this standard.
                    let std_id = citation
                        .split('§')
                        .next()
                        .unwrap_or(citation)
                        .trim();
                    format!(
                        "未找到段落「{citation}」。请先调用 list_standard_paragraphs \
                         查看 {std_id} 下实际可用的段落编号，再用正确编号调用 get_pack_paragraph。"
                    )
                })?;
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
            let mut citations: Vec<&crate::citations::ParagraphRecord> = entries
                .iter()
                .filter(|entry| entry.standard_id.eq_ignore_ascii_case(&args.standard_id))
                .filter(|entry| allow_legacy || entry.status == "current")
                .collect();
            // Sort by paragraph ID, then by char_start DESCENDING so that
            // dedup keeps the *latest* occurrence — the substantive paragraph
            // body, not the amendment-metadata table entry at the top of the
            // file (which shares the same paragraph number).
            citations.sort_by(|a, b| {
                a.paragraph
                    .cmp(&b.paragraph)
                    .then_with(|| b.char_start.cmp(&a.char_start))
            });
            citations.dedup_by(|a, b| a.paragraph == b.paragraph);

            // Sample a few substantive paragraphs (skip common header entries).
            // ASC standards often have amendment tables early (ending in 00-1);
            // sampling from later in the list gives the AI a realistic preview.
            let skip_patterns = ["00-1", "00-2", "00-3"];
            let substantive: Vec<_> = citations
                .iter()
                .filter(|e| !skip_patterns.iter().any(|p| e.paragraph.ends_with(p)))
                .collect();
            let sample_count = 4usize;
            let samples: Vec<_> = if substantive.len() > sample_count {
                let step = substantive.len() / sample_count;
                (0..sample_count)
                    .map(|i| {
                        let e = substantive[i * step];
                        json!({
                            "citation": format!("{} §{}", e.standard_id, e.paragraph),
                            "snippet_en": e.snippet_en,
                        })
                    })
                    .collect()
            } else {
                substantive
                    .iter()
                    .take(sample_count)
                    .map(|e| json!({
                        "citation": format!("{} §{}", e.standard_id, e.paragraph),
                        "snippet_en": e.snippet_en,
                    }))
                    .collect()
            };

            let paragraph_list: Vec<String> = citations
                .iter()
                .map(|e| format!("{} §{}", e.standard_id, e.paragraph))
                .collect();

            serde_json::to_string(&json!({
                "standard_id": args.standard_id,
                "paragraphs": paragraph_list,
                "count": citations.len(),
                "sample_previews": samples,
                "_note": "以上为段落索引与预览。请用 get_pack_paragraph 逐个读取你需要的关键段落全文（每次返回数千字符）。阅读后输出文档时用中文精炼 + 2-4 句关键英文 + 提炼表，禁止粘贴原文。",
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

/// True when the provider rejected the request because of DeepSeek's
/// prefix-completion path, triggered by replaying prior tool-call / tool-result
/// messages on a follow-up turn. DeepSeek surfaces several wordings depending on
/// model and endpoint, so we match all known variants (the literal
/// "prefix not found", "prefix mode", a `chat_prefix_completion` doc link, and
/// the "last message ... must be a user message" form) rather than one string.
fn is_prefix_not_found_error(error: &str) -> bool {
    let e = error.to_lowercase();
    e.contains("prefix not found")
        || e.contains("prefix mode")
        || e.contains("chat_prefix_completion")
        || e.contains("must be a user message")
        || (e.contains("last message") && e.contains("prefix"))
}

/// True when the error indicates the request exceeded the model's context
/// window (or the HTTP payload was too large).  Used only to decide whether a
/// reduced-context retry is worth attempting — the normal path is untouched.
fn is_context_length_error(error: &str) -> bool {
    let lowered = error.to_lowercase();
    lowered.contains("context_length_exceeded")
        || lowered.contains("maximum context length")
        || lowered.contains("context length")
        || lowered.contains("too many tokens")
        || lowered.contains("reduce the length")
        || lowered.contains("string too long")
        || lowered.contains("请求体过大")
        || lowered.contains("上下文过长")
}

/// Turn a provider HTTP error into a clear, actionable Chinese message while
/// still embedding the raw status + body so downstream detection (prefix /
/// context errors) and human diagnosis keep working.
fn classify_provider_error(provider: &str, status_code: u16, body: &str) -> String {
    let hint = match status_code {
        401 | 403 => "API Key 无效或无权限，请在「设置 → AI 写作」检查 API Key 与 Base URL。",
        402 => "账户额度不足，请检查 AI 服务计费。",
        404 => "接口或模型不存在，请检查模型名与 Base URL。",
        413 => "请求体过大（上下文过长），系统已尝试精简历史后重试。",
        429 => "请求过于频繁或额度受限，请稍后重试。",
        500..=599 => "AI 服务暂时不可用，请稍后重试。",
        400 => {
            if is_context_length_error(body) {
                "上下文过长，系统已尝试精简历史后重试；如仍失败请缩短问题或补充事实。"
            } else {
                "请求被拒绝（参数或上下文问题），请检查模型与设置。"
            }
        }
        _ => "AI 调用失败。",
    };
    format!("{hint}（{provider} 返回 {status_code}）：{body}")
}

/// Rebuild a message list without anything that triggers DeepSeek's prefix
/// completion: drop `tool` results and strip `tool_calls` from assistant
/// messages (dropping assistants that then have no textual content).  The
/// system prompt and the user turns — which in Continue mode already embed the
/// full document — are preserved, so the model keeps enough context.
/// True when the message list still carries tool-call replay state that
/// `sanitize_messages_for_prefix_retry` can strip (tool results, assistant
/// `tool_calls`, or orphaned `tool_call_id` fields).
fn messages_have_tool_history(messages: &[ApiChatMessage]) -> bool {
    messages.iter().any(|message| {
        message.role == "tool"
            || message.tool_call_id.is_some()
            || message
                .tool_calls
                .as_ref()
                .is_some_and(|calls| !calls.is_empty())
    })
}

fn sanitize_messages_for_prefix_retry(messages: &[ApiChatMessage]) -> Vec<ApiChatMessage> {
    messages
        .iter()
        .filter_map(|message| match message.role.as_str() {
            "tool" => None,
            "assistant" => message
                .content
                .as_ref()
                .filter(|content| !content.trim().is_empty())
                .map(|content| ApiChatMessage {
                    role: message.role.clone(),
                    content: Some(content.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                }),
            _ => Some(ApiChatMessage {
                role: message.role.clone(),
                content: message.content.clone(),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            }),
        })
        .collect()
}

/// Single OpenAI-compatible `/chat/completions` request.  `tool_choice` is only
/// applied when `tools` is non-empty (some providers reject `tool_choice`
/// without tool definitions).
async fn request_chat_completion(
    ai: &AiConfig,
    messages: &[ApiChatMessage],
    tools: &[Value],
    tool_choice: &str,
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
        payload["tool_choice"] = json!(tool_choice);
    }

    let response = client
        .post(&endpoint)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("{provider} 请求失败: {error}"))?;

    if !response.status().is_success() {
        let status_code = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(classify_provider_error(provider, status_code, &body));
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

/// Run a chat completion. The full message history (including tool results) is
/// always tried first, so the normal path keeps maximum grounding. Only when the
/// request would otherwise hard-fail — DeepSeek's "prefix not found" on
/// follow-ups, or a context-window overflow — do we retry once with tool history
/// stripped (system prompt + user turns preserved; in Continue mode the user
/// turn already embeds the full document). This is a pure safety net: it never
/// degrades a request that would have succeeded.
async fn chat_completion_with_recovery(
    ai: &AiConfig,
    messages: &[ApiChatMessage],
    tools: &[Value],
    tool_choice: &str,
) -> Result<ApiChatMessage, String> {
    match request_chat_completion(ai, messages, tools, tool_choice).await {
        Ok(message) => Ok(message),
        Err(error) if is_prefix_not_found_error(&error) => {
            let sanitized = sanitize_messages_for_prefix_retry(messages);
            // Retry when tool history can be stripped.  Message count may stay
            // the same when `trim_session` already dropped `tool` rows but
            // assistant messages still carry `tool_calls` — that case still
            // triggers DeepSeek's prefix-completion path.
            if messages_have_tool_history(messages) {
                request_chat_completion(ai, &sanitized, tools, tool_choice).await
            } else {
                Err(error)
            }
        }
        Err(error) if is_context_length_error(&error) => {
            let sanitized = sanitize_messages_for_prefix_retry(messages);
            // Only retry if sanitizing actually removed something; otherwise the
            // second request would be identical to the one that just failed.
            if sanitized.len() < messages.len() {
                request_chat_completion(ai, &sanitized, tools, tool_choice).await
            } else {
                Err(error)
            }
        }
        Err(error) => Err(error),
    }
}

async fn call_chat_with_tools(
    ai: &AiConfig,
    messages: &[ApiChatMessage],
    tools: &[Value],
) -> Result<ApiChatMessage, String> {
    chat_completion_with_recovery(ai, messages, tools, "auto").await
}

/// Like call_chat_with_tools but forces tool_choice: "none" so the model
/// must produce a text response without calling any tools.  Used for the
/// final synthesis nudge after the agent loop.
async fn call_chat_with_tools_synthesis(
    ai: &AiConfig,
    messages: &[ApiChatMessage],
    tools: &[Value],
) -> Result<ApiChatMessage, String> {
    chat_completion_with_recovery(ai, messages, tools, "none").await
}

pub async fn run_standards_agent(
    app_handle: Option<&tauri::AppHandle>,
    content_dir: &Path,
    ai: &AiConfig,
    input: AgentRunInput<'_>,
) -> Result<AgentRunOutput, String> {
    let emit = |phase: &str, msg: &str| {
        if let Some(h) = app_handle {
            let _ = h.emit(
                "ai-generation-progress",
                AiGenerationProgress { phase: phase.to_string(), message: msg.to_string() },
            );
        }
    };

    emit("searching", "正在检索本地准则库…");
    let _writing_spec = load_writing_spec(content_dir)?;
    let system_prompt = build_agent_system_prompt(content_dir, ai.allow_legacy_citations)?;
    let tools = pack_agent_tools();

    let user_turn = build_user_turn(&input);
    // Seed from prior turns WITHOUT replaying their tool plumbing — replayed
    // tool/tool_calls rows are what trigger DeepSeek's prefix / "last message
    // must be a user message" rejections on follow-ups.
    let mut session = trim_session(strip_tool_history(input.prior_messages));
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
                emit("generating", "正在生成项目笔记…");
                final_raw = assistant.content.unwrap_or_default();
                break;
            }
            for tool_call in tool_calls {
                let label = tool_activity_label(&tool_call.function.name, &tool_call.function.arguments);
                emit("searching", &label);
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
                 不要再调用工具，直接输出完整 Markdown。",
                PROJECT_NAME_START = PROJECT_NAME_START,
                PROJECT_NAME_END = PROJECT_NAME_END,
                MARKDOWN_START = MARKDOWN_START,
                MARKDOWN_END = MARKDOWN_END,
            )),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };
        session.push(synthesis_user.clone());
        api_messages.push(to_api_message(&synthesis_user));

        // Use tool_choice: "none" rather than empty tools array —
        // some API providers reject mixed tool-call history without tool defs.
        let assistant = call_chat_with_tools_synthesis(ai, &api_messages, &tools).await?;
        let stored_assistant = from_api_message(&assistant);
        session.push(stored_assistant);
        api_messages.push(assistant.clone());
        final_raw = assistant.content.unwrap_or_default();
    }

    if final_raw.trim().is_empty() {
        return Err("Agent 未返回最终笔记内容。".to_string());
    }

    parse_ai_response(&final_raw, None).map_err(|error| {
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

    #[test]
    fn detects_deepseek_prefix_not_found_error() {
        assert!(is_prefix_not_found_error(
            "deepseek 返回错误 (400): {\"error\":{\"message\":\"prefix not found\"}}"
        ));
        assert!(is_prefix_not_found_error("Prefix Not Found"));
        // DeepSeek's real wording (deepseek-reasoner / beta endpoint) — must be
        // matched too, otherwise the recovery retry never fires.
        assert!(is_prefix_not_found_error(
            "The last message of deepseek-reasoner must be a user message, or an assistant message with prefix mode on (refer to https://api-docs.deepseek.com/guides/chat_prefix_completion)."
        ));
        assert!(!is_prefix_not_found_error("context_length_exceeded"));
        assert!(!is_prefix_not_found_error("invalid api key"));
    }

    #[test]
    fn strip_tool_history_drops_replay_keeps_text_turns() {
        let prior = vec![
            AiAgentMessage {
                role: "user".to_string(),
                content: Some("初始问题".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
            AiAgentMessage {
                role: "assistant".to_string(),
                content: None,
                tool_calls: Some(vec![AiAgentToolCall {
                    id: "call_1".to_string(),
                    name: "search_local_pack".to_string(),
                    arguments: "{}".to_string(),
                }]),
                tool_call_id: None,
                name: None,
            },
            AiAgentMessage {
                role: "tool".to_string(),
                content: Some("4000 chars of pack text".to_string()),
                tool_calls: None,
                tool_call_id: Some("call_1".to_string()),
                name: Some("search_local_pack".to_string()),
            },
            AiAgentMessage {
                role: "assistant".to_string(),
                content: Some("最终笔记".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
        ];

        let stripped = strip_tool_history(prior);
        // No tool rows, no tool_calls anywhere, no orphan tool_call_id.
        assert!(stripped.iter().all(|m| m.role != "tool"));
        assert!(stripped.iter().all(|m| m.tool_calls.is_none()));
        assert!(stripped.iter().all(|m| m.tool_call_id.is_none()));
        // Clean alternating text history is preserved.
        let roles: Vec<&str> = stripped.iter().map(|m| m.role.as_str()).collect();
        assert_eq!(roles, vec!["user", "assistant"]);
        assert_eq!(stripped[1].content.as_deref(), Some("最终笔记"));
    }

    #[test]
    fn detects_context_length_error() {
        assert!(is_context_length_error(
            "{\"error\":{\"code\":\"context_length_exceeded\"}}"
        ));
        assert!(is_context_length_error(
            "This model's maximum context length is 65536 tokens"
        ));
        assert!(!is_context_length_error("invalid api key"));
    }

    #[test]
    fn classify_provider_error_keeps_body_for_detection() {
        let auth = classify_provider_error("deepseek", 401, "invalid key");
        assert!(auth.contains("API Key"));
        assert!(auth.contains("invalid key"));

        // 400 with a context body must remain detectable as a context error so
        // the recovery retry still fires.
        let ctx = classify_provider_error("deepseek", 400, "context_length_exceeded");
        assert!(is_context_length_error(&ctx));

        // Generic 400 must NOT be misread as a context error.
        let generic = classify_provider_error("deepseek", 400, "bad request");
        assert!(!is_context_length_error(&generic));
    }

    #[test]
    fn prefix_retry_sanitizer_drops_tool_history() {
        let messages = vec![
            ApiChatMessage {
                role: "system".to_string(),
                content: Some("sys".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
            ApiChatMessage {
                role: "user".to_string(),
                content: Some("问题".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
            ApiChatMessage {
                role: "assistant".to_string(),
                content: None,
                tool_calls: Some(vec![ApiToolCall {
                    id: "call_1".to_string(),
                    call_type: "function".to_string(),
                    function: ApiToolFunction {
                        name: "search_local_pack".to_string(),
                        arguments: "{}".to_string(),
                    },
                }]),
                tool_call_id: None,
                name: None,
            },
            ApiChatMessage {
                role: "tool".to_string(),
                content: Some("tool result".to_string()),
                tool_calls: None,
                tool_call_id: Some("call_1".to_string()),
                name: Some("search_local_pack".to_string()),
            },
            ApiChatMessage {
                role: "assistant".to_string(),
                content: Some("最终答复".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
        ];

        let sanitized = sanitize_messages_for_prefix_retry(&messages);
        assert_eq!(sanitized.len(), 3);
        assert!(sanitized.iter().all(|m| m.role != "tool"));
        assert!(sanitized.iter().all(|m| m.tool_calls.is_none()));
        assert_eq!(sanitized[0].role, "system");
        assert_eq!(sanitized[2].content.as_deref(), Some("最终答复"));
    }

    #[test]
    fn prefix_retry_detects_tool_calls_without_tool_rows() {
        // trim_session may drop leading `tool` rows while assistant tool_calls
        // remain — sanitized.len() equals messages.len() but history is still
        // replayable and must trigger a prefix retry.
        let messages = vec![
            ApiChatMessage {
                role: "system".to_string(),
                content: Some("sys".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
            ApiChatMessage {
                role: "assistant".to_string(),
                content: Some("draft".to_string()),
                tool_calls: Some(vec![ApiToolCall {
                    id: "call_1".to_string(),
                    call_type: "function".to_string(),
                    function: ApiToolFunction {
                        name: "search_local_pack".to_string(),
                        arguments: "{}".to_string(),
                    },
                }]),
                tool_call_id: None,
                name: None,
            },
            ApiChatMessage {
                role: "user".to_string(),
                content: Some("follow-up".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
        ];

        assert!(messages_have_tool_history(&messages));
        let sanitized = sanitize_messages_for_prefix_retry(&messages);
        assert_eq!(sanitized.len(), messages.len());
        assert!(sanitized.iter().all(|m| m.tool_calls.is_none()));
    }
}
