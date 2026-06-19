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

pub fn extract_title_for_entry(content: &str, fallback: &str) -> String {
    extract_title(content, fallback)
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

pub fn list_project_tree(
    projects_root: &Path,
    ui: Option<&crate::config::ProjectsUiState>,
) -> Result<Vec<crate::models::ProjectTreeNode>, String> {
    if !projects_root.is_dir() {
        return Err(format!("项目目录不存在: {}", projects_root.display()));
    }
    let nodes = build_tree_level(projects_root, projects_root, None, ui)?;
    Ok(nodes)
}

fn build_tree_level(
    current_dir: &Path,
    projects_root: &Path,
    parent_relative: Option<&str>,
    ui: Option<&crate::config::ProjectsUiState>,
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
        let children = build_tree_level(&path, projects_root, Some(&relative), ui)?;
        nodes.push(crate::models::ProjectTreeNode::Folder {
            name,
            path: path.display().to_string(),
            relative_path: relative,
            children,
        });
    }

    nodes.extend(file_entries.into_iter().map(|(_, node)| node));
    if let Some(state) = ui {
        apply_ui_to_nodes(&mut nodes, state, parent_relative);
    }
    Ok(nodes)
}

fn apply_ui_to_nodes(
    nodes: &mut Vec<crate::models::ProjectTreeNode>,
    ui: &crate::config::ProjectsUiState,
    parent_relative: Option<&str>,
) {
    let key = crate::config::ProjectsUiState::parent_key(parent_relative);
    if let Some(order) = ui.order.get(&key) {
        nodes.sort_by(|left, right| {
            let left_key = node_relative_path(left);
            let right_key = node_relative_path(right);
            let left_index = order.iter().position(|item| item == left_key);
            let right_index = order.iter().position(|item| item == right_key);
            match (left_index, right_index) {
                (Some(left), Some(right)) => left.cmp(&right),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => node_sort_fallback(left, right),
            }
        });
    }

    for node in nodes.iter_mut() {
        if let crate::models::ProjectTreeNode::Folder { relative_path, children, .. } = node {
            apply_ui_to_nodes(children, ui, Some(relative_path));
        }
    }
}

fn node_relative_path(node: &crate::models::ProjectTreeNode) -> &str {
    match node {
        crate::models::ProjectTreeNode::Folder { relative_path, .. } => relative_path,
        crate::models::ProjectTreeNode::File { relative_path, .. } => relative_path,
    }
}

fn node_sort_fallback(
    left: &crate::models::ProjectTreeNode,
    right: &crate::models::ProjectTreeNode,
) -> std::cmp::Ordering {
    match (left, right) {
        (
            crate::models::ProjectTreeNode::Folder { name: left_name, .. },
            crate::models::ProjectTreeNode::Folder { name: right_name, .. },
        ) => left_name.to_lowercase().cmp(&right_name.to_lowercase()),
        (crate::models::ProjectTreeNode::Folder { .. }, _) => std::cmp::Ordering::Less,
        (_, crate::models::ProjectTreeNode::Folder { .. }) => std::cmp::Ordering::Greater,
        (
            crate::models::ProjectTreeNode::File {
                modified_secs: left_secs,
                ..
            },
            crate::models::ProjectTreeNode::File {
                modified_secs: right_secs,
                ..
            },
        ) => right_secs.cmp(left_secs),
    }
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

pub fn rename_project_file(
    projects_root: &Path,
    file_path: &Path,
    new_name: &str,
) -> Result<ProjectFileEntry, String> {
    let validated = crate::config::validate_project_path(projects_root, file_path)?;
    if !validated.is_file() {
        return Err("只能重命名 .md 项目笔记".to_string());
    }

    let safe_name = sanitize_project_name(new_name);
    if safe_name.is_empty() {
        return Err("项目名不能为空".to_string());
    }

    let Some(parent) = validated.parent() else {
        return Err("无法定位文件所在文件夹".to_string());
    };

    let old_stem = validated
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("未命名");
    let (date, suffix) = dated_filename_parts(old_stem);
    let new_filename = match date {
        Some(date) => build_filename(&safe_name, &date, suffix),
        None => format!("{safe_name}.md"),
    };
    let new_path = parent.join(&new_filename);

    let content = fs::read_to_string(&validated).map_err(|error| error.to_string())?;
    let updated_content = ensure_heading_matches_name(&safe_name, &content);

    if new_path == validated {
        if updated_content != content {
            fs::write(&validated, updated_content).map_err(|error| error.to_string())?;
        }
        return file_entry_from_path(projects_root, &validated);
    }

    if new_path.exists() {
        return Err(format!("同名文件已存在: {new_filename}"));
    }

    fs::write(&validated, updated_content).map_err(|error| error.to_string())?;
    fs::rename(&validated, &new_path).map_err(|error| error.to_string())?;
    file_entry_from_path(projects_root, &new_path)
}

fn dated_filename_parts(stem: &str) -> (Option<String>, Option<u32>) {
    let captures = regex::Regex::new(r"^(.+)-(\d{4}-\d{2}-\d{2})(?:-(\d+))?$")
        .expect("valid regex")
        .captures(stem);
    let Some(captures) = captures else {
        return (None, None);
    };
    let date = captures
        .get(2)
        .map(|value| value.as_str().to_string());
    let suffix = captures
        .get(3)
        .and_then(|value| value.as_str().parse::<u32>().ok());
    (date, suffix)
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

pub fn file_entry_from_path(projects_root: &Path, path: &Path) -> Result<ProjectFileEntry, String> {
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

        let tree = list_project_tree(temp.path(), None).expect("tree");
        assert_eq!(tree.len(), 1);
        match &tree[0] {
            crate::models::ProjectTreeNode::Folder { name, children, .. } => {
                assert_eq!(name, "合营分析");
                assert_eq!(children.len(), 1);
            }
            _ => panic!("expected folder"),
        }
    }

    #[test]
    fn renames_project_file_and_updates_heading() {
        let temp = tempfile::tempdir().expect("tempdir");
        let note_path = temp.path().join("合营安排判断-2026-06-18.md");
        fs::write(&note_path, "# 合营安排判断\n\n正文").expect("write");

        let renamed = rename_project_file(temp.path(), &note_path, "合营安排结论")
            .expect("rename");
        assert!(renamed.relative_path.ends_with("合营安排结论-2026-06-18.md"));
        assert_eq!(renamed.title, "合营安排结论");

        let content = fs::read_to_string(temp.path().join(&renamed.relative_path)).expect("read");
        assert!(content.starts_with("# 合营安排结论"));
    }

    #[test]
    fn finds_similar_project_names() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(
            temp.path().join("合营安排判断-2026-06-01.md"),
            "# 合营安排判断",
        )
        .expect("write");
        fs::write(
            temp.path().join("合营安排-2026-05-01.md"),
            "# 合营安排",
        )
        .expect("write");

        let matches = find_similar_projects(temp.path(), "合营安排判断").expect("matches");
        assert!(!matches.is_empty());
        assert!(matches.iter().any(|item| item.project_name == "合营安排判断"));
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

pub fn count_folder_entries(projects_root: &Path, folder_relative: &str) -> Result<usize, String> {
    let folder = resolve_folder_path(projects_root, Some(folder_relative))?;
    Ok(collect_md_files(&folder)?.len())
}

fn collect_md_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(dir)
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
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(is_ignored_file)
        {
            continue;
        }
        files.push(path.to_path_buf());
    }
    Ok(files)
}

pub fn delete_project_folder(
    projects_root: &Path,
    folder_relative: &str,
    trash: &mut crate::trash::TrashStore,
    app: &tauri::AppHandle,
) -> Result<crate::models::DeleteFolderResult, String> {
    let folder = resolve_folder_path(projects_root, Some(folder_relative))?;
    let files = collect_md_files(&folder)?;
    if files.is_empty() {
        fs::remove_dir_all(&folder).map_err(|error| error.to_string())?;
        return Ok(crate::models::DeleteFolderResult {
            folder_relative: folder_relative.to_string(),
            trashed_files: 0,
        });
    }

    for file in &files {
        trash.move_project_file(app, projects_root, file)?;
    }

    fs::remove_dir_all(&folder).map_err(|error| error.to_string())?;
    Ok(crate::models::DeleteFolderResult {
        folder_relative: folder_relative.to_string(),
        trashed_files: files.len(),
    })
}

pub fn project_name_from_filename(relative_path: &str) -> String {
    let file_name = Path::new(relative_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(relative_path);
    if let Some(captures) = regex::Regex::new(r"^(.+)-\d{4}-\d{2}-\d{2}(?:-\d+)?$")
        .expect("valid regex")
        .captures(file_name)
    {
        return captures
            .get(1)
            .map(|value| value.as_str().to_string())
            .unwrap_or_else(|| file_name.to_string());
    }
    file_name.to_string()
}

fn normalize_project_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .filter(|ch| !ch.is_whitespace() && !matches!(ch, '-' | '_' | '—' | '·'))
        .collect()
}

pub fn find_similar_projects(
    projects_root: &Path,
    project_name: &str,
) -> Result<Vec<crate::models::SimilarProjectMatch>, String> {
    let target = normalize_project_name(project_name);
    if target.is_empty() {
        return Ok(Vec::new());
    }

    let mut matches = Vec::new();
    for entry in list_project_files(projects_root)? {
        let candidate_name = project_name_from_filename(&entry.relative_path);
        let normalized = normalize_project_name(&candidate_name);
        if normalized.is_empty() {
            continue;
        }

        let reason = if normalized == target {
            Some("项目名完全相同")
        } else if normalized.contains(&target) || target.contains(&normalized) {
            Some("项目名高度相似")
        } else {
            similarity_ratio(&normalized, &target)
                .filter(|ratio| *ratio >= 0.72)
                .map(|_| "项目名可能重复")
        };

        if let Some(reason) = reason {
            matches.push(crate::models::SimilarProjectMatch {
                relative_path: entry.relative_path.clone(),
                title: entry.title.clone(),
                project_name: candidate_name,
                reason: reason.to_string(),
            });
        }
    }

    matches.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    matches.dedup_by(|left, right| left.relative_path == right.relative_path);
    Ok(matches)
}

fn similarity_ratio(left: &str, right: &str) -> Option<f32> {
    if left.is_empty() || right.is_empty() {
        return None;
    }
    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    let distance = levenshtein(&left_chars, &right_chars);
    let max_len = left_chars.len().max(right_chars.len()) as f32;
    Some(1.0 - (distance as f32 / max_len))
}

fn levenshtein(left: &[char], right: &[char]) -> usize {
    let mut rows: Vec<Vec<usize>> = vec![vec![0; right.len() + 1]; left.len() + 1];
    for (index, value) in rows[0].iter_mut().enumerate() {
        *value = index;
    }
    for (index, row) in rows.iter_mut().enumerate().skip(1) {
        row[0] = index;
    }
    for (left_index, left_char) in left.iter().enumerate() {
        for (right_index, right_char) in right.iter().enumerate() {
            let cost = usize::from(left_char != right_char);
            rows[left_index + 1][right_index + 1] = (rows[left_index][right_index + 1] + 1)
                .min(rows[left_index + 1][right_index] + 1)
                .min(rows[left_index][right_index] + cost);
        }
    }
    rows[left.len()][right.len()]
}
