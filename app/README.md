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

## Troubleshooting (Continue / AI)

**App version:** 0.1.14+

| Symptom | Check |
|---------|--------|
| Follow-up does nothing; no new log | `%APPDATA%\com.moonmaxtea.accounting-copilot\ai-debug.log` (Windows) or `~/.local/share/com.moonmaxtea.accounting-copilot/` (Linux) |
| No `continue_requested` | Frontend / invoke did not reach Rust |
| `continue_requested` but no `agent_continue` | Pre-AI path error — see `error_class` (`relative_path` = canonical path issue on 0.1.13) |
| Success | `continue_requested` → `continue_enter_ai` → `agent_continue` |

Examples:

```bash
cd src-tauri && cargo run --example continue_path_check
DEEPSEEK_API_KEY=... cargo run --example agent_live_check -- deepseek-v4-flash
```

See [../docs/RELEASE-NOTES.md](../docs/RELEASE-NOTES.md) and [../AGENTS.md](../AGENTS.md) (AI subsystem).
