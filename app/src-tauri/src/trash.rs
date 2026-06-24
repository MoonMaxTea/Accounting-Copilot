use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

use crate::config;
use crate::models::ProjectFileEntry;
use crate::projects;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashEntry {
    pub id: String,
    pub original_relative_path: String,
    pub title: String,
    pub deleted_at_secs: u64,
    pub trash_filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct TrashManifest {
    #[serde(default)]
    entries: Vec<TrashEntry>,
}

pub struct TrashStore {
    manifest: TrashManifest,
}

impl TrashStore {
    pub fn trash_dir(app: &AppHandle) -> Result<PathBuf, String> {
        app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())
            .map(|dir| dir.join("trash"))
    }

    fn manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
        Ok(Self::trash_dir(app)?.join("manifest.json"))
    }

    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = Self::trash_dir(app)?;
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

        let path = Self::manifest_path(app)?;
        if !path.is_file() {
            return Ok(Self {
                manifest: TrashManifest::default(),
            });
        }

        let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let manifest =
            serde_json::from_str(&raw).map_err(|error| format!("Invalid trash manifest: {error}"))?;
        Ok(Self { manifest })
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::manifest_path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let raw =
            serde_json::to_string_pretty(&self.manifest).map_err(|error| error.to_string())?;
        fs::write(path, raw).map_err(|error| error.to_string())
    }

    pub fn list(&self) -> Vec<TrashEntry> {
        let mut entries = self.manifest.entries.clone();
        entries.sort_by(|left, right| right.deleted_at_secs.cmp(&left.deleted_at_secs));
        entries
    }

    pub fn move_project_file(
        &mut self,
        app: &AppHandle,
        projects_root: &Path,
        file_path: &Path,
    ) -> Result<TrashEntry, String> {
        let validated = config::validate_project_path(projects_root, file_path)?;
        if !validated.is_file() {
            return Err("只能移入废纸篓 .md 项目笔记".to_string());
        }

        let relative = validated
            .strip_prefix(
                &projects_root
                    .canonicalize()
                    .map_err(|error| error.to_string())?,
            )
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        let content = fs::read_to_string(&validated).unwrap_or_default();
        let fallback = validated
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("未命名")
            .to_string();
        let title = projects::extract_title_for_entry(&content, &fallback);

        let deleted_at_secs = crate::now_secs();

        let trash_filename = allocate_trash_filename(app, &relative, deleted_at_secs)?;
        let trash_path = Self::trash_dir(app)?.join(&trash_filename);
        fs::rename(&validated, &trash_path).map_err(|error| error.to_string())?;

        let entry = TrashEntry {
            id: format!("{deleted_at_secs}-{}", sanitize_id_part(&relative)),
            original_relative_path: relative,
            title,
            deleted_at_secs,
            trash_filename,
        };
        self.manifest.entries.push(entry.clone());
        self.save(app)?;
        Ok(entry)
    }

    pub fn restore(
        &mut self,
        app: &AppHandle,
        projects_root: &Path,
        id: &str,
    ) -> Result<ProjectFileEntry, String> {
        let index = self
            .manifest
            .entries
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| "废纸篓中找不到该项目".to_string())?;
        let entry = self.manifest.entries[index].clone();

        let trash_path = Self::trash_dir(app)?.join(&entry.trash_filename);
        if !trash_path.is_file() {
            return Err("废纸篓文件已丢失".to_string());
        }

        let mut destination = projects_root.join(&entry.original_relative_path);
        if destination.exists() {
            destination = allocate_restored_path(projects_root, &entry.original_relative_path)?;
        }

        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        fs::rename(&trash_path, &destination).map_err(|error| error.to_string())?;
        self.manifest.entries.remove(index);
        self.save(app)?;

        projects::file_entry_from_path(projects_root, &destination)
    }

    pub fn purge(&mut self, app: &AppHandle, id: &str) -> Result<(), String> {
        let index = self
            .manifest
            .entries
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| "废纸篓中找不到该项目".to_string())?;
        let entry = self.manifest.entries.remove(index);

        let trash_path = Self::trash_dir(app)?.join(&entry.trash_filename);
        if trash_path.is_file() {
            fs::remove_file(&trash_path).map_err(|error| error.to_string())?;
        }

        self.save(app)
    }
}

fn sanitize_id_part(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn allocate_trash_filename(
    app: &AppHandle,
    relative: &str,
    deleted_at_secs: u64,
) -> Result<String, String> {
    let dir = TrashStore::trash_dir(app)?;
    let base_name = Path::new(relative)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("note.md");
    let stem = Path::new(base_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("note");

    for suffix in 0..100 {
        let filename = if suffix == 0 {
            format!("{deleted_at_secs}-{base_name}")
        } else {
            format!("{deleted_at_secs}-{stem}-{suffix}.md")
        };
        let path = dir.join(&filename);
        if !path.exists() {
            return Ok(filename);
        }
    }

    Err("无法分配废纸篓文件名".to_string())
}

fn allocate_restored_path(projects_root: &Path, original_relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(original_relative);
    let parent = path
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .filter(|value| !value.is_empty());
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "无效的文件名".to_string())?;
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("note");

    for suffix in 2..100 {
        let restored_name = format!("{stem}-restored-{suffix}.md");
        let relative = match parent.as_deref() {
            Some(folder) => format!("{folder}/{restored_name}"),
            None => restored_name.clone(),
        };
        let candidate = projects_root.join(&relative);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("目标位置已有同名文件，且无法自动重命名".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_id_part_replaces_slashes() {
        assert_eq!(sanitize_id_part("a/b/c.md"), "a-b-c-md");
    }
}
