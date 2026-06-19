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

const INDEX_FILE: &str = "项目索引.md";

fn is_ignored_file(name: &str) -> bool {
    name.starts_with('.') || name == INDEX_FILE
}

fn is_ignored_dir(name: &str) -> bool {
    name.starts_with('.')
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
        if path.file_name().and_then(|name| name.to_str()) == Some(INDEX_FILE) {
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

pub fn list_project_tree(projects_root: &Path) -> Result<Vec<crate::models::ProjectTreeNode>, String> {
    if !projects_root.is_dir() {
        return Err(format!("项目目录不存在: {}", projects_root.display()));
    }
    build_tree_level(projects_root, projects_root)
}

fn build_tree_level(
    current_dir: &Path,
    projects_root: &Path,
) -> Result<Vec<crate::models::ProjectTreeNode>, String> {
    let mut dir_names = Vec::new();
    let mut file_entries = Vec::new();

    for entry in fs::read_dir(current_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };

        if path.is_dir() {
            if is_ignored_dir(&name) {
                continue;
            }
            dir_names.push((name, path));
            continue;
        }

        if path.extension().and_then(|ext| ext.to_str()) != Some("md") || is_ignored_file(&name) {
            continue;
        }

        let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
        let modified = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let relative = path
            .strip_prefix(projects_root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let content = fs::read_to_string(&path).unwrap_or_default();
        let fallback = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("未命名")
            .to_string();

        file_entries.push((
            modified
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|value| value.as_secs())
                .unwrap_or(0),
            crate::models::ProjectTreeNode::File {
                name: name.clone(),
                path: path.display().to_string(),
                relative_path: relative,
                title: extract_title(&content, &fallback),
                modified_secs: modified
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .map(|value| value.as_secs())
                    .unwrap_or(0),
            },
        ));
    }

    dir_names.sort_by(|left, right| left.0.to_lowercase().cmp(&right.0.to_lowercase()));
    file_entries.sort_by(|left, right| right.0.cmp(&left.0));

    let mut nodes = Vec::new();
    for (name, path) in dir_names {
        let relative = path
            .strip_prefix(projects_root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let children = build_tree_level(&path, projects_root)?;
        nodes.push(crate::models::ProjectTreeNode::Folder {
            name,
            path: path.display().to_string(),
            relative_path: relative,
            children,
        });
    }

    nodes.extend(file_entries.into_iter().map(|(_, node)| node));
    Ok(nodes)
}

pub fn resolve_folder_path(
    projects_root: &Path,
    folder_relative: Option<&str>,
) -> Result<PathBuf, String> {
    let Some(raw) = folder_relative.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(projects_root.to_path_buf());
    };

    let folder = projects_root.join(raw);
    if !folder.is_dir() {
        return Err(format!("文件夹不存在: {raw}"));
    }

    crate::config::validate_project_path(projects_root, &folder)?;
    Ok(folder)
}

pub fn create_project_folder(
    projects_root: &Path,
    parent_relative: Option<&str>,
    name: &str,
) -> Result<String, String> {
    let safe_name = sanitize_project_name(name);
    if safe_name.is_empty() {
        return Err("文件夹名称不能为空".to_string());
    }

    let parent = resolve_folder_path(projects_root, parent_relative)?;
    let new_path = parent.join(&safe_name);
    if new_path.exists() {
        return Err(format!("文件夹已存在: {safe_name}"));
    }

    fs::create_dir(&new_path).map_err(|error| error.to_string())?;
    new_path
        .strip_prefix(projects_root)
        .map_err(|error| error.to_string())
        .map(|value| value.to_string_lossy().replace('\\', "/"))
}

pub fn rename_project_folder(
    projects_root: &Path,
    folder_relative: &str,
    new_name: &str,
) -> Result<String, String> {
    let safe_name = sanitize_project_name(new_name);
    if safe_name.is_empty() {
        return Err("文件夹名称不能为空".to_string());
    }

    let folder = resolve_folder_path(projects_root, Some(folder_relative))?;
    let Some(parent) = folder.parent() else {
        return Err("无法重命名根目录".to_string());
    };

    let renamed = parent.join(&safe_name);
    if renamed.exists() {
        return Err(format!("文件夹已存在: {safe_name}"));
    }

    fs::rename(&folder, &renamed).map_err(|error| error.to_string())?;
    renamed
        .strip_prefix(projects_root)
        .map_err(|error| error.to_string())
        .map(|value| value.to_string_lossy().replace('\\', "/"))
}

pub fn move_project_file(
    projects_root: &Path,
    file_path: &Path,
    target_folder_relative: Option<&str>,
) -> Result<ProjectFileEntry, String> {
    let validated = crate::config::validate_project_path(projects_root, file_path)?;
    if !validated.is_file() {
        return Err("只能移动 .md 项目笔记".to_string());
    }

    let target_dir = resolve_folder_path(projects_root, target_folder_relative)?;
    let Some(file_name) = validated.file_name() else {
        return Err("无效的文件名".to_string());
    };

    let destination = target_dir.join(file_name);
    if destination == validated {
        return file_entry_from_path(projects_root, &validated);
    }
    if destination.exists() {
        return Err("目标文件夹中已有同名文件".to_string());
    }

    fs::rename(&validated, &destination).map_err(|error| error.to_string())?;
    file_entry_from_path(projects_root, &destination)
}

fn file_entry_from_path(projects_root: &Path, path: &Path) -> Result<ProjectFileEntry, String> {
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
        .and_then(|stem| stem.to_str())
        .unwrap_or("未命名")
        .to_string();

    Ok(ProjectFileEntry {
        path: path.display().to_string(),
        relative_path: relative,
        title: extract_title(&content, &fallback),
        modified_secs: modified
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|value| value.as_secs())
            .unwrap_or(0),
    })
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

    #[test]
    fn creates_folder_and_moves_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let rel = create_project_folder(temp.path(), None, "合营分析").expect("create");
        assert_eq!(rel, "合营分析");

        let note_path = temp.path().join("demo-2026-06-18.md");
        fs::write(&note_path, "# demo").expect("write");

        let moved = move_project_file(temp.path(), &note_path, Some("合营分析")).expect("move");
        assert!(moved.relative_path.starts_with("合营分析/"));

        let tree = list_project_tree(temp.path()).expect("tree");
        assert_eq!(tree.len(), 1);
        match &tree[0] {
            crate::models::ProjectTreeNode::Folder { name, children, .. } => {
                assert_eq!(name, "合营分析");
                assert_eq!(children.len(), 1);
            }
            _ => panic!("expected folder"),
        }
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

pub fn allocate_filepath(
    projects_root: &Path,
    project_name: &str,
    folder_relative: Option<&str>,
) -> Result<PathBuf, String> {
    let target_dir = resolve_folder_path(projects_root, folder_relative)?;
    let date = Local::now().format("%Y-%m-%d").to_string();
    let mut suffix: Option<u32> = None;

    loop {
        let filename = build_filename(project_name, &date, suffix);
        let path = target_dir.join(filename);
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
    folder_relative: Option<&str>,
) -> Result<ProjectFileEntry, String> {
    if !projects_root.is_dir() {
        return Err(format!("项目目录不存在: {}", projects_root.display()));
    }

    let path = allocate_filepath(projects_root, project_name, folder_relative)?;
    fs::write(&path, markdown).map_err(|error| error.to_string())?;

    let relative_path = path
        .strip_prefix(projects_root)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/");

    append_to_project_index(projects_root, &relative_path, project_name)?;
    file_entry_from_path(projects_root, &path)
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
