use tauri::AppHandle;

use crate::db;
use crate::models::{PackInfo, SearchHit, StandardDetail, StandardSummary};
use crate::pack::{self, content_dir, load_registry, read_standard_body};

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
