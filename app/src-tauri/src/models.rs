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
