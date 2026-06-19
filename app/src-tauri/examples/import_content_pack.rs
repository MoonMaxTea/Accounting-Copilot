//! Import a standards content pack into the local app data directory.
//! Usage: cargo run --example import_content_pack -- /path/to/standards-pack.zip

use std::env;
use std::path::PathBuf;

use app_lib::pack;

fn app_data_root() -> PathBuf {
    std::env::var("HOME")
        .map(|home| {
            PathBuf::from(home).join(".local/share/com.moonmaxtea.accounting-copilot")
        })
        .unwrap_or_else(|_| PathBuf::from("/tmp/asd-app-data"))
}

fn main() {
    let zip_path = env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            eprintln!("Usage: import_content_pack <standards-pack.zip>");
            std::process::exit(2);
        });

    let data_root = app_data_root();
    std::fs::create_dir_all(&data_root).expect("create app data dir");

    match pack::import_content_pack_at(&data_root, &zip_path) {
        Ok(info) => {
            println!("Imported content pack successfully.");
            println!("  loaded: {}", info.loaded);
            println!("  version: {:?}", info.content_version);
            println!("  vault_commit: {:?}", info.vault_commit);
            println!("  counts: {:?}", info.counts);
            println!("  content_dir: {:?}", info.content_dir);
        }
        Err(error) => {
            eprintln!("Import failed: {error}");
            std::process::exit(1);
        }
    }
}
