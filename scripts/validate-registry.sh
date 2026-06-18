#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VAULT_PATH="${1:-/tmp/vault}"
REGISTRY_PATH="${2:-standards-registry.yaml}"

pnpm --filter @asd/pack-builder build
node tools/pack-builder/dist/validate-registry.js --vault "$VAULT_PATH" --registry "$REGISTRY_PATH"
