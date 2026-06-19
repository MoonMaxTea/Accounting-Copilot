use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub projects_dir: Option<String>,
    #[serde(default)]
    pub ai: AiConfig,
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
        }
    }
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
