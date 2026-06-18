#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pnpm --filter @asd/pack-builder build

ARGS=("$@")
if [ "${ARGS[0]:-}" = "--" ]; then
  ARGS=("${ARGS[@]:1}")
fi

node tools/pack-builder/dist/cli.js "${ARGS[@]}"
