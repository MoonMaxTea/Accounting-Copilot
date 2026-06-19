//! VM integration check for Phase 2 Evidence features.
//! Usage: cargo run --example phase2_vm_check

use std::path::PathBuf;

use app_lib::citations::{resolve_citation, scan_citations};
use app_lib::projects;

fn app_data_root() -> PathBuf {
    std::env::var("HOME")
        .map(|home| PathBuf::from(home).join(".local/share/com.moonmaxtea.accounting-copilot"))
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

    let resolved = resolve_citation(&content_dir, "IFRS 7 §8")
        .ok()
        .flatten();
    check!(
        "IFRS 7 §8 可解析",
        resolved
            .as_ref()
            .is_some_and(|target| target.standard_id == "IFRS 7")
    );

    let paragraph_count = app_lib::citations::count_paragraphs(&content_dir).unwrap_or(0);
    check!("段落索引非空", paragraph_count > 100);

    let demo_fixture = projects_dir.join("Evidence演示-合营安排.md");
    let demo_real = projects_dir.join("IFRS项目/合营联营会计处理/合营联营定义与会计处理.md");
    let demo = if demo_fixture.is_file() {
        demo_fixture
    } else {
        demo_real
    };
    check!("演示笔记可读", demo.is_file());

    let note = std::fs::read_to_string(&demo).unwrap_or_default();
    check!("演示笔记有内容", !note.is_empty());

    let citations = scan_citations(&note);
    check!(
        "扫描到 IFRS 引用",
        citations.iter().any(|citation| citation.contains("IFRS"))
    );

    let files = projects::list_project_files(&projects_dir).unwrap_or_default();
    check!("项目列表非空", !files.is_empty());
    check!(
        "演示笔记在列表中",
        files.iter().any(|entry| {
            entry.relative_path.contains("Evidence")
                || entry.relative_path.contains("合营联营")
        })
    );

    if failures > 0 {
        eprintln!("\n失败: {failures}");
        std::process::exit(1);
    }

    println!("\nRust 集成检查全部通过 ({} 个项目笔记).", files.len());
}
