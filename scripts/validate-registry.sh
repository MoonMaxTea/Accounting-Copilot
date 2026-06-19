#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pnpm --filter @asd/pack-builder build

ARGS=("$@")
if [ "${ARGS[0]:-}" = "--" ]; then
  ARGS=("${ARGS[@]:1}")
fi

if [ "${#ARGS[@]}" -eq 0 ]; then
  ARGS=(--vault /tmp/vault --registry standards-registry.yaml)
fi

node tools/pack-builder/dist/validate-registry.js "${ARGS[@]}"
