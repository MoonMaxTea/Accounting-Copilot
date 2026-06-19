# Contributing

Thank you for improving Accounting Copilot. AI agents should read [AGENTS.md](./AGENTS.md) first.

## Prerequisites

- Node.js ≥ 22
- pnpm 9
- Rust stable
- Linux: WebKit/GTK dev packages for Tauri (see `.github/workflows/release-app.yml`)

## Setup

```bash
git clone https://github.com/MoonMaxTea/Accounting-standards-Desktop.git
cd Accounting-standards-Desktop
pnpm install
pnpm app:dev
```

## Development workflow

1. Branch from `main`: `cursor/<topic>-1b98` (lowercase).
2. Make focused changes; match existing code style.
3. Run tests before opening a PR:

```bash
pnpm test
cd app/src-tauri && cargo test
```

4. Push and open a PR against `main`.

## Code style

- **TypeScript:** types on public APIs; functional React components.
- **Rust:** explicit error messages (often bilingual in `update.rs` user strings); prefer `Result<T, String>` in command layer.
- **Scope:** minimal diffs; do not refactor unrelated code.
- **UI:** English strings; use existing Tailwind tokens (`brand-*`, `ui-focus-ring`).
- **Dialogs:** use `DialogProvider`, not native `prompt`/`confirm`.

## Releases

### App (`app-vX.Y.Z`)

1. Merge changes to `main`.
2. Bump version in:
   - `app/package.json`
   - `app/src-tauri/Cargo.toml`
   - `app/src-tauri/tauri.conf.json`
3. Commit: `chore: bump app version to X.Y.Z`
4. Tag and push:

```bash
git tag -a app-vX.Y.Z -m "Release notes summary"
git push origin main app-vX.Y.Z
```

GitHub Actions builds installers automatically.

### Content pack (`content-YYYY.MM.DD`)

- Trigger `.github/workflows/build-pack.yml` or run `pnpm pack:build` locally with Vault clone.
- CI updates `updates/manifest.json` and creates the GitHub Release.

App and content releases are **independent**.

## Secrets & config

- **Never** commit GitHub PATs, OpenAI keys, or local `config.json`.
- Private repo users need a fine-grained token with **Contents: Read-only** on this repository.

## Documentation

| Doc | Audience |
|-----|----------|
| [AGENTS.md](./AGENTS.md) | AI coding agents |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Module map |
| [docs/DESIGN.md](./docs/DESIGN.md) | Product design (Chinese) |

When adding major subsystems, update `AGENTS.md` and `docs/ARCHITECTURE.md`.

## Questions

Open a GitHub issue or refer to [docs/DESIGN.md](./docs/DESIGN.md) for product intent.
