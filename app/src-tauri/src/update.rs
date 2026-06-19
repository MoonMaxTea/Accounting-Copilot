use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri::Manager;

use crate::config::{self, AppConfig, UpdateConfig};
use crate::models::{ContentUpdateInfo, PackInfo, UpdateCheckResult};
use crate::pack;

#[derive(Debug, Deserialize)]
struct UpdatesManifest {
    #[allow(dead_code)]
    schema_version: u32,
    content: Option<ContentUpdateInfo>,
}

pub fn parse_semver_triplet(version: &str) -> Option<(u32, u32, u32)> {
    let mut parts = version.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    Some((major, minor, patch))
}

pub fn parse_content_version(version: &str) -> Option<(u32, u32, u32)> {
    parse_semver_triplet(version)
}

pub fn is_content_version_newer(latest: &str, current: Option<&str>) -> bool {
    let Some(current_value) = current.filter(|value| !value.is_empty()) else {
        return true;
    };

    match (
        parse_content_version(latest),
        parse_content_version(current_value),
    ) {
        (Some(latest_parts), Some(current_parts)) => latest_parts > current_parts,
        _ => latest != current_value,
    }
}

pub fn app_meets_min_version(app_version: &str, min_app_version: Option<&str>) -> bool {
    let Some(required) = min_app_version.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };

    match (
        parse_semver_triplet(app_version),
        parse_semver_triplet(required),
    ) {
        (Some(current), Some(minimum)) => current >= minimum,
        _ => true,
    }
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    use std::io::Read;

    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn downloads_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
        .map(|dir| dir.join("downloads"))
}

pub fn download_path(app: &AppHandle, version: &str) -> Result<PathBuf, String> {
    Ok(downloads_dir(app)?.join(format!("pack-{version}.zip")))
}

pub async fn fetch_manifest(manifest_url: &str) -> Result<UpdatesManifest, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(manifest_url)
        .send()
        .await
        .map_err(|error| format!("无法获取更新清单: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("更新清单返回错误: {}", response.status()));
    }

    response
        .json::<UpdatesManifest>()
        .await
        .map_err(|error| format!("更新清单格式无效: {error}"))
}

pub fn current_content_version(app: &AppHandle) -> Result<Option<String>, String> {
    let config = config::load_config(app)?;
    if let Some(version) = config
        .update
        .last_content_version
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        return Ok(Some(version.clone()));
    }

    let pack_info = pack::get_pack_info(app)?;
    Ok(pack_info.content_version)
}

pub fn app_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

pub async fn check_updates(app: &AppHandle) -> Result<UpdateCheckResult, String> {
    let config = config::load_config(app)?;
    let current = current_content_version(app)?;
    let running_app_version = app_version(app);
    let checked_at_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0);

    let manifest = match fetch_manifest(&config.update.manifest_url).await {
        Ok(value) => value,
        Err(error) => {
            let _ = config::update_config(app, |saved| {
                saved.update.last_update_check_secs = Some(checked_at_secs);
            });
            return Ok(UpdateCheckResult {
                status: "error".to_string(),
                current_content_version: current,
                available_content: None,
                message: Some(error),
                checked_at_secs,
            });
        }
    };

    let mut status = "up_to_date".to_string();
    let mut message: Option<String> = None;
    let mut available: Option<ContentUpdateInfo> = None;

    if let Some(content) = manifest.content {
        if is_content_version_newer(&content.latest_version, current.as_deref()) {
            if app_meets_min_version(&running_app_version, content.min_app_version.as_deref()) {
                status = "content_available".to_string();
                available = Some(content);
            } else {
                status = "app_update_required".to_string();
                message = Some(format!(
                    "新的准则库需要 App 版本 {} 或更高，您当前是 {}。请先升级 App，再更新准则库。",
                    content.min_app_version.as_deref().unwrap_or("未知"),
                    running_app_version
                ));
            }
        }
    }

    let _ = config::update_config(app, |saved| {
        saved.update.last_update_check_secs = Some(checked_at_secs);
    });

    Ok(UpdateCheckResult {
        status,
        current_content_version: current,
        available_content: available,
        message,
        checked_at_secs,
    })
}

pub async fn download_content_pack(
    app: &AppHandle,
    content: &ContentUpdateInfo,
) -> Result<PathBuf, String> {
    fs::create_dir_all(downloads_dir(app)?).map_err(|error| error.to_string())?;
    let destination = download_path(app, &content.latest_version)?;

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(&content.pack_url)
        .send()
        .await
        .map_err(|error| format!("下载准则库失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("下载准则库失败: {}", response.status()));
    }

    let mut file = File::create(&destination).map_err(|error| error.to_string())?;
    let mut stream = response.bytes_stream();
    let mut downloaded_bytes: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("读取下载内容失败: {error}"))?;
        downloaded_bytes += chunk.len() as u64;
        file.write_all(&chunk)
            .map_err(|error| error.to_string())?;
    }

    if content.pack_size_bytes > 0 && downloaded_bytes != content.pack_size_bytes {
        let _ = fs::remove_file(&destination);
        return Err(format!(
            "下载大小不匹配：期望 {} 字节，实际 {} 字节",
            content.pack_size_bytes, downloaded_bytes
        ));
    }

    let actual_sha256 = sha256_file(&destination)?;
    if !actual_sha256.eq_ignore_ascii_case(&content.pack_sha256) {
        let _ = fs::remove_file(&destination);
        return Err("准则库校验失败（SHA256 不匹配）".to_string());
    }

    Ok(destination)
}

pub fn apply_downloaded_content_pack(
    app: &AppHandle,
    zip_path: &Path,
    content_version: &str,
) -> Result<PackInfo, String> {
    let pack_info = pack::import_content_pack(app, zip_path)?;
    config::update_config(app, |config| {
        config.update.last_content_version = Some(content_version.to_string());
    })?;
    Ok(pack_info)
}

pub async fn download_and_apply_content_update(app: &AppHandle) -> Result<PackInfo, String> {
    let check = check_updates(app).await?;
    if check.status == "app_update_required" {
        return Err(check
            .message
            .unwrap_or_else(|| "请先升级 App，再更新准则库。".to_string()));
    }
    let Some(content) = check.available_content else {
        return Err("当前已是最新准则库".to_string());
    };

    let zip_path = download_content_pack(app, &content).await?;
    apply_downloaded_content_pack(app, &zip_path, &content.latest_version)
}

pub fn save_update_settings(app: &AppHandle, update: UpdateConfig) -> Result<AppConfig, String> {
    config::update_config(app, |config| {
        config.update.manifest_url = update.manifest_url;
        config.update.check_on_startup = update.check_on_startup;
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_dotted_content_versions() {
        assert!(is_content_version_newer("2026.06.19", Some("2026.06.18")));
        assert!(!is_content_version_newer("2026.06.18", Some("2026.06.18")));
        assert!(!is_content_version_newer("2026.06.01", Some("2026.06.18")));
    }

    #[test]
    fn treats_missing_current_as_update_available() {
        assert!(is_content_version_newer("2026.06.18", None));
    }

    #[test]
    fn checks_min_app_version() {
        assert!(app_meets_min_version("0.2.0", Some("0.1.0")));
        assert!(app_meets_min_version("0.1.0", Some("0.1.0")));
        assert!(!app_meets_min_version("0.1.0", Some("1.0.0")));
    }
}
