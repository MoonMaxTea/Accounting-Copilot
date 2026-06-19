use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use chrono::Local;

use crate::models::ProjectFileEntry;

pub struct ParsedAiDocument {
    pub project_name: String,
    pub markdown: String,
}

fn extract_title(content: &str, fallback: &str) -> String {
    for line in content.lines() {
        if let Some(title) = line.strip_prefix("# ") {
            return title.trim().to_string();
        }
    }
    fallback.to_string()
}

pub fn list_project_files(projects_root: &Path) -> Result<Vec<ProjectFileEntry>, String> {
    if !projects_root.is_dir() {
        return Err(format!(
            "项目目录不存在: {}",
            projects_root.display()
        ));
    }

    let mut entries = Vec::new();

    for entry in walkdir::WalkDir::new(projects_root)
        .into_iter()
        .filter_map(|item| item.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        if path.file_name().and_then(|name| name.to_str()) == Some("项目索引.md") {
            continue;
        }

        let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
        let modified = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let relative = path
            .strip_prefix(projects_root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        let content = fs::read_to_string(path).unwrap_or_default();
        let fallback = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("未命名")
            .to_string();

        entries.push(ProjectFileEntry {
            path: path.display().to_string(),
            relative_path: relative,
            title: extract_title(&content, &fallback),
            modified_secs: modified
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|value| value.as_secs())
                .unwrap_or(0),
        });
    }

    entries.sort_by(|left, right| right.modified_secs.cmp(&left.modified_secs));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_dated_filename_with_suffix() {
        assert_eq!(
            build_filename("合营安排判断", "2026-06-18", None),
            "合营安排判断-2026-06-18.md"
        );
        assert_eq!(
            build_filename("合营安排判断", "2026-06-18", Some(2)),
            "合营安排判断-2026-06-18-2.md"
        );
    }

    #[test]
    fn ensures_heading_matches_project_name() {
        let output = ensure_heading_matches_name("合营安排判断", "## 旧标题\n正文");
        assert!(output.starts_with("# 合营安排判断"));
        assert!(output.contains("## 旧标题"));
    }
}

pub fn sanitize_project_name(name: &str) -> String {
    name.trim()
        .chars()
        .filter(|ch| !matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn build_filename(project_name: &str, date: &str, suffix: Option<u32>) -> String {
    let base = sanitize_project_name(project_name);
    match suffix {
        Some(value) => format!("{base}-{date}-{value}.md"),
        None => format!("{base}-{date}.md"),
    }
}

pub fn allocate_filepath(projects_root: &Path, project_name: &str) -> Result<PathBuf, String> {
    let date = Local::now().format("%Y-%m-%d").to_string();
    let mut suffix: Option<u32> = None;

    loop {
        let filename = build_filename(project_name, &date, suffix);
        let path = projects_root.join(filename);
        if !path.exists() {
            return Ok(path);
        }
        suffix = Some(suffix.map(|value| value + 1).unwrap_or(2));
    }
}

pub fn ensure_heading_matches_name(project_name: &str, markdown: &str) -> String {
    let trimmed = markdown.trim();
    if let Some(rest) = trimmed.strip_prefix("# ") {
        if let Some(line_end) = rest.find('\n') {
            let body = rest[line_end + 1..].trim_start();
            return format!("# {project_name}\n\n{body}");
        }
        return format!("# {project_name}");
    }
    format!("# {project_name}\n\n{trimmed}")
}

pub fn append_to_project_index(
    projects_root: &Path,
    relative_path: &str,
    title: &str,
) -> Result<(), String> {
    let index_path = projects_root.join("项目索引.md");
    if !index_path.is_file() {
        return Ok(());
    }

    let line = format!("\n- [{title}]({relative_path})");
    let mut file = fs::OpenOptions::new()
        .append(true)
        .open(&index_path)
        .map_err(|error| error.to_string())?;
    file.write_all(line.as_bytes())
        .map_err(|error| error.to_string())
}

pub fn save_generated_project(
    projects_root: &Path,
    project_name: &str,
    markdown: &str,
) -> Result<ProjectFileEntry, String> {
    if !projects_root.is_dir() {
        return Err(format!("项目目录不存在: {}", projects_root.display()));
    }

    let path = allocate_filepath(projects_root, project_name)?;
    fs::write(&path, markdown).map_err(|error| error.to_string())?;

    let relative_path = path
        .strip_prefix(projects_root)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/");

    append_to_project_index(projects_root, &relative_path, project_name)?;

    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH);

    Ok(ProjectFileEntry {
        path: path.display().to_string(),
        relative_path,
        title: project_name.to_string(),
        modified_secs: modified
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|value| value.as_secs())
            .unwrap_or(0),
    })
}

pub fn read_project_file(projects_root: &Path, file_path: &Path) -> Result<String, String> {
    let validated = crate::config::validate_project_path(projects_root, file_path)?;
    fs::read_to_string(validated).map_err(|error| error.to_string())
}

pub fn search_project_files(
    projects_root: &Path,
    query: &str,
) -> Result<Vec<ProjectFileEntry>, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return list_project_files(projects_root);
    }

    let mut entries = list_project_files(projects_root)?;
    entries.retain(|entry| {
        entry.title.to_lowercase().contains(&needle)
            || entry.relative_path.to_lowercase().contains(&needle)
            || fs::read_to_string(&entry.path)
                .unwrap_or_default()
                .to_lowercase()
                .contains(&needle)
    });
    Ok(entries)
}
