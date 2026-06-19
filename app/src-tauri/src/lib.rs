mod citations;
mod commands;
mod config;
mod db;
mod models;
mod pack;
mod projects;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_pack_info,
            commands::import_content_pack,
            commands::pick_and_import_content_pack,
            commands::get_config,
            commands::save_projects_dir,
            commands::pick_projects_dir,
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
            commands::paragraphs_index_loaded,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
