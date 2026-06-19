//! First-install content pack download verification.
//! Usage: cargo run --example first_install_download_check
//! Optional env: ASD_UPDATE_ACCESS_TOKEN or GITHUB_TOKEN

use std::path::PathBuf;

use app_lib::update::{fetch_manifest, is_content_version_newer, sha256_file, ContentUpdateInfo};

const MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/MoonMaxTea/Accounting-Copilot/main/updates/manifest.json";

async fn download_pack_to_temp(
    content: &ContentUpdateInfo,
    access_token: Option<&str>,
) -> Result<PathBuf, String> {
    let temp_dir = tempfile::tempdir().map_err(|error| error.to_string())?;
    let destination = temp_dir.path().join(format!("pack-{}.zip", content.latest_version));
    let token = access_token.map(str::trim).filter(|value| !value.is_empty());

    let client = reqwest::Client::builder()
        .user_agent("Accounting-Copilot/0.1.0")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(&content.pack_url)
        .bearer_auth(token.unwrap_or_default())
        .send()
        .await
        .map_err(|error| format!("Pack download request failed: {error}"))?;

    let response = if response.status().is_success() {
        response
    } else if let Some(token) = token {
        let release_url = format!(
            "https://api.github.com/repos/MoonMaxTea/Accounting-Copilot/releases/tags/{}",
            content.release_tag
        );
        let release = client
            .get(&release_url)
            .bearer_auth(token)
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|error| format!("Release lookup failed: {error}"))?;

        if !release.status().is_success() {
            return Err(format!(
                "Release lookup failed: {} (token may lack Contents read access)",
                release.status()
            ));
        }

        #[derive(serde::Deserialize)]
        struct Asset {
            name: String,
            url: String,
        }
        #[derive(serde::Deserialize)]
        struct ReleaseInfo {
            assets: Vec<Asset>,
        }

        let release_info: ReleaseInfo = release
            .json()
            .await
            .map_err(|error| format!("Invalid release JSON: {error}"))?;

        let asset_name = destination
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("standards-pack.zip");

        let asset = release_info
            .assets
            .into_iter()
            .find(|item| item.name == asset_name || item.name.contains(&content.latest_version))
            .ok_or_else(|| format!("Asset not found on release {}", content.release_tag))?;

        client
            .get(&asset.url)
            .bearer_auth(token)
            .header(reqwest::header::ACCEPT, "application/octet-stream")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|error| format!("Asset download failed: {error}"))?
    } else {
        return Err(format!(
            "Pack download failed: {}. Provide ASD_UPDATE_ACCESS_TOKEN for private repos.",
            response.status()
        ));
    };

    if !response.status().is_success() {
        return Err(format!("Pack download failed: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read pack bytes: {error}"))?;

    if content.pack_size_bytes > 0 && bytes.len() as u64 != content.pack_size_bytes {
        return Err(format!(
            "Size mismatch: expected {} bytes, got {} bytes",
            content.pack_size_bytes,
            bytes.len()
        ));
    }

    std::fs::write(&destination, &bytes).map_err(|error| error.to_string())?;

    let actual_sha256 = sha256_file(&destination)?;
    if !actual_sha256.eq_ignore_ascii_case(&content.pack_sha256) {
        return Err(format!(
            "SHA256 mismatch: expected {}, got {}",
            content.pack_sha256, actual_sha256
        ));
    }

    std::mem::forget(temp_dir);
    Ok(destination)
}

#[tokio::main]
async fn main() {
    let token = std::env::var("ASD_UPDATE_ACCESS_TOKEN")
        .ok()
        .or_else(|| std::env::var("GITHUB_TOKEN").ok())
        .filter(|value| !value.trim().is_empty());

    println!("== First-install content pack download check ==");
    println!("Manifest: {MANIFEST_URL}");
    println!(
        "Token: {}",
        if token.is_some() {
            "provided"
        } else {
            "not provided (private repo may fail)"
        }
    );

    let manifest = match fetch_manifest(MANIFEST_URL, token.as_deref()).await {
        Ok(value) => value,
        Err(error) => {
            eprintln!("FAIL manifest: {error}");
            std::process::exit(1);
        }
    };

    let Some(content) = manifest.content else {
        eprintln!("FAIL manifest: no content entry published");
        std::process::exit(1);
    };

    println!(
        "Manifest OK · latest_version={} · pack_size={} bytes",
        content.latest_version, content.pack_size_bytes
    );

    if !is_content_version_newer(&content.latest_version, None) {
        eprintln!("WARN version logic returned not-newer for first install");
    }

    match download_pack_to_temp(&content, token.as_deref()).await {
        Ok(path) => {
            println!("Download OK · saved to {}", path.display());
            println!("SHA256 verified · first-install download path works");
        }
        Err(error) => {
            eprintln!("FAIL download: {error}");
            std::process::exit(1);
        }
    }
}
