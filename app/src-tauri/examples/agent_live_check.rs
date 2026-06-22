//! Live DeepSeek test: create + 3 continues (continue_writer path).
//! Usage:
//!   DEEPSEEK_API_KEY=sk-... cargo run --example agent_live_check -- [model]
//! Default model: deepseek-v4-flash

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use app_lib::ai;
use app_lib::config::AiConfig;

fn app_data_root() -> PathBuf {
    std::env::var("HOME")
        .map(|home| PathBuf::from(home).join(".local/share/com.moonmaxtea.accounting-copilot"))
        .unwrap_or_else(|_| PathBuf::from("/tmp/asd-app-data"))
}

fn build_ai_config(model: &str) -> AiConfig {
    let api_key = std::env::var("DEEPSEEK_API_KEY")
        .or_else(|_| std::env::var("ASD_AI_API_KEY"))
        .expect("Set DEEPSEEK_API_KEY (or ASD_AI_API_KEY) for live testing");

    AiConfig {
        provider: Some("deepseek".to_string()),
        api_key: Some(api_key),
        base_url: Some("https://api.deepseek.com/v1".to_string()),
        model: Some(model.to_string()),
        allow_legacy_citations: false,
    }
}

fn count_debug_modes(log_path: &PathBuf, mode: &str) -> usize {
    let file = fs::File::open(log_path).ok();
    let Some(file) = file else {
        return 0;
    };
    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter(|line| line.contains(&format!("\"mode\":\"{mode}\"")))
        .count()
}

fn last_debug_line(log_path: &PathBuf) -> Option<String> {
    let file = fs::File::open(log_path).ok()?;
    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .last()
}

#[tokio::main]
async fn main() {
    let model = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "deepseek-v4-flash".to_string());

    let root = app_data_root();
    let content_dir = root.join("content");
    if !content_dir.join("registry.json").is_file() {
        panic!("Content pack missing at {}", content_dir.display());
    }

    let projects_root = std::env::var("ASD_PROJECTS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp/agent-live-projects"));
    fs::create_dir_all(&projects_root).expect("create projects dir");
    fs::create_dir_all(projects_root.join("agent-test")).expect("mkdir agent-test");

    let ai = build_ai_config(&model);
    let debug_log = root.join("ai-debug.log");
    let agent_create_before = count_debug_modes(&debug_log, "agent_create");
    let continue_writer_before = count_debug_modes(&debug_log, "continue_writer");
    let agent_continue_before = count_debug_modes(&debug_log, "agent_continue");

    println!("== Agent live check ==");
    println!("model: {model}");
    println!("base_url: https://api.deepseek.com/v1");
    println!("content: {}", content_dir.display());
    println!("projects: {}", projects_root.display());

    let question = "50:50 持股且重大决策需一致同意，应如何判断合营还是联营？";
    let facts = Some("双方各持股50%，重大决策需一致同意");

    println!("\n[1/4] CREATE …");
    let (created, mut session, activity) = ai::generate_and_save_project(
        None,
        &projects_root,
        &content_dir,
        &ai,
        question,
        facts,
        Some("agent-test"),
        Vec::new(),
    )
    .await
    .unwrap_or_else(|error| {
        eprintln!("CREATE FAILED: {error}");
        if let Some(line) = last_debug_line(&debug_log) {
            eprintln!("Last debug line: {line}");
        }
        std::process::exit(1);
    });

    println!("  OK: {}", created.relative_path);
    println!("  project: {}", created.project_name);
    let tool_steps = activity.iter().filter(|t| t.kind == "tool").count();
    let retrieval_steps = activity.iter().filter(|t| t.kind == "retrieval").count();
    println!("  activity: tool={tool_steps} retrieval={retrieval_steps}");

    let file_path = PathBuf::from(&created.file_path);
    let follow_ups = [
        "如果其中一方对融资有一票否决，结论会变吗？",
        "请补充 IFRS 11 下 joint control 的定义要点。",
        "在笔记结论段增加一句：需结合协议具体条款复核。",
    ];

    for (index, follow_up) in follow_ups.iter().enumerate() {
        println!("\n[{}/4] CONTINUE: {follow_up}", index + 2);
        match ai::continue_and_update_project(
            None,
            &projects_root,
            &content_dir,
            &ai,
            &file_path,
            follow_up,
            None,
            session.clone(),
        )
        .await
        {
            Ok((updated, new_session, activity)) => {
                println!("  OK: {} chars", updated.content.chars().count());
                let tool_steps = activity.iter().filter(|t| t.kind == "tool").count();
                let retrieval_steps = activity.iter().filter(|t| t.kind == "retrieval").count();
                println!("  activity: tool={tool_steps} retrieval={retrieval_steps}");
                assert_eq!(tool_steps, 0, "continue_writer must not emit tool activity");
                session = new_session;
            }
            Err(error) => {
                eprintln!("  CONTINUE FAILED: {error}");
                if error.to_lowercase().contains("prefix") {
                    eprintln!("  >>> prefix error detected");
                }
                if let Some(line) = last_debug_line(&debug_log) {
                    eprintln!("  Last debug line: {line}");
                }
                std::process::exit(1);
            }
        }
    }

    let agent_create_after = count_debug_modes(&debug_log, "agent_create");
    let continue_writer_after = count_debug_modes(&debug_log, "continue_writer");
    let agent_continue_after = count_debug_modes(&debug_log, "agent_continue");

    assert_eq!(agent_create_after - agent_create_before, 1, "expected 1 agent_create");
    assert_eq!(
        continue_writer_after - continue_writer_before,
        3,
        "expected 3 continue_writer"
    );
    assert_eq!(
        agent_continue_after - agent_continue_before,
        0,
        "agent_continue must not appear"
    );

    println!("\n=== ALL 4 ROUNDS PASSED (create + 3 continues) ===");
    println!("Session messages: {}", session.len());
    assert!(
        session.iter().all(|m| m.role != "tool" && m.tool_calls.is_none()),
        "session must not contain tool rows"
    );
}
