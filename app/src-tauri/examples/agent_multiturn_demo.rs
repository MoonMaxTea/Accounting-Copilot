//! Demo: agent new project + follow-up on same file.
//! Usage: cargo run --example agent_multiturn_demo

use std::path::PathBuf;

use app_lib::ai;
use app_lib::config;

fn app_data_root() -> PathBuf {
    std::env::var("HOME")
        .map(|home| {
            PathBuf::from(home).join(".local/share/com.moonmaxtea.accounting-copilot")
        })
        .unwrap_or_else(|_| PathBuf::from("/tmp/asd-app-data"))
}

#[tokio::main]
async fn main() {
    let root = app_data_root();
    let content_dir = root.join("content");
    let config_path = root.join("config.json");
    let raw = std::fs::read_to_string(&config_path).expect("read config.json");
    let app_config: config::AppConfig = serde_json::from_str(&raw).expect("parse config");
    let projects_root = app_config
        .projects_dir
        .as_ref()
        .map(PathBuf::from)
        .expect("projects_dir not set");

    println!("== Agent 演示：新建 + 多轮追问 ==\n");

    let question =
        "50:50 持股且重大决策需一致同意，应如何判断合营还是联营？";
    let facts = Some("双方各持股50%，重大决策需一致同意");

    println!("【1/2】新建项目…");
    let (created, session, activity) = ai::generate_and_save_project(
        &projects_root,
        &content_dir,
        &app_config.ai,
        question,
        facts,
        Some("IFRS项目"),
        Vec::new(),
    )
    .await
    .expect("create project");

    println!("  ✓ 已保存: {}", created.relative_path);
    println!("  项目名: {}", created.project_name);
    println!("  Agent 步骤:");
    for turn in &activity {
        if turn.kind == "tool" {
            println!("    · [pack] {}", turn.content);
        }
    }
    println!("  警告: {}", created.validation.warnings.len());

    let file_path = PathBuf::from(&created.file_path);
    let follow_up = "如果其中一方对融资有一票否决，但仍需双方一致同意其他重大决策，结论会变吗？";

    println!("\n【2/2】同一项目追问…");
    let (updated, session_after, activity2) = ai::continue_and_update_project(
        &projects_root,
        &content_dir,
        &app_config.ai,
        &file_path,
        follow_up,
        None,
        session,
    )
    .await
    .expect("continue project");

    println!("  ✓ 已更新: {}", updated.relative_path);
    println!("  会话消息数: {}", session_after.len());
    println!("  本轮 Agent 步骤:");
    for turn in &activity2 {
        if turn.kind == "tool" {
            println!("    · [pack] {}", turn.content);
        }
    }
    println!("  警告: {}", updated.validation.warnings.len());
    println!("\n笔记预览（前 600 字）:\n");
    println!("{}", updated.content.chars().take(600).collect::<String>());
}
