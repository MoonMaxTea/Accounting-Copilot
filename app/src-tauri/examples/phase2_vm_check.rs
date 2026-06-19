//! VM integration check for Phase 2 Evidence features.
//! Usage: cargo run --example phase2_vm_check

use std::path::PathBuf;

use app_lib::citations::{resolve_citation, scan_citations};
use app_lib::projects;

fn app_data_root() -> PathBuf {
    std::env::var("HOME")
        .map(|home| PathBuf::from(home).join(".local/share/com.moonmaxtea.accounting-standards-desktop"))
        .unwrap_or_else(|_| PathBuf::from("/tmp/asd-app-data"))
}

fn main() {
    let root = app_data_root();
    let content_dir = root.join("content");
    let projects_dir = root
        .join("config.json")
        .exists()
        .then(|| {
            let raw = std::fs::read_to_string(root.join("config.json")).ok()?;
            let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
            value
                .get("projects_dir")?
                .as_str()
                .map(PathBuf::from)
        })
        .flatten()
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../tools/pack-builder/tests/fixtures/vault/02 - 项目")
        });

    let mut failures = 0usize;

    macro_rules! check {
        ($label:expr, $cond:expr) => {
            if $cond {
                println!("  ✓ {}", $label);
            } else {
                println!("  ✗ {}", $label);
                failures += 1;
            }
        };
    }

    println!("== Phase 2 VM check (Rust) ==");
    println!("content: {}", content_dir.display());
    println!("projects: {}", projects_dir.display());

    check!(
        "content 目录有效",
        content_dir.join("registry.json").is_file()
    );
    check!(
        "paragraphs.json 可读",
        content_dir.join("index/paragraphs.json").is_file()
    );

    let resolved = resolve_citation(&content_dir, "IFRS 11 §7-8")
        .ok()
        .flatten();
    check!(
        "IFRS 11 §7-8 可解析",
        resolved
            .as_ref()
            .is_some_and(|target| target.standard_id == "IFRS 11")
    );

    let missing = resolve_citation(&content_dir, "IAS 28 §16")
        .ok()
        .flatten();
    check!("IAS 28 §16 预期未解析", missing.is_none());

    let demo = projects_dir.join("Evidence演示-合营安排.md");
    let note = std::fs::read_to_string(&demo).unwrap_or_default();
    check!("演示笔记可读", !note.is_empty());

    let citations = scan_citations(&note);
    check!("扫描到 3 处引用", citations.len() == 3);

    let files = projects::list_project_files(&projects_dir).unwrap_or_default();
    check!("项目列表非空", !files.is_empty());
    check!(
        "演示笔记在列表中",
        files.iter().any(|entry| entry.relative_path.contains("Evidence"))
    );

    if failures > 0 {
        eprintln!("\n失败: {failures}");
        std::process::exit(1);
    }

    println!("\nRust 集成检查全部通过 ({} 个项目笔记).", files.len());
}
