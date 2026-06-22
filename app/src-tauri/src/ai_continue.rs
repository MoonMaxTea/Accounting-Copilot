use std::path::Path;

use crate::ai_agent::{
    append_ai_debug_event, build_writer_system_prompt, emit_generation_progress, now_secs,
    plain_chat_message, request_chat_plain, AgentRunInput, AgentRunOutput,
};
use crate::config::AiConfig;
use crate::models::{AiAgentMessage, AiConversationTurn, AiDebugEvent};
use crate::retrieval::{
    derive_plan_from_question, gather_evidence, render_evidence_pack, CONTINUE_EVIDENCE_BUDGET,
};

fn normalize_markdown_for_prompt(markdown: &str) -> String {
    let stripped = markdown.strip_prefix('\u{feff}').unwrap_or(markdown);
    stripped.replace("\r\n", "\n").replace('\r', "\n")
}

fn build_continue_user_message(input: &AgentRunInput<'_>, evidence_text: &str) -> String {
    let existing = input
        .existing_markdown
        .map(normalize_markdown_for_prompt)
        .unwrap_or_default();

    let mut text = format!(
        "用户追问（请更新项目笔记，输出完整新版 Markdown）：\n{}",
        input.question.trim()
    );
    if let Some(facts) = input.facts.map(str::trim).filter(|value| !value.is_empty()) {
        text.push_str(&format!("\n\n补充事实：\n{facts}"));
    }
    text.push_str(&format!("\n\n【检索证据】\n{evidence_text}"));
    if !existing.is_empty() {
        text.push_str(&format!("\n\n---\n\n当前项目笔记全文：\n{existing}"));
    }
    text
}

fn ai_provider_model(ai: &AiConfig) -> (Option<String>, Option<String>) {
    (
        ai.provider.clone(),
        ai.model.clone(),
    )
}

fn classify_debug_error(error: &str) -> Option<String> {
    let lowered = error.to_lowercase();
    if lowered.contains("401") || lowered.contains("unauthorized") || lowered.contains("api key") {
        Some("auth".to_string())
    } else if lowered.contains("413")
        || lowered.contains("context_length")
        || lowered.contains("context length")
    {
        Some("context".to_string())
    } else if lowered.contains("prefix") {
        Some("prefix".to_string())
    } else {
        Some("provider".to_string())
    }
}

/// Continue / Follow-up: local retrieval + single plain chat (no tools).
pub async fn run_continue_writer(
    app_handle: Option<&tauri::AppHandle>,
    content_dir: &Path,
    ai: &AiConfig,
    input: AgentRunInput<'_>,
) -> Result<AgentRunOutput, String> {
    let run_id = format!("continue-writer-{}", now_secs());
    let mut step_index = 0u32;
    let (provider, model) = ai_provider_model(ai);

    append_ai_debug_event(
        app_handle,
        &AiDebugEvent {
            ts_secs: now_secs(),
            mode: Some("continue_writer".to_string()),
            phase: Some("start".to_string()),
            provider: provider.clone(),
            model: model.clone(),
            status: Some("started".to_string()),
            run_id: Some(run_id.clone()),
            ..Default::default()
        },
    );

    let mut emit = |phase: &str, msg: &str, kind: Option<&str>, detail: Option<&str>| {
        emit_generation_progress(
            app_handle,
            &run_id,
            &mut step_index,
            phase,
            msg,
            kind,
            detail,
        );
    };

    emit(
        "searching",
        "正在检索本地准则库…",
        Some("retrieval"),
        None,
    );

    let plan = derive_plan_from_question(input.question, input.facts);
    let evidence = gather_evidence(
        content_dir,
        ai.allow_legacy_citations,
        &plan,
        CONTINUE_EVIDENCE_BUDGET,
    );
    let evidence_text = render_evidence_pack(&evidence);

    let mut activity_log = vec![AiConversationTurn {
        role: "assistant".to_string(),
        content: format!(
            "本地检索完成（{} 条证据）",
            evidence.items.len()
        ),
        timestamp_secs: now_secs(),
        kind: "retrieval".to_string(),
    }];

    append_ai_debug_event(
        app_handle,
        &AiDebugEvent {
            ts_secs: now_secs(),
            mode: Some("continue_writer".to_string()),
            phase: Some("retrieval".to_string()),
            provider: provider.clone(),
            model: model.clone(),
            status: Some("ok".to_string()),
            completion_chars: Some(evidence_text.len() as u64),
            run_id: Some(run_id.clone()),
            ..Default::default()
        },
    );

    emit(
        "generating",
        "正在更新项目笔记…",
        Some("writing"),
        None,
    );

    let system_prompt = build_writer_system_prompt(content_dir)?;
    let user_message = build_continue_user_message(&input, &evidence_text);
    let messages = vec![
        plain_chat_message("system", system_prompt),
        plain_chat_message("user", user_message.clone()),
    ];

    let assistant = request_chat_plain(ai, &messages).await.map_err(|error| {
        append_ai_debug_event(
            app_handle,
            &AiDebugEvent {
                ts_secs: now_secs(),
                mode: Some("continue_writer".to_string()),
                phase: Some("error".to_string()),
                provider: provider.clone(),
                model: model.clone(),
                status: Some("error".to_string()),
                error_class: classify_debug_error(&error),
                run_id: Some(run_id.clone()),
                ..Default::default()
            },
        );
        error
    })?;

    let final_raw = assistant.content.unwrap_or_default();
    if final_raw.trim().is_empty() {
        let err = "Continue writer 未返回内容。".to_string();
        append_ai_debug_event(
            app_handle,
            &AiDebugEvent {
                ts_secs: now_secs(),
                mode: Some("continue_writer".to_string()),
                phase: Some("error".to_string()),
                provider,
                model,
                status: Some("error".to_string()),
                error_class: Some("empty".to_string()),
                run_id: Some(run_id),
                ..Default::default()
            },
        );
        return Err(err);
    }

    append_ai_debug_event(
        app_handle,
        &AiDebugEvent {
            ts_secs: now_secs(),
            mode: Some("continue_writer".to_string()),
            phase: Some("complete".to_string()),
            provider,
            model,
            status: Some("ok".to_string()),
            completion_chars: Some(final_raw.len() as u64),
            run_id: Some(run_id.clone()),
            ..Default::default()
        },
    );

    activity_log.push(AiConversationTurn {
        role: "assistant".to_string(),
        content: "已更新项目笔记".to_string(),
        timestamp_secs: now_secs(),
        kind: "continue".to_string(),
    });

    let mut session_messages = input.prior_messages;
    session_messages.push(AiAgentMessage {
        role: "user".to_string(),
        content: Some(user_message),
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    session_messages.push(AiAgentMessage {
        role: "assistant".to_string(),
        content: Some(final_raw.clone()),
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });

    Ok(AgentRunOutput {
        raw_response: final_raw,
        session_messages,
        activity_log,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_agent::{build_plain_chat_payload, AgentMode};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn continue_user_message_includes_question_evidence_and_note() {
        let input = AgentRunInput {
            mode: AgentMode::Continue,
            question: "补充 IFRS 11 要点",
            facts: Some("50:50 持股"),
            existing_markdown: Some("# 笔记\n正文"),
            prior_messages: Vec::new(),
        };
        let text = build_continue_user_message(&input, "### IFRS 11 §7\nJoint control");
        assert!(text.contains("补充 IFRS 11 要点"));
        assert!(text.contains("50:50 持股"));
        assert!(text.contains("【检索证据】"));
        assert!(text.contains("当前项目笔记全文"));
        assert!(text.contains("# 笔记"));
    }

    #[test]
    fn plain_chat_payload_for_continue_omits_tools() {
        let messages = vec![
            plain_chat_message("system", "sys"),
            plain_chat_message("user", "user"),
        ];
        let payload = build_plain_chat_payload("gpt-4o", &messages);
        assert!(payload.get("tools").is_none());
        assert!(payload.get("tool_choice").is_none());
    }

    #[test]
    fn writer_system_prompt_excludes_tool_names() {
        let temp = tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("writing-spec")).expect("dir");
        fs::write(
            temp.path().join("writing-spec/项目编写说明.md"),
            "guide",
        )
        .expect("write");
        fs::write(temp.path().join("writing-spec/SKILL.md"), "skill").expect("write");
        let prompt = build_writer_system_prompt(temp.path()).expect("prompt");
        assert!(prompt.contains("【检索证据】"));
        assert!(!prompt.contains("search_local_pack"));
    }
}
