use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use reqwest::Client;
use reqwest::StatusCode;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri::Manager;

use crate::config::{self, UpdateConfig};
use crate::models::{PackInfo, UpdateCheckResult};

pub use crate::models::ContentUpdateInfo;
use crate::pack;

const USER_AGENT: &str = "Accounting-Copilot/0.1.0";

fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())
}

fn authorized_get(client: &Client, url: &str, access_token: Option<&str>) -> reqwest::RequestBuilder {
    let request = client.get(url);
    match access_token.map(str::trim).filter(|value| !value.is_empty()) {
        Some(token) => request.bearer_auth(token),
        None => request,
    }
}

fn github_api_get(client: &Client, url: &str, access_token: &str) -> reqwest::RequestBuilder {
    client
        .get(url)
        .bearer_auth(access_token)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
}

fn github_raw_get(client: &Client, url: &str, access_token: &str) -> reqwest::RequestBuilder {
    client
        .get(url)
        .bearer_auth(access_token)
        .header(reqwest::header::ACCEPT, "application/vnd.github.raw+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
}

fn github_asset_get(client: &Client, asset_api_url: &str, access_token: &str) -> reqwest::RequestBuilder {
    client
        .get(asset_api_url)
        .bearer_auth(access_token)
        .header(reqwest::header::ACCEPT, "application/octet-stream")
        .header("X-GitHub-Api-Version", "2022-11-28")
}

fn auth_error_hint(status: StatusCode) -> &'static str {
    match status {
        StatusCode::UNAUTHORIZED => {
            "访问令牌无效或已过期。请重新生成 GitHub Token 并确保勾选 Contents 读取权限。"
        }
        StatusCode::FORBIDDEN => {
            "访问令牌权限不足。Fine-grained Token 需对 Accounting-standards-Desktop 仓库勾选 Contents: Read-only。"
        }
        StatusCode::NOT_FOUND => {
            "资源不存在，或私有仓库未配置有效访问令牌（raw.githubusercontent.com 不支持私有仓库 Token）。"
        }
        _ => "请检查网络连接与访问令牌配置。",
    }
}

/// Parses `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}`.
fn parse_raw_github_url(url: &str) -> Option<(String, String, String, String)> {
    let remainder = url
        .trim()
        .strip_prefix("https://raw.githubusercontent.com/")?;
    let mut parts = remainder.splitn(4, '/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.to_string();
    let git_ref = parts.next()?.to_string();
    let file_path = parts.next()?.to_string();
    Some((owner, repo, git_ref, file_path))
}

/// Parses `https://github.com/{owner}/{repo}/releases/download/{tag}/{asset}`.
fn parse_release_download_url(url: &str) -> Option<(String, String, String, String)> {
    let remainder = url.trim().strip_prefix("https://github.com/")?;
    let mut parts = remainder.split('/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.to_string();
    if parts.next()? != "releases" {
        return None;
    }
    if parts.next()? != "download" {
        return None;
    }
    let tag = parts.next()?.to_string();
    let asset_name = parts.collect::<Vec<_>>().join("/");
    if asset_name.is_empty() {
        return None;
    }
    Some((owner, repo, tag, asset_name))
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    assets: Vec<GitHubReleaseAsset>,
}

async fn fetch_manifest_via_github_api(
    client: &Client,
    owner: &str,
    repo: &str,
    git_ref: &str,
    file_path: &str,
    access_token: &str,
) -> Result<UpdatesManifest, String> {
    let api_url = format!(
        "https://api.github.com/repos/{owner}/{repo}/contents/{file_path}?ref={git_ref}"
    );
    let response = github_raw_get(client, &api_url, access_token)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|error| format!("无法通过 GitHub API 获取更新清单: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub API 读取更新清单失败: {}。{}",
            response.status(),
            auth_error_hint(response.status())
        ));
    }

    response
        .json::<UpdatesManifest>()
        .await
        .map_err(|error| format!("更新清单格式无效: {error}"))
}

async fn download_release_asset_via_github_api(
    client: &Client,
    owner: &str,
    repo: &str,
    tag: &str,
    asset_name: &str,
    access_token: &str,
) -> Result<reqwest::Response, String> {
    let release_url = format!("https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}");
    let release = github_api_get(client, &release_url, access_token)
        .send()
        .await
        .map_err(|error| format!("无法查询 Release 信息: {error}"))?;

    if !release.status().is_success() {
        return Err(format!(
            "查询 Release 失败: {}。{}",
            release.status(),
            auth_error_hint(release.status())
        ));
    }

    let release_info = release
        .json::<GitHubRelease>()
        .await
        .map_err(|error| format!("Release 信息格式无效: {error}"))?;

    let asset = release_info
        .assets
        .into_iter()
        .find(|item| item.name == asset_name)
        .ok_or_else(|| format!("Release {tag} 中未找到文件 {asset_name}"))?;

    let response = github_asset_get(client, &asset.url, access_token)
        .send()
        .await
        .map_err(|error| format!("无法下载 Release 文件: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "下载 Release 文件失败: {}。{}",
            response.status(),
            auth_error_hint(response.status())
        ));
    }

    Ok(response)
}

#[derive(Debug, Deserialize)]
pub struct UpdatesManifest {
    #[allow(dead_code)]
    pub schema_version: u32,
    pub content: Option<ContentUpdateInfo>,
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

pub async fn fetch_manifest(
    manifest_url: &str,
    access_token: Option<&str>,
) -> Result<UpdatesManifest, String> {
    let client = build_http_client()?;

    let response = authorized_get(&client, manifest_url, access_token)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|error| format!("无法获取更新清单: {error}"))?;

    if response.status().is_success() {
        return response
            .json::<UpdatesManifest>()
            .await
            .map_err(|error| format!("更新清单格式无效: {error}"));
    }

    let status = response.status();
    let token = access_token.map(str::trim).filter(|value| !value.is_empty());

    if let Some(token) = token {
        if let Some((owner, repo, git_ref, file_path)) = parse_raw_github_url(manifest_url) {
            if matches!(
                status,
                StatusCode::NOT_FOUND | StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
            ) {
                return fetch_manifest_via_github_api(
                    &client, &owner, &repo, &git_ref, &file_path, token,
                )
                .await;
            }
        }
    }

    if status == StatusCode::NOT_FOUND && token.is_none() {
        return Err(
            "无法读取更新清单（404）。若清单在私有 GitHub 仓库，请填写有 Contents 读取权限的访问令牌。"
                .to_string(),
        );
    }

    Err(format!(
        "更新清单返回错误: {}。{}",
        status,
        auth_error_hint(status)
    ))
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

    let access_token = config
        .update
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let manifest = match fetch_manifest(&config.update.manifest_url, access_token).await {
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

    if manifest.content.is_none() {
        status = "error".to_string();
        message = Some("更新清单中尚未发布准则库版本，请稍后再试或联系管理员。".to_string());
    } else if let Some(content) = manifest.content {
        if is_content_version_newer(&content.latest_version, current.as_deref()) {
            if app_meets_min_version(&running_app_version, content.min_app_version.as_deref()) {
                status = "content_available".to_string();
                message = Some(format!(
                    "发现新准则库版本 {}（当前 {}）。",
                    content.latest_version,
                    current.as_deref().unwrap_or("未导入")
                ));
                available = Some(content);
            } else {
                status = "app_update_required".to_string();
                message = Some(format!(
                    "新的准则库需要 App 版本 {} 或更高，您当前是 {}。请先升级 App，再更新准则库。",
                    content.min_app_version.as_deref().unwrap_or("未知"),
                    running_app_version
                ));
            }
        } else {
            message = Some(format!(
                "准则库已是最新版本（{}）。",
                current.as_deref().unwrap_or("未记录")
            ));
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
    let config = config::load_config(app)?;
    let access_token = config
        .update
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let client = build_http_client()?;

    let response = authorized_get(&client, &content.pack_url, access_token)
        .send()
        .await
        .map_err(|error| format!("下载准则库失败: {error}"))?;

    let response = if response.status().is_success() {
        response
    } else {
        let status = response.status();
        let token = access_token.map(str::trim).filter(|value| !value.is_empty());
        if let Some(token) = token {
            if let Some((owner, repo, tag, asset_name)) =
                parse_release_download_url(&content.pack_url)
            {
                if matches!(
                    status,
                    StatusCode::NOT_FOUND | StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
                ) {
                    download_release_asset_via_github_api(
                        &client, &owner, &repo, &tag, &asset_name, token,
                    )
                    .await?
                } else {
                    return Err(format!(
                        "下载准则库失败: {}。{}",
                        status,
                        auth_error_hint(status)
                    ));
                }
            } else if status == StatusCode::NOT_FOUND {
                return Err(
                    "无法下载准则库（404）。若 Release 在私有仓库，请在设置中填写 GitHub 访问令牌。"
                        .to_string(),
                );
            } else {
                return Err(format!(
                    "下载准则库失败: {}。{}",
                    status,
                    auth_error_hint(status)
                ));
            }
        } else if status == StatusCode::NOT_FOUND {
            return Err(
                "无法下载准则库（404）。若 Release 在私有仓库，请填写有 Contents 读取权限的访问令牌。"
                    .to_string(),
            );
        } else {
            return Err(format!(
                "下载准则库失败: {}。{}",
                status,
                auth_error_hint(status)
            ));
        }
    };

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

pub fn save_update_settings(app: &AppHandle, update: UpdateConfig) -> Result<crate::config::AppConfig, String> {
    config::update_config(app, |config| {
        config.update.manifest_url = update.manifest_url;
        config.update.check_on_startup = update.check_on_startup;
        config.update.auto_download_content = update.auto_download_content;
        config.update.access_token = update
            .access_token
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
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

    #[test]
    fn parses_raw_github_manifest_url() {
        let parsed = parse_raw_github_url(
            "https://raw.githubusercontent.com/MoonMaxTea/Accounting-standards-Desktop/main/updates/manifest.json",
        )
        .expect("should parse");
        assert_eq!(parsed.0, "MoonMaxTea");
        assert_eq!(parsed.1, "Accounting-standards-Desktop");
        assert_eq!(parsed.2, "main");
        assert_eq!(parsed.3, "updates/manifest.json");
    }

    #[test]
    fn parses_release_download_url() {
        let parsed = parse_release_download_url(
            "https://github.com/MoonMaxTea/Accounting-standards-Desktop/releases/download/content-2026.06.19/standards-pack-2026.06.19.zip",
        )
        .expect("should parse");
        assert_eq!(parsed.0, "MoonMaxTea");
        assert_eq!(parsed.1, "Accounting-standards-Desktop");
        assert_eq!(parsed.2, "content-2026.06.19");
        assert_eq!(parsed.3, "standards-pack-2026.06.19.zip");
    }
}
