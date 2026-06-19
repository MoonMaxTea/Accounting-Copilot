# AGENTS.md — Accounting Copilot (Accounting Standards Desktop)

Guide for AI coding agents working in this repository. Read this before making changes.

## Product snapshot

| Item | Value |
|------|--------|
| **Product name** | Accounting Copilot |
| **Repo** | `MoonMaxTea/Accounting-standards-Desktop` (often **private**) |
| **Stack** | Tauri 2 + Rust + React 19 + TypeScript + Vite + Tailwind 4 |
| **Package manager** | pnpm 9 (monorepo) |
| **Current app version** | See `app/src-tauri/tauri.conf.json` (`version` field) |
| **Content pack** | Built from Obsidian Vault via `tools/pack-builder` |

**Purpose:** Offline IFRS / IAS / ASC standards browser + workbench for project notes, AI-assisted document writing, citation resolution, and GitHub-based content/app updates.

**Content source vault:** [AccoutingStandards-IFRS-USGaap](https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap) (`03 - 知识库/`).

---

## Repository layout

```
/
├── AGENTS.md                 ← you are here
├── CONTRIBUTING.md           ← git, test, release workflow
├── docs/
│   ├── DESIGN.md             ← full product/design spec (Chinese)
│   └── ARCHITECTURE.md       ← module map & data flow
├── app/                      ← Tauri desktop app (main product)
│   ├── src/                  ← React UI
│   └── src-tauri/            ← Rust backend + Tauri commands
├── tools/pack-builder/       ← builds standards-pack zip + updates manifest
├── packages/shared-types/    ← shared TS types for pack-builder
├── updates/manifest.json     ← latest content pack pointer (CI-maintained)
├── standards-registry.yaml   ← standards metadata (130+ entries)
├── writing-spec/             ← synced writing guidelines for AI
├── examples/                 ← sample manifest/registry JSON
└── .github/workflows/
    ├── release-app.yml       ← tag `app-v*` → Windows + Linux installers
    └── build-pack.yml        ← builds content pack release `content-YYYY.MM.DD`
```

**Important:** UI lives under `app/src/`, not repo-root `src/`. Rust lives under `app/src-tauri/`.

---

## Quick start (dev)

```bash
# From repo root
pnpm install
pnpm app:dev          # Tauri dev (Vite :1420 + Rust backend)

# Tests
pnpm test             # shared-types + pack-builder + app (vitest + tsc)
cd app/src-tauri && cargo test

# Production build
pnpm app:build        # installers under app/src-tauri/target/release/bundle/
```

**Linux GUI dev:** requires `DISPLAY` and WebKit/GTK deps (see CI workflow).

**Simulate first install:** delete `~/.local/share/com.moonmaxtea.accounting-standards-desktop/content/` and clear `update.last_content_version` in `config.json`.

---

## Architecture (short)

```
React UI (app/src)
    │  invoke() + Channel (progress)
    ▼
Tauri commands (app/src-tauri/src/commands.rs)
    │
    ├── pack.rs          content pack import, get_pack_info
    ├── update.rs        manifest fetch, download, apply OTA
    ├── db.rs            SQLite FTS for standards search
    ├── citations.rs     paragraph index, citation resolve
    ├── projects.rs      Obsidian projects folder tree / files
    ├── ai.rs / ai_agent.rs   LLM document generation
    ├── config.rs        ~/.local/share/.../config.json
    └── trash.rs         soft-delete for project files
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for diagrams and file-level detail.

---

## Frontend conventions

| Area | Location |
|------|----------|
| App shell / tabs | `app/src/App.tsx` |
| Setup (first install) | `app/src/pages/SetupPage.tsx` |
| Settings | `app/src/pages/SettingsPage.tsx` |
| Standards browser | `app/src/pages/StandardsPage.tsx` |
| Workbench (Evidence) | `app/src/pages/EvidencePage.tsx` |
| Tauri API wrappers | `app/src/api.ts` |
| Shared TS types | `app/src/types.ts` |
| Icons | `app/src/components/icons.tsx` |
| Dialogs (no `window.prompt`) | `app/src/components/DialogProvider.tsx` |

**UI language:** English in product UI.

**Branding tokens** (CSS): `brand-navy`, `brand-steel`, `brand-burgundy`, `brand-paper` in `app/src/index.css`.

**Critical Vite setting:** `base: "./"` in `app/vite.config.ts` — required for Tauri production builds. Do **not** change to `'/'`.

---

## Rust / Tauri conventions

- Register new commands in `app/src-tauri/src/lib.rs` → implement in `commands.rs` or domain module.
- Prefer typed structs in `models.rs` with `Serialize`/`Deserialize` for IPC.
- **Download progress:** use `tauri::ipc::Channel<ContentDownloadProgress>` in `download_and_apply_content_update`, not only events (Channel avoids race with `listen()`).
- **Updates / private GitHub:** when user provides token, prefer `api.github.com` over `raw.githubusercontent.com`. See `update.rs`.
- **Manifest URL parsing:** branch names may contain `/` (e.g. `cursor/phase4-auto-update-1b98`) — parser must not use naive `splitn(4, '/')`.
- **Pack not loaded:** if `pack_info.loaded == false`, treat as no installed content (do not rely on `last_content_version` alone).

### Adding a Tauri command

1. Implement fn in appropriate module (or `commands.rs`).
2. Add `#[tauri::command]` wrapper if needed.
3. Register in `lib.rs` `generate_handler![...]`.
4. Add wrapper in `app/src/api.ts`.
5. Add/adjust types in `app/src/types.ts` and `models.rs`.

---

## Content pack & updates

| Asset | Tag / location |
|-------|----------------|
| Content pack zip | GitHub Release `content-YYYY.MM.DD` |
| Update manifest | `updates/manifest.json` on `main` |
| App installers | GitHub Release `app-vX.Y.Z` |

**Default manifest URL (Setup):**

```
https://raw.githubusercontent.com/MoonMaxTea/Accounting-standards-Desktop/main/updates/manifest.json
```

**Private repo / mainland China users:**

- User must set **GitHub token** (Contents: Read-only) in Setup or Settings.
- App uses GitHub API when token present; raw URL often fails (404/blocked).
- Do **not** hardcode proxy URLs unless explicitly requested.

**Verify download logic:**

```bash
cd app/src-tauri
GITHUB_TOKEN=... cargo run --example first_install_download_check
```

---

## Testing checklist

Before claiming work complete:

```bash
pnpm test
cd app/src-tauri && cargo test
```

For UI/download changes, manually verify:

1. First install Setup → Download standards pack → progress bar updates.
2. Settings → Check for updates (with token if repo private).
3. After pack loaded, top nav shows **Workbench** + **Standards**.

---

## Git & release (agents)

- **Default branch:** `main`
- **Feature branches:** `cursor/<descriptive-name>-1b98` (lowercase)
- **Commit messages:** clear English, complete sentences
- **Never commit:** GitHub tokens, API keys, user `config.json`
- **App release:** bump `version` in `app/package.json`, `app/src-tauri/Cargo.toml`, `app/src-tauri/tauri.conf.json`, then:

```bash
git tag -a app-vX.Y.Z -m "..."
git push origin main app-vX.Y.Z
```

CI `release-app.yml` builds NSIS/MSI (Windows) and deb/AppImage (Linux).

**Content pack release:** CI `build-pack.yml` or manual `pnpm pack:build` — separate from app release.

---

## Common pitfalls (read before editing)

| Pitfall | Why |
|---------|-----|
| Absolute Vite `base: '/'` | White screen in Tauri production webview |
| Event-only download progress | Listener registers too late; use IPC Channel |
| Trusting `last_content_version` without `pack.loaded` | Shows "up to date" when pack deleted |
| Parsing raw GitHub URL with 4-part split | Breaks branch names containing `/` |
| Bearer token on raw.githubusercontent.com | Ignored for private repos → use API |
| `window.prompt` / `confirm` | Replaced by `DialogProvider` — keep pattern |
| Wide unrelated diffs | User prefers minimal, focused changes |

---

## User-facing copy

Product owner often communicates in **Chinese**. Keep **UI strings in English** unless explicitly asked to localize. Explain PRs and blockers in plain language when requested.

---

## Related docs

- [docs/DESIGN.md](docs/DESIGN.md) — full design spec
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module map
- [CONTRIBUTING.md](CONTRIBUTING.md) — contributor workflow
- [app/README.md](app/README.md) — app-specific dev notes (partially outdated; prefer this file)

---

## Local app data paths

| OS | Path |
|----|------|
| Linux | `~/.local/share/com.moonmaxtea.accounting-standards-desktop/` |
| Windows | `%APPDATA%\com.moonmaxtea.accounting-standards-desktop\` |
| macOS | `~/Library/Application Support/com.moonmaxtea.accounting-standards-desktop/` |

Contains: `config.json`, `content/` (installed pack), `downloads/`, `trash/`.
