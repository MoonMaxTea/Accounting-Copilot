#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP="${1:-${ROOT_DIR}/build/standards-pack-2026.06.19.zip}"

if [[ ! -f "${ZIP}" ]]; then
  echo "✗ 找不到准则包: ${ZIP}"
  exit 1
fi

echo "== 导入准则包 =="
echo "  zip: ${ZIP}"

cd "${ROOT_DIR}/app/src-tauri"
cargo run -q --example import_content_pack -- "${ZIP}"
