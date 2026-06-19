# Accounting Copilot — Desktop App

Tauri 2 desktop app: standards browser, workbench, AI writing, GitHub OTA updates.

**Agent onboarding:** start at [../AGENTS.md](../AGENTS.md).

## Dev

```bash
# From repo root
pnpm install
pnpm app:dev
```

## Build

```bash
pnpm app:build
```

Installers: `app/src-tauri/target/release/bundle/`

## Test

```bash
pnpm test
cd src-tauri && cargo test
```

## First use (current flow)

1. Launch app → **Setup** wizard
2. Enter GitHub token if the repo is private (Contents read)
3. Click **Download standards pack**
4. Open **Settings** (gear) → choose project workspace folder
5. Use **Workbench** and **Standards** tabs after pack is installed

Manual zip import exists in Rust (`pick_and_import_content_pack`) but is not exposed in the current Setup UI.

## Key paths

| Area | Path |
|------|------|
| Pages | `src/pages/` |
| Tauri API | `src/api.ts` |
| Commands | `src-tauri/src/commands.rs` |
| Updates | `src-tauri/src/update.rs` |
| Vite config | `vite.config.ts` (`base: "./"`) |
