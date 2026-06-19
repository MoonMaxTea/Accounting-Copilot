#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT_REPO="${VAULT_REPO:-https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap.git}"
VAULT_DIR="${VAULT_DIR:-/tmp/vault}"
TARGET_DIR="${TARGET_DIR:-${ROOT_DIR}/tools/pack-builder/tests/fixtures/vault-live/02 - 项目}"
SOURCE_DIR="${VAULT_DIR}/02 - 项目"

if [[ ! -d "${VAULT_DIR}/.git" ]]; then
  echo "克隆 Vault 仓库..."
  git clone --depth 1 "${VAULT_REPO}" "${VAULT_DIR}"
else
  echo "更新 Vault 仓库..."
  git -C "${VAULT_DIR}" pull --ff-only origin master 2>/dev/null || git -C "${VAULT_DIR}" pull --ff-only
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "✗ Vault 中找不到 02 - 项目 目录"
  exit 1
fi

mkdir -p "$(dirname "${TARGET_DIR}")"
rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"
cp -a "${SOURCE_DIR}/." "${TARGET_DIR}/"

echo "✓ 已同步项目笔记到 ${TARGET_DIR}"
find "${TARGET_DIR}" -name "*.md" -type f | wc -l | xargs -I{} echo "  markdown 文件: {} 篇"
