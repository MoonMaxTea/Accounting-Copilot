# AGENTS.md — Accounting Copilot

Guide for AI coding agents working in this repository. Read this before making changes.

## Product snapshot

| Item | Value |
|------|--------|
| **Product name** | Accounting Copilot |
| **Repo** | `MoonMaxTea/Accounting-Copilot` (often **private**) |
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

**Simulate first install:** delete `~/.local/share/com.moonmaxtea.accounting-copilot/content/` and clear `update.last_content_version` in `config.json`.

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
| In-document search | `app/src/hooks/useBodySearch.ts` + `app/src/components/BodySearchBar.tsx` |
| Mermaid diagrams | `app/src/components/MermaidBlock.tsx` (lazy-loaded) |
| Brand mark | `app/src/components/Wordmark.tsx` (exported `BrandMark`) |

**UI language:** English in product UI.

**Branding tokens** (CSS): `brand-navy`, `brand-steel`, `brand-burgundy`, `brand-paper` in `app/src/index.css`.

**Critical Vite setting:** `base: "./"` in `app/vite.config.ts` — required for Tauri production builds. Do **not** change to `'/'`.

**Logo:** `Wordmark.tsx` exports `BrandMark` — a navy (#1B2838) rounded-rect SVG with white "AC" lettering. Used in TitleBar and as Windows taskbar icon (generated via `scripts/generate-icons.mjs`).

---

## Rust / Tauri conventions

- Register new commands in `app/src-tauri/src/lib.rs` → implement in `commands.rs` or domain module.
- Prefer typed structs in `models.rs` with `Serialize`/`Deserialize` for IPC.
- **Download progress:** use `tauri::ipc::Channel<ContentDownloadProgress>` in `download_and_apply_content_update`, not only events (Channel avoids race with `listen()`).
- **AI generation progress:** use `app_handle.emit("ai-generation-progress", ...)` in agent loop; frontend listens via `listen()` from `@tauri-apps/api/event` at App level (survives page switches).
- **Updates / private GitHub:** when user provides token, prefer `api.github.com` over `raw.githubusercontent.com`. See `update.rs`.
- **Manifest URL parsing:** branch names may contain `/` (e.g. `cursor/phase4-auto-update-1b98`) — parser must not use naive `splitn(4, '/')`.
- **Pack not loaded:** if `pack_info.loaded == false`, treat as no installed content (do not rely on `last_content_version` alone).
- **Path canonicalization:** `file_entry_from_path` must canonicalize BOTH `projects_root` and `path` before `strip_prefix` — non-canonicalized Windows paths mismatch canoniclized ones from `validate_project_path`.
- **Config serialization:** `AiConfig.api_key` and `UpdateConfig.access_token` are stored via `keyring` crate (OS credential manager), never in `config.json`. The placeholder `"********"` signals "key exists" without revealing value.

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

**Default manifest URLs (dual-CDN racing):**

Primary:
```
https://raw.githubusercontent.com/MoonMaxTea/Accounting-Copilot/main/updates/manifest.json
```

Alt (jsDelivr CDN — faster from mainland China):
```
https://cdn.jsdelivr.net/gh/MoonMaxTea/Accounting-Copilot@main/updates/manifest.json
```

Both URLs are raced simultaneously (`tokio::select!`); the fastest successful response wins.

**Private repo / mainland China users:**

- User must set **GitHub token** (Contents: Read-only) in Setup or Settings.
- App uses GitHub API when token present; raw URL often fails (404/blocked).
- **Pack downloads** also race GitHub API (`api.github.com`) vs direct URL for optimal speed.
- `pack_url_alt` field in manifest supports future CDN mirrors.
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

## AI subsystem

### Agent tools (3)

| Tool | Purpose | Key detail |
|------|---------|------------|
| `search_local_pack` | FTS5 + registry fallback | `standard_id` is UNINDEXED in FTS5 → registry.json fallback for ID searches |
| `get_pack_paragraph` | Citation → extended snippet (4000 chars from file body) | Uses `resolve_citation` → `resolve_from_index` (exact-match first, `max_by_key(char_start)` to skip amendment-metadata entries). Error msg guides AI to use `list_standard_paragraphs` |
| `list_standard_paragraphs` | List all indexed paragraphs for a standard | Reads `paragraphs.json` each call; dedup prefers highest `char_start` (substantive entry) |

### Architecture (merged — single Agent mode)

- `ai_agent.rs`: Self-contained system prompt + agent loop. `build_agent_system_prompt` loads writing spec directly (no longer calls `build_system_prompt` from ai.rs)
- `ai.rs`: Post-processing only (validation, pack quote injection, project save). Old dead code (`build_system_prompt`, `build_user_prompt`, `build_user_prompt_with_pack`, `build_continue_user_prompt`, `collect_relevant_pack_snippets`) removed on 2026-06-21
- Single flow: Agent searches → reads full 4000 chars per paragraph → outputs 2-4 key English sentences + Chinese refinement tables

### System prompt (agent mode)

- Built by `build_agent_system_prompt` (ai_agent.rs) — self-contained, loads writing spec from content pack
- Writing spec files (`writing-spec/`) loaded from content pack, included in prompt
- Agent runs max 12 tool rounds (`MAX_TOOL_ROUNDS`), then forced synthesis

### Generation lifecycle

1. Frontend calls `generateProjectDocument` / `continueProjectDocument`
2. Agent loop emits `ai-generation-progress` events: `searching` → `generating` → `complete` / `error`
3. App.tsx listens globally → passes progress/result to WorkbenchPage (survives tab switches)
4. `finalize_project_markdown`: parse → inject_pack_quotes → ensure_frontmatter → strip_trailing_log_section → append_log_for_turn → sanitize_banned_phrases → append_ai_disclaimer → save
5. AI disclaimer auto-added at end: "本文档由 AI 辅助生成...需人工进行专业复核。"

### DeepSeek "prefix not found" handling

DeepSeek API may return "prefix not found" when conversation history triggers its beta prefix-completion path. `call_chat_with_tools` auto-detects this error and retries without prior tool-call messages (keeping system prompt + current user turn). The existing markdown in `build_user_turn` (Continue mode) still provides full document context.

### Banned output phrases

`sanitize_banned_phrases` scans for and replaces: `"知识库暂无该准则"`, `"暂无该段落"`, `"知识库暂无"`. Replacement: "当前本地准则库版本中未收录该段落，建议查阅官网原文确认。"

### PROJECT_NAME fallback

If AI response lacks `<<<PROJECT_NAME>>>` block, `parse_ai_response` falls back to:
1. First `# Title` in the markdown block
2. First 12 chars of user's question (last resort)

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
| Hardcoding framework names in regex | Framework-agnostic retrieval is now handled by the Agent's `search_local_pack` tool (FTS5 + registry fallback) |
| Mermaid `securityLevel: "sandbox"` | Breaks `<br>` tags in node labels; use `"loose"` with `suppressErrorRendering: true` |
| DeepSeek "prefix not found" on follow-up | API may reject tool-call history; `call_chat_with_tools` auto-retries without prior messages |
| Using `find()` to resolve paragraph index entries | ASC codification files have an amendment-metadata table ("00 Status") at the top that repeats every paragraph number — earliest char_start entries contain boilerplate ("Amended … Accounting Standards Update"), not substantive text. Use `max_by_key(char_start)` to pick the latest occurrence, and **always try exact paragraph match before falling back to normalized matching** (ASC `paragraph_normalized` is just the topic number "718", matching every entry in the standard) |
| `dedup_by` keeping the first entry after paragraph-sort | The paragraph index is sorted by char_start; after sorting by paragraph ID, entries with the same paragraph are in char_start order. `dedup_by` keeps the first (lowest char_start = amendment metadata). Sort by `(paragraph, char_start DESC)` before dedup |
| `paragraph_normalized` loose matching | `normalizeParagraph("718-10-35-3")` → `"718"` — matches every entry in ASC 718. Always gate with exact paragraph match first; only fall back to normalized when no exact match exists |
| Using `deepseek-v4-flash` for document generation | Flash models have weak instruction-following; ignore blockquote-length limits and paste raw English. Use `deepseek-v4-pro` or `deepseek-chat` for the Agent generation flow. The system prompt (verified via `_diag_system_prompt.txt` dump) is correct — the model simply doesn't obey complex output constraints |

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
| Linux | `~/.local/share/com.moonmaxtea.accounting-copilot/` |
| Windows | `%APPDATA%\com.moonmaxtea.accounting-copilot\` |
| macOS | `~/Library/Application Support/com.moonmaxtea.accounting-copilot/` |

Contains: `config.json`, `content/` (installed pack), `downloads/`, `trash/`.

---

## Cursor Cloud specific instructions

Durable notes for cloud agents working on this repo. The startup update script runs `pnpm install`; everything below is context that is **not** covered by that.

### Environment (already provisioned in the VM snapshot)

- **Toolchain:** Node 22, pnpm 9.15, Rust stable are preinstalled.
- **Tauri Linux GUI system libs** (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `pkg-config`) are preinstalled. Source of truth for the list is `.github/workflows/release-app.yml` (`build-linux` job). If the GUI fails to compile/link, reinstall these via `apt`.
- **A display is available at `DISPLAY=:1`** — required for `pnpm app:dev` to open the Tauri window.

### Running the app

- Use `pnpm app:dev` (from repo root). Tauri's `beforeDevCommand` auto-starts Vite on `:1420` (strictPort) and compiles/launches the Rust backend — **do not run `vite` separately**.
- First Rust compile is slow (~25s+ from a warm cargo cache, much longer cold); subsequent rebuilds are fast.
- The desktop has an **idle screensaver (black screen with a spinning 3D cube)** that activates after a few seconds of no input. This is NOT an app crash — the app process keeps running. Move the mouse / click to dismiss it, and keep interactions continuous when recording demos.

### Testing the standards browser / workbench WITHOUT a GitHub token

The app ships no content; normally it downloads a pack from the **private** GitHub repo (needs a fine-grained token with Contents: Read-only, set in Setup/Settings). To exercise the offline Standards browser end-to-end without any secret, build a pack from the in-repo fixtures and import it directly:

```bash
# Build a small valid pack from test fixtures (IFRS 11 + IAS 31)
pnpm --filter @asd/pack-builder build
node tools/pack-builder/dist/cli.js \
  --vault "tools/pack-builder/tests/fixtures/vault" \
  --registry "tools/pack-builder/tests/fixtures/registry-minimal.yaml" \
  --output /tmp/demo-pack.zip --content-version 2026.06.21

# Import it into the app data dir, then (re)start the app
cd app/src-tauri && cargo run -q --example import_content_pack -- /tmp/demo-pack.zip
```

After import, restart `pnpm app:dev` (pack info is read at startup) → the top nav shows **Standards** + **Workbench**, and the standards list/body/in-document search work fully offline.

- **Lint/type-check:** there is no ESLint; the gate is `tsc --noEmit`, which runs as part of `pnpm test`.
