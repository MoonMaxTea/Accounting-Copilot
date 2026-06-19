use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectsUiState {
    #[serde(default)]
    pub pinned: Vec<String>,
    #[serde(default)]
    pub order: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub last_evidence_file: Option<String>,
    #[serde(default)]
    pub last_selected_folder: Option<String>,
}

impl ProjectsUiState {
    pub fn parent_key(parent_relative: Option<&str>) -> String {
        parent_relative
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("")
            .to_string()
    }

    pub fn toggle_pin(&mut self, relative_path: &str) {
        if let Some(index) = self.pinned.iter().position(|item| item == relative_path) {
            self.pinned.remove(index);
        } else {
            self.pinned.push(relative_path.to_string());
        }
    }

    pub fn set_child_order(&mut self, parent_relative: Option<&str>, ordered: Vec<String>) {
        let key = Self::parent_key(parent_relative);
        if ordered.is_empty() {
            self.order.remove(&key);
        } else {
            self.order.insert(key, ordered);
        }
    }

    pub fn remove_path_references(&mut self, relative_path: &str) {
        self.pinned.retain(|item| item != relative_path);
        self.last_evidence_file = self
            .last_evidence_file
            .take()
            .filter(|value| value != relative_path);
        if self.last_selected_folder.as_deref() == Some(relative_path) {
            self.last_selected_folder = None;
        }
        for paths in self.order.values_mut() {
            paths.retain(|item| item != relative_path);
        }
        self.order.retain(|_, paths| !paths.is_empty());
    }

    pub fn remove_folder_prefix(&mut self, folder_relative: &str) {
        let prefix = format!("{folder_relative}/");
        self.pinned
            .retain(|item| item != folder_relative && !item.starts_with(&prefix));
        if self.last_selected_folder.as_deref() == Some(folder_relative) {
            self.last_selected_folder = None;
        }
        self.order.remove(folder_relative);
        let keys: Vec<String> = self.order.keys().cloned().collect();
        for key in keys {
            if key == folder_relative || key.starts_with(&prefix) {
                self.order.remove(&key);
                continue;
            }
            if let Some(paths) = self.order.get_mut(&key) {
                paths.retain(|item| {
                    item != folder_relative && !item.starts_with(&prefix)
                });
            }
        }
        self.order.retain(|_, paths| !paths.is_empty());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub projects_dir: Option<String>,
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub projects_ui: ProjectsUiState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiConfig {
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub allow_legacy_citations: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            projects_dir: None,
            ai: AiConfig {
                provider: Some("openai".to_string()),
                api_key: None,
                model: Some("gpt-4o".to_string()),
                allow_legacy_citations: false,
            },
            projects_ui: ProjectsUiState::default(),
        }
    }
}

pub fn update_projects_ui<F>(app: &AppHandle, update: F) -> Result<ProjectsUiState, String>
where
    F: FnOnce(&mut ProjectsUiState),
{
    let mut config = load_config(app)?;
    update(&mut config.projects_ui);
    save_config(app, &config)?;
    Ok(config.projects_ui)
}

pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
        .map(|dir| dir.join("config.json"))
}

pub fn load_config(app: &AppHandle) -> Result<AppConfig, String> {
    let path = config_path(app)?;
    if !path.is_file() {
        return Ok(AppConfig::default());
    }

    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| format!("Invalid config.json: {error}"))
}

pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

pub fn projects_dir(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let config = load_config(app)?;
    Ok(config
        .projects_dir
        .map(PathBuf::from)
        .filter(|path| path.is_dir()))
}

pub fn ensure_projects_dir(app: &AppHandle) -> Result<PathBuf, String> {
    projects_dir(app)?.ok_or_else(|| {
        "尚未设置项目目录。请在「设置」中选择 Obsidian 的 02 - 项目 文件夹。".to_string()
    })
}

pub fn validate_project_path(projects_root: &Path, file_path: &Path) -> Result<PathBuf, String> {
    let canonical_root = projects_root
        .canonicalize()
        .map_err(|error| format!("项目目录无效: {error}"))?;
    let canonical_file = file_path
        .canonicalize()
        .map_err(|error| format!("文件不存在: {error}"))?;

    if !canonical_file.starts_with(&canonical_root) {
        return Err("文件不在项目目录内".to_string());
    }

    Ok(canonical_file)
}
