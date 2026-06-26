#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "== Accounting Copilot test environment setup =="

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js >= 22 is required" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm 9 is required (corepack enable && corepack prepare pnpm@9.15.0 --activate)" >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: Rust stable is required (https://rustup.rs)" >&2
  exit 1
fi

echo "  Node $(node --version)"
echo "  pnpm $(pnpm --version)"
echo "  rustc $(rustc --version | awk '{print $2}')"

if [[ "$(uname -s)" == "Linux" ]] && ! pkg-config --exists gdk-3.0 2>/dev/null; then
  echo
  echo "Installing Linux dev packages for Tauri / cargo test..."
  if command -v sudo >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y \
      libwebkit2gtk-4.1-dev \
      libgtk-3-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      pkg-config
  else
    echo "error: gdk-3.0 not found and apt-get is unavailable." >&2
    echo "Install WebKit/GTK dev packages manually (see .github/workflows/test.yml)." >&2
    exit 1
  fi
fi

echo
echo "Installing workspace dependencies..."
pnpm install

echo
echo "Running tests..."
pnpm test:all

echo
echo "Test environment ready."
