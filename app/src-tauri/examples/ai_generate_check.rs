//! Run one AI project generation using local config and content pack.
//! Usage: cargo run --example ai_generate_check -- "你的问题" ["补充事实"]

use std::path::PathBuf;

use app_lib::ai;
use app_lib::config;

fn app_data_root() -> PathBuf {
    std::env::var("HOME")
        .map(|home| {
            PathBuf::from(home).join(".local/share/com.moonmaxtea.accounting-standards-desktop")
        })
        .unwrap_or_else(|_| PathBuf::from("/tmp/asd-app-data"))
}

#[tokio::main]
async fn main() {
    let question = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "50:50 持股且重大决策需一致同意，应如何判断合营还是联营？".to_string());
    let facts = std::env::args().nth(2);

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

    println!("== AI 写作测试 ==");
    println!("provider: {:?}", app_config.ai.provider);
    println!("base_url: {:?}", app_config.ai.base_url);
    println!("model: {:?}", app_config.ai.model);
    println!("projects: {}", projects_root.display());
    println!("question: {question}");

    let result = ai::generate_and_save_project(
        &projects_root,
        &content_dir,
        &app_config.ai,
        &question,
        facts.as_deref(),
        Some("IFRS项目"),
    )
    .await
    .expect("generate project");

    println!("\n✓ 生成成功");
    println!("  项目名: {}", result.project_name);
    println!("  路径: {}", result.relative_path);
    println!("  警告数: {}", result.validation.warnings.len());
    for warning in &result.validation.warnings {
        println!("  - {warning}");
    }
    println!("\n正文预览（前 800 字）:");
    println!("{}", &result.content.chars().take(800).collect::<String>());
}
