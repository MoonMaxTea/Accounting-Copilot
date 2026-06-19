#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DATA="${HOME}/.local/share/com.moonmaxtea.accounting-copilot"
PROJECTS_DIR="${ROOT_DIR}/tools/pack-builder/tests/fixtures/vault/02 - 项目"

mkdir -p "${APP_DATA}"
cat > "${APP_DATA}/config.json" <<EOF
{
  "projects_dir": "${PROJECTS_DIR}",
  "ai": {
    "provider": "openai",
    "api_key": null,
    "model": "gpt-4o",
    "allow_legacy_citations": false
  }
}
EOF

echo "已写入 config.json"

bash "${ROOT_DIR}/scripts/vm-test-phase2-backend.sh"
bash "${ROOT_DIR}/scripts/vm-test-phase2-ui.sh"
