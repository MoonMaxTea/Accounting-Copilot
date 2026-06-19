use std::path::PathBuf;

use tauri::AppHandle;

use crate::citations::{count_paragraphs, resolve_citation as resolve_in_pack, scan_citations};
use crate::config::{self};
use crate::db;
use crate::models::{
    AppConfigResponse, CitationScanResult, CitationTarget, PackInfo, ProjectFileEntry,
    SearchHit, StandardDetail, StandardSummary,
};
use crate::pack::{self, content_dir, load_registry, read_standard_body};
use crate::projects;

#[tauri::command]
pub fn get_pack_info(app: AppHandle) -> Result<PackInfo, String> {
    pack::get_pack_info(&app)
}

#[tauri::command]
pub fn import_content_pack(app: AppHandle, zip_path: String) -> Result<PackInfo, String> {
    pack::import_content_pack(&app, std::path::Path::new(&zip_path))
}

#[tauri::command]
pub async fn pick_and_import_content_pack(app: AppHandle) -> Result<PackInfo, String> {
    use tauri_plugin_dialog::DialogExt;

    let selection = app
        .dialog()
        .file()
        .add_filter("Standards Pack", &["zip"])
        .blocking_pick_file();

    let Some(path) = selection else {
        return Err("Import cancelled".to_string());
    };

    let zip_path = path
        .into_path()
        .map_err(|error| error.to_string())?
        .display()
        .to_string();

    import_content_pack(app, zip_path)
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<AppConfigResponse, String> {
    let config = config::load_config(&app)?;
    Ok(AppConfigResponse {
        projects_dir: config.projects_dir,
        ai: config.ai,
    })
}

#[tauri::command]
pub fn save_projects_dir(app: AppHandle, projects_dir: String) -> Result<AppConfigResponse, String> {
    let mut config = config::load_config(&app)?;
    config.projects_dir = Some(projects_dir);
    config::save_config(&app, &config)?;
    get_config(app)
}

#[tauri::command]
pub async fn pick_projects_dir(app: AppHandle) -> Result<AppConfigResponse, String> {
    use tauri_plugin_dialog::DialogExt;

    let selection = app.dialog().file().blocking_pick_folder();
    let Some(path) = selection else {
        return Err("选择已取消".to_string());
    };

    let folder = path
        .into_path()
        .map_err(|error| error.to_string())?
        .display()
        .to_string();

    save_projects_dir(app, folder)
}

#[tauri::command]
pub fn list_project_files(app: AppHandle) -> Result<Vec<ProjectFileEntry>, String> {
    let root = config::ensure_projects_dir(&app)?;
    projects::list_project_files(&root)
}

#[tauri::command]
pub fn search_project_files(app: AppHandle, query: String) -> Result<Vec<ProjectFileEntry>, String> {
    let root = config::ensure_projects_dir(&app)?;
    projects::search_project_files(&root, &query)
}

#[tauri::command]
pub fn read_project_file(app: AppHandle, path: String) -> Result<String, String> {
    let root = config::ensure_projects_dir(&app)?;
    projects::read_project_file(&root, PathBuf::from(path).as_path())
}

#[tauri::command]
pub fn resolve_citation(app: AppHandle, citation: String) -> Result<Option<CitationTarget>, String> {
    let dir = content_dir(&app)?;
    resolve_in_pack(&dir, &citation)
}

#[tauri::command]
pub fn scan_note_citations(app: AppHandle, content: String) -> Result<Vec<CitationScanResult>, String> {
    let dir = content_dir(&app)?;
    let citations = scan_citations(&content);
    let mut results = Vec::new();

    for citation in citations {
        let target = resolve_in_pack(&dir, &citation)?;
        results.push(CitationScanResult {
            citation: citation.clone(),
            resolved: target.is_some(),
            target,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn list_standards(
    app: AppHandle,
    framework: Option<String>,
    include_legacy: bool,
) -> Result<Vec<StandardSummary>, String> {
    let dir = content_dir(&app)?;
    let registry = load_registry(&dir)?;

    let standards = registry
        .standards
        .iter()
        .filter(|record| include_legacy || record.status == "current")
        .filter(|record| {
            framework.as_ref().is_none_or(|value| record.framework.eq_ignore_ascii_case(value))
        })
        .map(StandardSummary::from)
        .collect();

    Ok(standards)
}

#[tauri::command]
pub fn get_standard(app: AppHandle, standard_id: String) -> Result<StandardDetail, String> {
    let dir = content_dir(&app)?;
    let registry = load_registry(&dir)?;

    let record = registry
        .standards
        .iter()
        .find(|item| item.id == standard_id)
        .ok_or_else(|| format!("Standard not found: {standard_id}"))?;

    let body = read_standard_body(&dir, &record.pack_path)?;

    Ok(StandardDetail {
        id: record.id.clone(),
        title: record.title.clone(),
        title_zh: record.title_zh.clone(),
        framework: record.framework.clone(),
        status: record.status.clone(),
        legacy_label: record.legacy_label.clone(),
        effective_until: record.effective_until.clone(),
        superseded_by: record.superseded_by.clone(),
        official_url: record.official_url.clone(),
        official_url_note: record.official_url_note.clone(),
        pack_path: record.pack_path.clone(),
        body,
    })
}

#[tauri::command]
pub fn search_standards(
    app: AppHandle,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchHit>, String> {
    let dir = content_dir(&app)?;
    db::search_standards(&dir, &query, limit.unwrap_or(20))
}

#[tauri::command]
pub fn open_official_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn paragraphs_index_loaded(app: AppHandle) -> Result<usize, String> {
    let dir = content_dir(&app)?;
    Ok(count_paragraphs(&dir)?)
}
