#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DATA="${HOME}/.local/share/com.moonmaxtea.accounting-standards-desktop"
VAULT_PROJECTS="${VAULT_PROJECTS:-/tmp/vault/02 - 项目}"
PACK_ZIP="${PACK_ZIP:-${ROOT_DIR}/build/standards-pack-2026.06.19.zip}"
CONTENT_VERSION="${CONTENT_VERSION:-2026.06.19}"

mkdir -p "${APP_DATA}"

echo "== 整体功能测试准备 =="
export VAULT_PROJECTS
bash "${ROOT_DIR}/scripts/import-standards-pack.sh" "${PACK_ZIP}"

cat > "${APP_DATA}/config.json" <<EOF
{
  "projects_dir": "${VAULT_PROJECTS}",
  "ai": {
    "provider": "openai",
    "api_key": null,
    "model": "gpt-4o",
    "allow_legacy_citations": false
  },
  "projects_ui": {
    "pinned": [],
    "order": {},
    "last_evidence_file": "${VAULT_PROJECTS}/IFRS项目/合营联营会计处理/合营联营定义与会计处理.md",
    "last_selected_folder": "IFRS项目"
  },
  "update": {
    "manifest_url": "https://raw.githubusercontent.com/MoonMaxTea/Accounting-standards-Desktop/cursor/phase4-auto-update-1b98/updates/manifest.json",
    "check_on_startup": true,
    "last_content_version": "${CONTENT_VERSION}",
    "last_update_check_secs": null
  }
}
EOF

echo "  ✓ 已写入 config.json（项目目录: ${VAULT_PROJECTS}）"

bash "${ROOT_DIR}/scripts/vm-test-phase2-backend.sh"
bash "${ROOT_DIR}/scripts/vm-test-phase2-ui.sh"
bash "${ROOT_DIR}/scripts/vm-test-phase2-ui-flow.sh"

echo
echo "== 整体功能测试完成 =="
