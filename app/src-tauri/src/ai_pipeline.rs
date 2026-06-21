use std::path::Path;

use tauri::Emitter;

use crate::ai::parse_ai_response;
use crate::ai_agent::{
    build_core_writing_prompt, plain_chat_message, request_chat_plain, AgentMode, AgentRunInput,
    AgentRunOutput, strip_tool_history,
};
use crate::config::AiConfig;
use crate::models::{AiAgentMessage, AiConversationTurn, AiGenerationProgress};
use crate::retrieval::{
    derive_plan_from_question, gather_evidence, merge_retrieval_plans, summarize_for_planning,
    truncate_for_continue, CONTINUE_EVIDENCE_BUDGET, CREATE_EVIDENCE_BUDGET, EvidencePack,
    RetrievalPlan,
};

const PLANNER_SYSTEM: &str = "你是会计准则检索规划器。根据用户问题，输出 JSON 检索计划，不要解释。\n\
格式：{\"queries\":[\"关键词1\",\"关键词2\"],\"standards\":[\"IFRS 11\"]}\n\
queries 1-6 条，standards 可为空。";

pub fn build_writer_system_prompt(content_dir: &Path) -> Result<String, String> {
    let core = build_core_writing_prompt(content_dir)?;
    Ok(format!(
        "{core}\n\n\
         ### 铁律 4：一切依据来自【检索证据】\n\
         - 所有准则依据必须来自 user 消息中提供的【检索证据】段落\n\
         - 证据未覆盖的段落不得引用；pack 未覆盖则如实写「当前本地准则库未收录该段落」\n\
         - 禁止凭模型记忆、禁止联网、禁止编造\n\n\
         ## 输出前自检（补充）\n\
         - [ ] 所有准则引用是否都来自【检索证据】？"
    ))
}

pub fn parse_retrieval_plan_from_text(raw: &str) -> Option<RetrievalPlan> {
    let trimmed = raw.trim();
    let json_text = if let Some(start) = trimmed.find("```json") {
        let rest = &trimmed[start + 7..];
        rest.split("```").next()?.trim()
    } else if let Some(start) = trimmed.find('{') {
        let rest = &trimmed[start..];
        rest.rfind('}').map(|end| &rest[..=end])?
    } else {
        return None;
    };

    serde_json::from_str::<RetrievalPlan>(json_text).ok()
}

pub async fn plan_retrieval(
    ai: &AiConfig,
    question: &str,
    facts: Option<&str>,
    doc_summary: Option<&str>,
) -> RetrievalPlan {
    let baseline = derive_plan_from_question(question, facts);

    let mut user = format!("用户问题：\n{}", question.trim());
    if let Some(facts) = facts.map(str::trim).filter(|value| !value.is_empty()) {
        user.push_str(&format!("\n\n补充事实：\n{facts}"));
    }
    if let Some(summary) = doc_summary {
        user.push_str(&format!("\n\n当前项目笔记摘要：\n{summary}"));
    }

    let messages = [
        plain_chat_message("system", PLANNER_SYSTEM),
        plain_chat_message("user", user),
    ];

    let llm_plan = match request_chat_plain(ai, &messages).await {
        Ok(message) => message
            .content
            .as_deref()
            .and_then(parse_retrieval_plan_from_text)
            .unwrap_or_default(),
        Err(_) => RetrievalPlan::default(),
    };

    merge_retrieval_plans(&baseline, &llm_plan)
}

fn render_evidence_pack(evidence: &EvidencePack) -> String {
    if evidence.items.is_empty() {
        return "（本轮检索未命中本地 pack 段落）".to_string();
    }

    evidence
        .items
        .iter()
        .map(|item| format!("### {}\n{}", item.citation, item.snippet_en))
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn build_write_user_message(
    mode: AgentMode,
    question: &str,
    facts: Option<&str>,
    evidence: &EvidencePack,
    existing_markdown: Option<&str>,
) -> String {
    let mut user = match mode {
        AgentMode::Create => format!("用户问题：\n{}", question.trim()),
        AgentMode::Continue => format!(
            "用户追问（请更新项目笔记，输出完整新版 Markdown）：\n{}",
            question.trim()
        ),
    };

    if let Some(facts) = facts.map(str::trim).filter(|value| !value.is_empty()) {
        user.push_str(&format!("\n\n补充事实：\n{facts}"));
    }

    user.push_str("\n\n【检索证据】\n");
    user.push_str(&render_evidence_pack(evidence));

    if let Some(existing) = existing_markdown {
        let truncated = truncate_for_continue(existing, question);
        user.push_str(&format!("\n\n当前项目笔记：\n{truncated}"));
    }

    user
}

pub async fn write_note(
    ai: &AiConfig,
    content_dir: &Path,
    mode: AgentMode,
    question: &str,
    facts: Option<&str>,
    evidence: &EvidencePack,
    existing_markdown: Option<&str>,
) -> Result<String, String> {
    let system = build_writer_system_prompt(content_dir)?;
    let user = build_write_user_message(mode, question, facts, evidence, existing_markdown);
    let messages = [
        plain_chat_message("system", system),
        plain_chat_message("user", user),
    ];

    let response = request_chat_plain(ai, &messages).await?;
    response
        .content
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| "写作阶段未返回内容。".to_string())
}

pub async fn run_standards_pipeline(
    app_handle: Option<&tauri::AppHandle>,
    content_dir: &Path,
    ai: &AiConfig,
    input: AgentRunInput<'_>,
) -> Result<AgentRunOutput, String> {
    let emit = |phase: &str, msg: &str| {
        if let Some(handle) = app_handle {
            let _ = handle.emit(
                "ai-generation-progress",
                AiGenerationProgress {
                    phase: phase.to_string(),
                    message: msg.to_string(),
                },
            );
        }
    };

    let _ = &input.prior_messages;
    // prior_messages are never sent to LLM calls; session persistence appends stripped text below.

    emit("searching", "正在规划检索…");

    let doc_summary = input
        .existing_markdown
        .map(summarize_for_planning);

    let plan = plan_retrieval(
        ai,
        input.question,
        input.facts,
        doc_summary.as_deref(),
    )
    .await;

    let budget = match input.mode {
        AgentMode::Create => CREATE_EVIDENCE_BUDGET,
        AgentMode::Continue => CONTINUE_EVIDENCE_BUDGET,
    };

    for query in &plan.queries {
        emit("searching", &format!("正在检索：{query}"));
    }
    for standard in &plan.standards {
        emit("searching", &format!("正在读取准则：{standard}"));
    }

    let evidence = gather_evidence(
        content_dir,
        ai.allow_legacy_citations,
        &plan,
        budget,
    );

    for item in &evidence.items {
        emit("searching", &format!("正在读取：{}", item.citation));
    }

    emit("generating", "正在生成项目笔记…");

    let raw = write_note(
        ai,
        content_dir,
        input.mode,
        input.question,
        input.facts,
        &evidence,
        input.existing_markdown,
    )
    .await?;

    parse_ai_response(&raw, Some(input.question)).map_err(|error| {
        format!("Pipeline 响应格式无效：{error}。请重试或缩短问题。")
    })?;

    let kind = match input.mode {
        AgentMode::Create => "create",
        AgentMode::Continue => "continue",
    };

    let mut activity_log = Vec::new();
    activity_log.push(AiConversationTurn {
        role: "user".to_string(),
        content: input.question.trim().to_string(),
        timestamp_secs: crate::ai_agent::now_secs(),
        kind: kind.to_string(),
    });
    for query in &plan.queries {
        activity_log.push(AiConversationTurn {
            role: "assistant".to_string(),
            content: format!("检索：{query}"),
            timestamp_secs: crate::ai_agent::now_secs(),
            kind: "retrieval".to_string(),
        });
    }
    for item in &evidence.items {
        activity_log.push(AiConversationTurn {
            role: "assistant".to_string(),
            content: format!("读取：{}", item.citation),
            timestamp_secs: crate::ai_agent::now_secs(),
            kind: "retrieval".to_string(),
        });
    }
    activity_log.push(AiConversationTurn {
        role: "assistant".to_string(),
        content: "已生成/更新项目笔记".to_string(),
        timestamp_secs: crate::ai_agent::now_secs(),
        kind: kind.to_string(),
    });

    let mut session = strip_tool_history(input.prior_messages);
    session.push(AiAgentMessage {
        role: "user".to_string(),
        content: Some(input.question.trim().to_string()),
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    session.push(AiAgentMessage {
        role: "assistant".to_string(),
        content: Some(raw.clone()),
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });

    Ok(AgentRunOutput {
        raw_response: raw,
        session_messages: session,
        activity_log,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn parse_retrieval_plan_accepts_json_fence() {
        let raw = r#"说明
```json
{"queries":["joint control"],"standards":["IFRS 11"]}
```"#;
        let plan = parse_retrieval_plan_from_text(raw).expect("plan");
        assert_eq!(plan.queries, vec!["joint control"]);
        assert_eq!(plan.standards, vec!["IFRS 11"]);
    }

    #[test]
    fn writer_prompt_uses_core_not_tools() {
        let temp = tempdir().expect("tempdir");
        let spec_dir = temp.path().join("writing-spec");
        fs::create_dir_all(&spec_dir).expect("dir");
        fs::write(spec_dir.join("项目编写说明.md"), "guide").expect("write");
        fs::write(spec_dir.join("SKILL.md"), "skill").expect("write");

        let writer = build_writer_system_prompt(temp.path()).expect("writer");
        assert!(writer.contains("【检索证据】"));
        assert!(!writer.contains("search_local_pack"));
        assert!(!writer.contains("get_pack_paragraph"));
    }

    #[test]
    fn render_evidence_pack_formats_items() {
        let pack = EvidencePack {
            items: vec![crate::retrieval::EvidenceItem {
                citation: "IFRS 11 §7".to_string(),
                standard_id: "IFRS 11".to_string(),
                title: "IFRS 11".to_string(),
                snippet_en: "Joint control".to_string(),
            }],
        };
        let rendered = render_evidence_pack(&pack);
        assert!(rendered.contains("### IFRS 11 §7"));
        assert!(rendered.contains("Joint control"));
    }
}
