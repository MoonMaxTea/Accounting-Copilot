//! Evidence citation resolution + highlight range check for project notes.
//! Usage: cargo run --example evidence_citation_check

use std::path::{Path, PathBuf};

use app_lib::citations::{resolve_citation, scan_citations};
use app_lib::projects;

fn app_data_root() -> PathBuf {
    std::env::var("HOME")
        .map(|home| {
            PathBuf::from(home).join(".local/share/com.moonmaxtea.accounting-standards-desktop")
        })
        .unwrap_or_else(|_| PathBuf::from("/tmp/asd-app-data"))
}

fn projects_dir_from_config(root: &Path) -> Option<PathBuf> {
    let raw = std::fs::read_to_string(root.join("config.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value
        .get("projects_dir")?
        .as_str()
        .map(PathBuf::from)
}

fn main() {
    let root = app_data_root();
    let content_dir = root.join("content");
    let projects_dir = projects_dir_from_config(&root).unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../tools/pack-builder/tests/fixtures/vault-live/02 - 项目")
    });

    let mut failures = 0usize;
    let mut total_notes = 0usize;
    let mut total_citations = 0usize;
    let mut resolved_citations = 0usize;

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

    println!("== Evidence 引用跳转与高亮检查 ==");
    println!("content: {}", content_dir.display());
    println!("projects: {}", projects_dir.display());

    check!(
        "准则库已导入",
        content_dir.join("registry.json").is_file()
    );
    check!("项目目录存在", projects_dir.is_dir());

    let files = projects::list_project_files(&projects_dir).unwrap_or_default();
    check!("项目笔记非空", !files.is_empty());

    let mut asc_resolved = false;
    let mut highlight_ok = false;

    for entry in &files {
        if !entry.relative_path.ends_with(".md") {
            continue;
        }
        total_notes += 1;
        let note = std::fs::read_to_string(&entry.path).unwrap_or_default();
        let citations = scan_citations(&note);
        total_citations += citations.len();

        let mut note_resolved = 0usize;
        for citation in &citations {
            if let Ok(Some(target)) = resolve_citation(&content_dir, citation) {
                note_resolved += 1;
                resolved_citations += 1;
                if citation.starts_with("ASC ") && target.char_end > target.char_start {
                    asc_resolved = true;
                    highlight_ok = true;
                }
                if target.char_end > target.char_start {
                    highlight_ok = true;
                }
            }
        }

        println!(
            "  · {} — 引用 {} 处，可跳转 {} 处",
            entry.relative_path,
            citations.len(),
            note_resolved
        );
    }

    check!("至少一篇笔记含可跳转引用", resolved_citations > 0);
    check!(
        "双准则 ASC 引用可跳转并带高亮范围",
        asc_resolved
    );
    check!("存在有效 char_start/char_end 高亮范围", highlight_ok);

    println!(
        "\n汇总: {} 篇笔记, {} 处引用, {} 处可跳转",
        total_notes, total_citations, resolved_citations
    );

    if failures > 0 {
        eprintln!("\n失败: {failures}");
        std::process::exit(1);
    }

    println!("\nEvidence 引用跳转与高亮检查全部通过.");
}
