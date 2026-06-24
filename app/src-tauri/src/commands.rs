use std::path::PathBuf;

use tauri::AppHandle;
use tauri::Emitter;

use crate::ai;
use crate::ai_agent::{self, now_secs};
use crate::citations::{count_paragraphs, resolve_citation as resolve_in_pack, scan_citations};
use crate::config::{self, AiConfig};
use crate::db;
use crate::models::{
    AppConfigResponse, CitationScanResult, CitationTarget, DeleteFolderResult,
    GenerateProjectResult, PackInfo, ProjectFileEntry, ProjectTreeNode, SearchHit,
    SimilarProjectMatch, StandardDetail, StandardSummary, UpdateCheckResult,
};
use crate::pack::{self, content_dir, load_registry, read_standard_body};
use crate::projects;
use crate::trash::{TrashEntry, TrashStore};
use crate::session;
use crate::update;

const DRAFT_AGENT_SESSION_KEY: &str = "__draft__";

fn persist_agent_run(
    app: &AppHandle,
    from_session_key: &str,
    to_session_key: &str,
    session_messages: Vec<crate::models::AiAgentMessage>,
    activity: Vec<crate::models::AiConversationTurn>,
) -> Result<(), String> {
    let (_, mut merged_activity) = session::load_session(app, to_session_key).unwrap_or_default();
    if from_session_key != to_session_key {
        let (_, draft_activity) = session::load_session(app, from_session_key).unwrap_or_default();
        merged_activity = session::merge_activity_for_persist(merged_activity, draft_activity);
        session::delete_session(app, from_session_key)?;
    }
    for turn in activity {
        if !merged_activity
            .iter()
            .any(|item| session::turns_equal(item, &turn))
        {
            merged_activity.push(turn);
        }
    }
    session::save_session(app, to_session_key, &session_messages, &merged_activity)
}

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
    session::migrate_config_sessions(&app)?;
    let config = config::load_config(&app)?;
    Ok(AppConfigResponse {
        projects_dir: config.projects_dir,
        ai: config.ai,
        projects_ui: config.projects_ui,
        update: config.update,
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
pub fn save_ai_config(app: AppHandle, ai: AiConfig) -> Result<AppConfigResponse, String> {
    let mut config = config::load_config(&app)?;
    config.ai = ai;
    config::save_config(&app, &config)?;
    get_config(app)
}

#[tauri::command]
pub async fn generate_project_document(
    app: AppHandle,
    question: String,
    facts: Option<String>,
    folder_relative: Option<String>,
) -> Result<GenerateProjectResult, String> {
    let projects_root = config::ensure_projects_dir(&app)?;
    let content_dir = content_dir(&app)?;
    let config = config::load_config(&app)?;
    let prior_session = session::load_session(&app, DRAFT_AGENT_SESSION_KEY)
        .map(|(messages, _)| messages)
        .unwrap_or_default();
    let (result, session, activity) = ai::generate_and_save_project(
        Some(&app),
        &projects_root,
        &content_dir,
        &config.ai,
        &question,
        facts.as_deref(),
        folder_relative.as_deref(),
        prior_session,
    )
    .await
    .map_err(|error| {
        let _ = app.emit(
            "ai-generation-progress",
            crate::models::AiGenerationProgress {
                phase: "error".to_string(),
                message: error.clone(),
                run_id: None,
                step_index: None,
                kind: None,
                detail: None,
            },
        );
        error
    })?;
    let _ = app.emit(
        "ai-generation-progress",
        crate::models::AiGenerationProgress {
            phase: "complete".to_string(),
            message: result.file_path.clone(),
            run_id: None,
            step_index: None,
            kind: None,
            detail: None,
        },
    );
    persist_agent_run(
        &app,
        DRAFT_AGENT_SESSION_KEY,
        &result.relative_path,
        session,
        activity,
    )?;
    Ok(result)
}

#[tauri::command]
pub async fn continue_project_document(
    app: AppHandle,
    file_path: String,
    question: String,
    facts: Option<String>,
) -> Result<GenerateProjectResult, String> {
    let run_id = format!("continue-{}", now_secs());
    ai_agent::log_continue_pre_ai(
        Some(&app),
        "continue_requested",
        Some(&file_path),
        None,
        Some(&run_id),
    );

    let projects_root = config::ensure_projects_dir(&app).map_err(|error| {
        ai_agent::log_continue_pre_ai(
            Some(&app),
            "continue_failed_before_ai",
            Some(&file_path),
            Some("projects_dir"),
            Some(&run_id),
        );
        emit_continue_error(&app, &run_id, &error);
        error
    })?;
    let content_dir = content_dir(&app).map_err(|error| {
        ai_agent::log_continue_pre_ai(
            Some(&app),
            "continue_failed_before_ai",
            Some(&file_path),
            Some("content_dir"),
            Some(&run_id),
        );
        emit_continue_error(&app, &run_id, &error);
        error
    })?;
    let config = config::load_config(&app).map_err(|error| {
        ai_agent::log_continue_pre_ai(
            Some(&app),
            "continue_failed_before_ai",
            Some(&file_path),
            Some("config"),
            Some(&run_id),
        );
        emit_continue_error(&app, &run_id, &error);
        error
    })?;
    let validated = config::validate_project_path(&projects_root, std::path::Path::new(&file_path))
        .map_err(|error| {
            ai_agent::log_continue_pre_ai(
                Some(&app),
                "continue_failed_before_ai",
                Some(&file_path),
                Some("path_validate"),
                Some(&run_id),
            );
            emit_continue_error(&app, &run_id, &error);
            error
        })?;
    let relative_path = config::relative_project_path(&projects_root, &validated).map_err(|error| {
        ai_agent::log_continue_pre_ai(
            Some(&app),
            "continue_failed_before_ai",
            Some(&file_path),
            Some("relative_path"),
            Some(&run_id),
        );
        emit_continue_error(&app, &run_id, &error);
        error
    })?;
    let prior_session = session::load_session(&app, &relative_path)
        .map(|(messages, _)| messages)
        .unwrap_or_default();

    ai_agent::log_continue_pre_ai(
        Some(&app),
        "continue_enter_ai",
        Some(&relative_path),
        None,
        Some(&run_id),
    );

    let (result, session, activity) = ai::continue_and_update_project(
        Some(&app),
        &projects_root,
        &content_dir,
        &config.ai,
        &validated,
        &question,
        facts.as_deref(),
        prior_session,
    )
    .await
    .map_err(|error| {
        ai_agent::log_continue_pre_ai(
            Some(&app),
            "continue_failed_before_ai",
            Some(&relative_path),
            Some("ai"),
            Some(&run_id),
        );
        emit_continue_error(&app, &run_id, &error);
        error
    })?;
    let _ = app.emit(
        "ai-generation-progress",
        crate::models::AiGenerationProgress {
            phase: "complete".to_string(),
            message: result.relative_path.clone(),
            run_id: Some(run_id.clone()),
            step_index: None,
            kind: None,
            detail: None,
        },
    );
    persist_agent_run(
        &app,
        &relative_path,
        &relative_path,
        session,
        activity,
    )
    .map_err(|error| {
        ai_agent::log_continue_pre_ai(
            Some(&app),
            "continue_failed_before_ai",
            Some(&relative_path),
            Some("persist"),
            Some(&run_id),
        );
        emit_continue_error(&app, &run_id, &error);
        error
    })?;
    Ok(result)
}

fn emit_continue_error(app: &AppHandle, run_id: &str, message: &str) {
    let _ = app.emit(
        "ai-generation-progress",
        crate::models::AiGenerationProgress {
            phase: "error".to_string(),
            message: format!("Continue failed: {message}"),
            run_id: Some(run_id.to_string()),
            step_index: None,
            kind: None,
            detail: None,
        },
    );
}

#[tauri::command]
pub fn list_project_tree(app: AppHandle) -> Result<Vec<ProjectTreeNode>, String> {
    let root = config::ensure_projects_dir(&app)?;
    let ui = config::load_config(&app)?.projects_ui;
    projects::list_project_tree(&root, Some(&ui))
}

#[tauri::command]
pub fn create_project_folder(
    app: AppHandle,
    parent_relative: Option<String>,
    name: String,
) -> Result<String, String> {
    let root = config::ensure_projects_dir(&app)?;
    projects::create_project_folder(&root, parent_relative.as_deref(), &name)
}

#[tauri::command]
pub fn rename_project_folder(
    app: AppHandle,
    folder_relative: String,
    new_name: String,
) -> Result<String, String> {
    let root = config::ensure_projects_dir(&app)?;
    projects::rename_project_folder(&root, &folder_relative, &new_name)
}

#[tauri::command]
pub fn rename_project_file(
    app: AppHandle,
    file_path: String,
    new_name: String,
) -> Result<ProjectFileEntry, String> {
    let root = config::ensure_projects_dir(&app)?;
    let validated = config::validate_project_path(&root, PathBuf::from(&file_path).as_path())?;
    let old_relative = validated
        .strip_prefix(&root)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let entry = projects::rename_project_file(&root, validated.as_path(), &new_name)?;
    config::update_projects_ui(&app, |ui| {
        ui.migrate_path(&old_relative, &entry.relative_path);
    })?;
    session::rename_session(&app, &old_relative, &entry.relative_path)?;
    Ok(entry)
}

#[tauri::command]
pub fn move_project_file(
    app: AppHandle,
    file_path: String,
    target_folder_relative: Option<String>,
) -> Result<ProjectFileEntry, String> {
    let root = config::ensure_projects_dir(&app)?;
    let validated = config::validate_project_path(&root, PathBuf::from(&file_path).as_path())?;
    let old_relative = validated
        .strip_prefix(&root)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let entry = projects::move_project_file(
        &root,
        validated.as_path(),
        target_folder_relative.as_deref(),
    )?;
    config::update_projects_ui(&app, |ui| {
        ui.migrate_path(&old_relative, &entry.relative_path);
    })?;
    session::rename_session(&app, &old_relative, &entry.relative_path)?;
    Ok(entry)
}

#[tauri::command]
pub fn count_project_folder_entries(app: AppHandle, folder_relative: String) -> Result<usize, String> {
    let root = config::ensure_projects_dir(&app)?;
    projects::count_folder_entries(&root, &folder_relative)
}

#[tauri::command]
pub fn delete_project_folder(app: AppHandle, folder_relative: String) -> Result<DeleteFolderResult, String> {
    let root = config::ensure_projects_dir(&app)?;
    let mut trash = TrashStore::load(&app)?;
    let result = projects::delete_project_folder(&root, &folder_relative, &mut trash, &app)?;
    config::update_projects_ui(&app, |ui| {
        ui.remove_folder_prefix(&folder_relative);
    })?;
    session::delete_sessions_with_prefix(&app, &folder_relative)?;
    Ok(result)
}

#[tauri::command]
pub fn move_project_file_to_trash(app: AppHandle, file_path: String) -> Result<TrashEntry, String> {
    let root = config::ensure_projects_dir(&app)?;
    let mut trash = TrashStore::load(&app)?;
    let entry = trash.move_project_file(&app, &root, PathBuf::from(file_path).as_path())?;
    config::update_projects_ui(&app, |ui| {
        ui.remove_path_references(&entry.original_relative_path);
    })?;
    session::delete_session(&app, &entry.original_relative_path)?;
    Ok(entry)
}

#[tauri::command]
pub fn list_trash_items(app: AppHandle) -> Result<Vec<TrashEntry>, String> {
    Ok(TrashStore::load(&app)?.list())
}

#[tauri::command]
pub fn restore_trash_item(app: AppHandle, id: String) -> Result<ProjectFileEntry, String> {
    let root = config::ensure_projects_dir(&app)?;
    let mut trash = TrashStore::load(&app)?;
    trash.restore(&app, &root, &id)
}

#[tauri::command]
pub fn purge_trash_item(app: AppHandle, id: String) -> Result<(), String> {
    let mut trash = TrashStore::load(&app)?;
    trash.purge(&app, &id)
}

#[tauri::command]
pub fn save_projects_child_order(
    app: AppHandle,
    parent_relative: Option<String>,
    ordered_relative_paths: Vec<String>,
) -> Result<crate::config::ProjectsUiState, String> {
    config::update_projects_ui(&app, |ui| {
        ui.set_child_order(parent_relative.as_deref(), ordered_relative_paths);
    })
}

#[tauri::command]
pub fn toggle_project_pin(app: AppHandle, relative_path: String) -> Result<crate::config::ProjectsUiState, String> {
    config::update_projects_ui(&app, |ui| {
        ui.toggle_pin(&relative_path);
    })
}

#[tauri::command]
pub fn save_projects_ui_state(
    app: AppHandle,
    last_evidence_file: Option<String>,
    last_selected_folder: Option<String>,
) -> Result<crate::config::ProjectsUiState, String> {
    config::update_projects_ui(&app, |ui| {
        ui.last_evidence_file = last_evidence_file;
        ui.last_selected_folder = last_selected_folder;
    })
}

#[tauri::command]
pub fn save_evidence_panel_collapsed(
    app: AppHandle,
    collapsed: bool,
) -> Result<crate::config::ProjectsUiState, String> {
    config::update_projects_ui(&app, |ui| {
        ui.evidence_panel_collapsed = collapsed;
    })
}

#[tauri::command]
pub fn get_project_conversation(
    app: AppHandle,
    relative_path: String,
) -> Result<Vec<crate::models::AiConversationTurn>, String> {
    let config = config::load_config(&app)?;
    let (session_messages, session_file_activity) =
        session::load_session(&app, &relative_path).unwrap_or_default();
    let stored = if !session_file_activity.is_empty() {
        session_file_activity
    } else {
        config
            .projects_ui
            .ai_threads
            .get(&relative_path)
            .cloned()
            .unwrap_or_default()
    };
    let session_activity =
        projects::conversation_activity_from_agent_session(&session_messages);

    if relative_path == DRAFT_AGENT_SESSION_KEY {
        return Ok(projects::merge_conversation_sources(
            stored,
            session_activity,
            Vec::new(),
        ));
    }

    let markdown_turns = match config::ensure_projects_dir(&app) {
        Ok(root) => {
            let file_path = root.join(&relative_path);
            match projects::read_project_file(&root, &file_path) {
                Ok(content) => projects::extract_conversation_from_markdown(&content),
                Err(_) => Vec::new(),
            }
        }
        Err(_) => Vec::new(),
    };

    Ok(projects::merge_conversation_sources(
        stored,
        session_activity,
        markdown_turns,
    ))
}

#[tauri::command]
pub fn append_ai_conversation_turn(
    app: AppHandle,
    relative_path: String,
    turn: crate::models::AiConversationTurn,
) -> Result<crate::config::ProjectsUiState, String> {
    let (messages, mut activity) = session::load_session(&app, &relative_path).unwrap_or_default();
    activity.push(turn);
    session::save_session(&app, &relative_path, &messages, &activity)?;
    Ok(config::load_config(&app)?.projects_ui)
}

#[tauri::command]
pub fn list_ai_conversation_index(
    app: AppHandle,
) -> Result<Vec<crate::models::AiConversationIndexEntry>, String> {
    let config = config::load_config(&app)?;
    session::conversation_index_with_legacy(&app, &config.projects_ui)
}

#[tauri::command]
pub fn find_similar_projects(app: AppHandle, project_name: String) -> Result<Vec<SimilarProjectMatch>, String> {
    let root = config::ensure_projects_dir(&app)?;
    projects::find_similar_projects(&root, &project_name)
}

#[tauri::command]
pub fn reveal_project_file(app: AppHandle, path: String) -> Result<(), String> {
    let root = config::ensure_projects_dir(&app)?;
    let validated = config::validate_project_path(&root, PathBuf::from(path).as_path())?;
    let Some(parent) = validated.parent() else {
        return Err("无法定位文件所在文件夹".to_string());
    };

    open_path_in_file_manager(parent)
}

fn open_path_in_file_manager(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("无法打开文件夹: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("无法打开文件夹: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| format!("无法打开文件夹: {error}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("当前平台暂不支持打开文件夹".to_string())
}

#[tauri::command]
pub fn reveal_projects_dir(app: AppHandle) -> Result<(), String> {
    let root = config::ensure_projects_dir(&app)?;
    open_path_in_file_manager(&root)
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

    let trimmed = url.trim();
    if !trimmed.starts_with("https://") {
        return Err("出于安全考虑，只能打开 https 开头的官网链接。".to_string());
    }

    app.opener()
        .open_url(trimmed, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_content_updates(app: AppHandle) -> Result<UpdateCheckResult, String> {
    update::check_updates(&app).await
}

#[tauri::command]
pub async fn download_and_apply_content_update(
    app: AppHandle,
    on_progress: tauri::ipc::Channel<crate::models::ContentDownloadProgress>,
) -> Result<PackInfo, String> {
    update::download_and_apply_content_update(&app, Some(on_progress)).await
}

#[tauri::command]
pub fn save_update_config(
    app: AppHandle,
    update: crate::config::UpdateConfig,
) -> Result<AppConfigResponse, String> {
    update::save_update_settings(&app, update)?;
    get_config(app)
}

#[tauri::command]
pub async fn download_and_apply_app_update(app: AppHandle) -> Result<String, String> {
    let settings = config::load_config(&app)?;
    let access_token = settings
        .update
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let manifest = update::fetch_manifest(
        &settings.update.manifest_url,
        &settings.update.manifest_url_alt,
        access_token,
    )
    .await?;

    let app_info = manifest
        .app
        .ok_or("更新清单中没有 App 版本信息".to_string())?;

    let destination = update::download_app_installer(&app, &app_info).await?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn paragraphs_index_loaded(app: AppHandle) -> Result<usize, String> {
    let dir = content_dir(&app)?;
    Ok(count_paragraphs(&dir)?)
}
