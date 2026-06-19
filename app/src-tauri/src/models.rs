use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryFile {
    pub schema_version: u32,
    pub content_version: String,
    pub vault_repo: Option<String>,
    pub vault_commit: Option<String>,
    pub built_at: Option<String>,
    pub standards: Vec<StandardRecord>,
    pub counts: Option<RegistryCounts>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryCounts {
    pub current: FrameworkCounts,
    pub legacy: FrameworkCounts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameworkCounts {
    pub ifrs: u32,
    pub ias: u32,
    pub asc: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StandardRecord {
    pub id: String,
    pub title: String,
    pub title_zh: Option<String>,
    pub framework: String,
    pub status: String,
    pub legacy_label: Option<String>,
    pub effective_from: Option<String>,
    pub effective_until: Option<String>,
    pub superseded_by: Option<String>,
    pub supersedes: Option<Vec<String>>,
    pub official_url: String,
    pub official_url_note: Option<String>,
    pub pack_path: String,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PackInfo {
    pub loaded: bool,
    pub content_version: Option<String>,
    pub vault_commit: Option<String>,
    pub counts: Option<RegistryCounts>,
    pub content_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StandardSummary {
    pub id: String,
    pub title: String,
    pub title_zh: Option<String>,
    pub framework: String,
    pub status: String,
    pub legacy_label: Option<String>,
    pub superseded_by: Option<String>,
    pub official_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StandardDetail {
    pub id: String,
    pub title: String,
    pub title_zh: Option<String>,
    pub framework: String,
    pub status: String,
    pub legacy_label: Option<String>,
    pub effective_until: Option<String>,
    pub superseded_by: Option<String>,
    pub official_url: String,
    pub official_url_note: Option<String>,
    pub pack_path: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchHit {
    pub standard_id: String,
    pub pack_path: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfigResponse {
    pub projects_dir: Option<String>,
    pub ai: crate::config::AiConfig,
    pub projects_ui: crate::config::ProjectsUiState,
    pub update: crate::config::UpdateConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentUpdateInfo {
    pub latest_version: String,
    pub release_tag: String,
    pub pack_url: String,
    pub pack_sha256: String,
    pub pack_size_bytes: u64,
    pub min_app_version: Option<String>,
    pub release_notes: Option<String>,
    pub vault_commit: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheckResult {
    pub status: String,
    pub current_content_version: Option<String>,
    pub available_content: Option<ContentUpdateInfo>,
    pub message: Option<String>,
    pub checked_at_secs: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectFileEntry {
    pub path: String,
    pub relative_path: String,
    pub title: String,
    pub modified_secs: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ProjectTreeNode {
    Folder {
        name: String,
        path: String,
        relative_path: String,
        children: Vec<ProjectTreeNode>,
    },
    File {
        name: String,
        path: String,
        relative_path: String,
        title: String,
        modified_secs: u64,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct CitationTarget {
    pub citation: String,
    pub standard_id: String,
    pub paragraph: String,
    pub pack_path: String,
    pub char_start: u64,
    pub char_end: u64,
    pub snippet_en: String,
    pub status: String,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CitationScanResult {
    pub citation: String,
    pub resolved: bool,
    pub target: Option<CitationTarget>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectValidationReport {
    pub citations: Vec<CitationScanResult>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenerateProjectResult {
    pub project_name: String,
    pub file_path: String,
    pub relative_path: String,
    pub title: String,
    pub content: String,
    pub validation: ProjectValidationReport,
    pub similar_projects: Vec<SimilarProjectMatch>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilarProjectMatch {
    pub relative_path: String,
    pub title: String,
    pub project_name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeleteFolderResult {
    pub folder_relative: String,
    pub trashed_files: usize,
}

impl From<&StandardRecord> for StandardSummary {
    fn from(record: &StandardRecord) -> Self {
        Self {
            id: record.id.clone(),
            title: record.title.clone(),
            title_zh: record.title_zh.clone(),
            status: record.status.clone(),
            framework: record.framework.clone(),
            legacy_label: record.legacy_label.clone(),
            superseded_by: record.superseded_by.clone(),
            official_url: record.official_url.clone(),
        }
    }
}
