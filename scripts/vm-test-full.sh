#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DATA="${HOME}/.local/share/com.moonmaxtea.accounting-standards-desktop"
VAULT_PROJECTS="${VAULT_PROJECTS:-${ROOT_DIR}/tools/pack-builder/tests/fixtures/vault-live/02 - 项目}"
PACK_ZIP="${PACK_ZIP:-${ROOT_DIR}/build/standards-pack-2026.06.19.zip}"
CONTENT_VERSION="${CONTENT_VERSION:-2026.06.19}"

mkdir -p "${APP_DATA}"

echo "== 整体功能测试准备 =="
bash "${ROOT_DIR}/scripts/sync-vault-projects.sh"
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
    "last_evidence_file": "${VAULT_PROJECTS}/双准则对比/DTA与Valuation Allowance/DTA确认与Valuation Allowance对比.md",
    "last_selected_folder": "双准则对比"
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
cd "${ROOT_DIR}/app/src-tauri" && cargo run -q --example evidence_citation_check
bash "${ROOT_DIR}/scripts/vm-test-phase2-ui.sh"
bash "${ROOT_DIR}/scripts/vm-test-phase2-ui-flow.sh"

echo
echo "== 整体功能测试完成 =="
