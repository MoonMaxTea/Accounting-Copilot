#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DATA="${HOME}/.local/share/com.moonmaxtea.accounting-copilot"
CONTENT_DIR="${APP_DATA}/content"
PROJECTS_DIR="${VAULT_PROJECTS:-${ROOT_DIR}/tools/pack-builder/tests/fixtures/vault-live/02 - 项目}"

pass=0
fail=0

ok() { echo "  ✓ $1"; pass=$((pass + 1)); }
bad() { echo "  ✗ $1"; fail=$((fail + 1)); }

echo "== Phase 2 后端 VM 测试 =="

[[ -d "${CONTENT_DIR}" ]] && ok "准则库已导入" || bad "准则库未导入"
[[ -f "${CONTENT_DIR}/index/paragraphs.json" ]] && ok "paragraphs.json 存在" || bad "缺少 paragraphs.json"
[[ -f "${APP_DATA}/config.json" ]] && ok "config.json 存在" || bad "缺少 config.json"

cd "${ROOT_DIR}/app/src-tauri"
if cargo run -q --example phase2_vm_check; then
  ok "Rust 集成检查通过"
else
  bad "Rust 集成检查失败"
fi

if pgrep -f "target/debug/accounting-copilot|target/release/accounting-copilot" >/dev/null; then
  ok "桌面应用进程运行中"
else
  bad "桌面应用未运行"
fi

DEMO="${PROJECTS_DIR}/Evidence演示-合营安排.md"
REAL="${PROJECTS_DIR}/双准则对比/DTA与Valuation Allowance/DTA确认与Valuation Allowance对比.md"
if [[ -f "${DEMO}" ]]; then
  ok "演示笔记 fixture 就绪"
elif [[ -f "${REAL}" ]]; then
  ok "真实 Vault 项目笔记就绪（含 ASC 双准则对比）"
elif [[ -f "${PROJECTS_DIR}/IFRS项目/合营联营会计处理/合营联营定义与会计处理.md" ]]; then
  ok "真实 Vault IFRS 项目笔记就绪"
else
  bad "演示笔记缺失"
fi

echo
echo "通过: ${pass}  失败: ${fail}"
[[ "${fail}" -eq 0 ]]
