use std::fs;
use std::path::Path;
use std::time::SystemTime;

use crate::models::ProjectFileEntry;

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
