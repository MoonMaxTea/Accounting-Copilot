pub mod citations;
mod commands;
pub mod config;
mod db;
mod models;
pub mod pack;
pub mod projects;
pub mod ai;
pub mod ai_agent;
mod session;
mod trash;
pub mod update;

use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_pack_info,
            commands::get_config,
            commands::save_projects_dir,
            commands::pick_projects_dir,
            commands::save_ai_config,
            commands::generate_project_document,
            commands::continue_project_document,
            commands::list_project_tree,
            commands::create_project_folder,
            commands::rename_project_folder,
            commands::rename_project_file,
            commands::move_project_file,
            commands::count_project_folder_entries,
            commands::delete_project_folder,
            commands::move_project_file_to_trash,
            commands::list_trash_items,
            commands::restore_trash_item,
            commands::purge_trash_item,
            commands::save_projects_child_order,
            commands::toggle_project_pin,
            commands::save_projects_ui_state,
            commands::save_evidence_panel_collapsed,
            commands::append_ai_conversation_turn,
            commands::get_project_conversation,
            commands::list_ai_conversation_index,
            commands::find_similar_projects,
            commands::reveal_project_file,
            commands::reveal_projects_dir,
            commands::list_project_files,
            commands::search_project_files,
            commands::read_project_file,
            commands::resolve_citation,
            commands::scan_note_citations,
            commands::list_standards,
            commands::get_standard,
            commands::search_standards,
            commands::open_official_url,
            commands::get_app_version,
            commands::check_content_updates,
            commands::download_and_apply_content_update,
            commands::download_and_apply_app_update,
            commands::save_update_config,
            commands::paragraphs_index_loaded,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
