//! Path + debug smoke test for Continue (no LLM).
//! Usage:
//!   cargo run --example continue_path_check

use std::fs;
use std::path::PathBuf;

use app_lib::config::validate_project_path;
use app_lib::projects;
use serde_json::json;

fn app_data_root() -> PathBuf {
    std::env::var("HOME")
        .map(|home| PathBuf::from(home).join(".local/share/com.moonmaxtea.accounting-copilot"))
        .unwrap_or_else(|_| PathBuf::from("/tmp/asd-app-data"))
}

fn main() {
    let projects_root = std::env::var("ASD_PROJECTS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp/continue-path-projects"));
    let note_dir = projects_root.join("path-check");
    fs::create_dir_all(&note_dir).expect("mkdir");
    let note_path = note_dir.join("note.md");
    fs::write(&note_path, "# Path check\n\nBody.").expect("write note");

    let via_dot = note_dir.join("..").join("path-check").join("note.md");
    let validated = validate_project_path(&projects_root, &via_dot).unwrap_or_else(|error| {
        eprintln!("validate_project_path FAILED: {error}");
        std::process::exit(1);
    });
    println!("validated: {}", validated.display());

    let content = projects::read_project_file(&projects_root, &validated).unwrap_or_else(|error| {
        eprintln!("read_project_file FAILED: {error}");
        std::process::exit(1);
    });
    assert!(content.contains("Path check"));
    println!("read_project_file OK ({} chars)", content.len());

    let debug_path = app_data_root().join("ai-debug.log");
    if let Some(parent) = debug_path.parent() {
        fs::create_dir_all(parent).expect("app data dir");
    }
    let ts_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let line = json!({
        "ts_secs": ts_secs,
        "mode": "continue",
        "phase": "continue_path_check",
        "platform": std::env::consts::OS,
        "run_id": "path-check-run",
        "detail": "path-check/note.md",
    })
    .to_string();
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&debug_path)
        .and_then(|mut file| {
            use std::io::Write;
            writeln!(file, "{line}")
        })
        .expect("write debug");
    let log_tail = fs::read_to_string(&debug_path).unwrap_or_default();
    assert!(
        log_tail.contains("continue_path_check"),
        "ai-debug.log should contain continue_path_check event"
    );
    println!("ai-debug.log write OK: {}", debug_path.display());
    println!("\n=== continue_path_check PASSED ===");
}
