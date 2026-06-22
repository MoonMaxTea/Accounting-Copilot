use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

use crate::models::{AiAgentMessage, AiConversationTurn};

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
    #[serde(default)]
    pub ai_threads: HashMap<String, Vec<AiConversationTurn>>,
    #[serde(default)]
    pub ai_agent_sessions: HashMap<String, Vec<AiAgentMessage>>,
    #[serde(default)]
    pub evidence_panel_collapsed: bool,
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

    pub fn append_ai_turn(&mut self, relative_path: &str, turn: AiConversationTurn) {
        self.ai_threads
            .entry(relative_path.to_string())
            .or_default()
            .push(turn);
    }

    pub fn agent_session(&self, session_key: &str) -> Vec<AiAgentMessage> {
        self.ai_agent_sessions
            .get(session_key)
            .cloned()
            .unwrap_or_default()
    }

    pub fn set_agent_session(&mut self, session_key: &str, messages: Vec<AiAgentMessage>) {
        if messages.is_empty() {
            self.ai_agent_sessions.remove(session_key);
        } else {
            self.ai_agent_sessions
                .insert(session_key.to_string(), messages);
        }
    }

    pub fn migrate_agent_session(&mut self, from_key: &str, to_key: &str) {
        if from_key == to_key {
            return;
        }
        let Some(messages) = self.ai_agent_sessions.remove(from_key) else {
            return;
        };
        self.ai_agent_sessions.insert(to_key.to_string(), messages);
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
        self.ai_threads.remove(relative_path);
        self.ai_agent_sessions.remove(relative_path);
    }

    pub fn migrate_path(&mut self, old_relative: &str, new_relative: &str) {
        for pinned in &mut self.pinned {
            if pinned == old_relative {
                *pinned = new_relative.to_string();
            }
        }
        if self.last_evidence_file.as_deref() == Some(old_relative) {
            self.last_evidence_file = Some(new_relative.to_string());
        }
        for paths in self.order.values_mut() {
            for path in paths.iter_mut() {
                if path == old_relative {
                    *path = new_relative.to_string();
                }
            }
        }
        if let Some(turns) = self.ai_threads.remove(old_relative) {
            self.ai_threads.insert(new_relative.to_string(), turns);
        }
        if let Some(session) = self.ai_agent_sessions.remove(old_relative) {
            self.ai_agent_sessions
                .insert(new_relative.to_string(), session);
        }
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

const DEFAULT_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/MoonMaxTea/Accounting-Copilot/main/updates/manifest.json";
const DEFAULT_MANIFEST_URL_ALT: &str =
    "https://cdn.jsdelivr.net/gh/MoonMaxTea/Accounting-Copilot@main/updates/manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConfig {
    #[serde(default = "default_manifest_url")]
    pub manifest_url: String,
    /// Alternative manifest URL (e.g. CDN mirror).  Raced against manifest_url.
    #[serde(default = "default_manifest_url_alt")]
    pub manifest_url_alt: String,
    #[serde(default = "default_check_on_startup")]
    pub check_on_startup: bool,
    #[serde(default)]
    pub auto_download_content: bool,
    pub last_content_version: Option<String>,
    pub last_update_check_secs: Option<u64>,
    #[serde(default)]
    pub access_token: Option<String>,
}

fn default_manifest_url() -> String {
    DEFAULT_MANIFEST_URL.to_string()
}

fn default_manifest_url_alt() -> String {
    DEFAULT_MANIFEST_URL_ALT.to_string()
}

fn default_check_on_startup() -> bool {
    true
}

impl Default for UpdateConfig {
    fn default() -> Self {
        Self {
            manifest_url: default_manifest_url(),
            manifest_url_alt: default_manifest_url_alt(),
            check_on_startup: true,
            auto_download_content: true,
            last_content_version: None,
            last_update_check_secs: None,
            access_token: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub projects_dir: Option<String>,
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub projects_ui: ProjectsUiState,
    #[serde(default)]
    pub update: UpdateConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiConfig {
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub allow_legacy_citations: bool,
    /// "agent" (default) or "pipeline" (rollback)
    #[serde(default)]
    pub generation_mode: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            projects_dir: None,
            ai: AiConfig {
                provider: Some("openai".to_string()),
                api_key: None,
                base_url: Some("https://api.openai.com/v1".to_string()),
                model: Some("gpt-4o".to_string()),
                allow_legacy_citations: false,
                generation_mode: Some("agent".to_string()),
            },
            projects_ui: ProjectsUiState::default(),
            update: UpdateConfig::default(),
        }
    }
}

pub fn update_config<F>(app: &AppHandle, update: F) -> Result<AppConfig, String>
where
    F: FnOnce(&mut AppConfig),
{
    let mut config = load_config(app)?;
    update(&mut config);
    save_config(app, &config)?;
    Ok(config)
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
