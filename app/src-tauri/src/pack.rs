use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri::Manager;
use zip::ZipArchive;

use crate::models::{PackInfo, RegistryFile};

pub fn content_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(base.join("content"))
}

pub fn is_valid_pack(path: &Path) -> bool {
    path.join("registry.json").is_file()
}

pub fn load_registry(content_path: &Path) -> Result<RegistryFile, String> {
    let registry_path = content_path.join("registry.json");
    let raw = fs::read_to_string(&registry_path)
        .map_err(|error| format!("Failed to read registry.json: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Invalid registry.json: {error}"))
}

pub fn pack_info_from_dir(content_path: &Path) -> Result<PackInfo, String> {
    if !is_valid_pack(content_path) {
        return Ok(PackInfo {
            loaded: false,
            content_version: None,
            vault_commit: None,
            counts: None,
            content_dir: Some(content_path.display().to_string()),
        });
    }

    let registry = load_registry(content_path)?;
    Ok(PackInfo {
        loaded: true,
        content_version: Some(registry.content_version),
        vault_commit: registry.vault_commit,
        counts: registry.counts,
        content_dir: Some(content_path.display().to_string()),
    })
}

pub fn get_pack_info(app: &AppHandle) -> Result<PackInfo, String> {
    let dir = content_dir(app)?;
    if !dir.exists() {
        return Ok(PackInfo {
            loaded: false,
            content_version: None,
            vault_commit: None,
            counts: None,
            content_dir: Some(dir.display().to_string()),
        });
    }
    pack_info_from_dir(&dir)
}

pub fn import_content_pack(app: &AppHandle, zip_path: &Path) -> Result<PackInfo, String> {
    if !zip_path.is_file() {
        return Err(format!("Zip file not found: {}", zip_path.display()));
    }

    let content_path = content_dir(app)?;
    let parent = content_path
        .parent()
        .ok_or_else(|| "Unable to resolve app data directory".to_string())?;
    let staging_path = parent.join("content.new");
    let backup_path = parent.join("content.bak");

    if staging_path.exists() {
        fs::remove_dir_all(&staging_path).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&staging_path).map_err(|error| error.to_string())?;

    extract_zip(zip_path, &staging_path)?;

    if !is_valid_pack(&staging_path) {
        let _ = fs::remove_dir_all(&staging_path);
        return Err("Invalid content pack: registry.json is missing".to_string());
    }

    if content_path.exists() {
        if backup_path.exists() {
            fs::remove_dir_all(&backup_path).map_err(|error| error.to_string())?;
        }
        fs::rename(&content_path, &backup_path).map_err(|error| error.to_string())?;
    }

    if let Err(error) = fs::rename(&staging_path, &content_path) {
        if backup_path.exists() && !content_path.exists() {
            let _ = fs::rename(&backup_path, &content_path);
        }
        return Err(error.to_string());
    }

    if backup_path.exists() {
        let _ = fs::remove_dir_all(&backup_path);
    }

    pack_info_from_dir(&content_path)
}

fn extract_zip(zip_path: &Path, destination: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(relative_path) = entry.enclosed_name() else {
            continue;
        };
        let output_path = destination.join(relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&output_path).map_err(|error| error.to_string())?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let mut output_file = File::create(&output_path).map_err(|error| error.to_string())?;
        io::copy(&mut entry, &mut output_file).map_err(|error| error.to_string())?;
    }

    Ok(())
}

pub fn read_standard_body(content_path: &Path, pack_path: &str) -> Result<String, String> {
    let file_path = content_path.join(pack_path);
    fs::read_to_string(&file_path)
        .map_err(|error| format!("Failed to read standard file {}: {error}", file_path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    #[test]
    fn detects_valid_pack_when_registry_exists() {
        let temp = tempdir().expect("tempdir");
        fs::write(
            temp.path().join("registry.json"),
            r#"{"schema_version":1,"content_version":"2026.06.18","standards":[]}"#,
        )
        .expect("write registry");

        assert!(is_valid_pack(temp.path()));
    }

    #[test]
    fn import_zip_extracts_registry_and_marks_loaded() {
        let temp = tempdir().expect("tempdir");
        let zip_path = temp.path().join("pack.zip");
        {
            let file = File::create(&zip_path).expect("create zip");
            let mut writer = ZipWriter::new(file);
            writer
                .start_file(
                    "registry.json",
                    SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored),
                )
                .expect("start file");
            writer
                .write_all(br#"{"schema_version":1,"content_version":"2026.06.18","standards":[]}"#)
                .expect("write registry");
            writer.finish().expect("finish zip");
        }

        let destination = temp.path().join("extracted");
        fs::create_dir_all(&destination).expect("create destination");
        extract_zip(&zip_path, &destination).expect("extract");
        assert!(is_valid_pack(&destination));
    }
}
