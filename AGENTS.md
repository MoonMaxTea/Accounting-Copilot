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
    ├── ai.rs / ai_agent.rs   LLM document generation (agent-only)
    ├── session.rs       AI session files (outside config.json)
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

Agent-only document generation for **both Generate and Continue**: `ai.rs` calls `ai_agent::run_standards_agent` (same Agent + 3 tools path as Linux 0.1.13).

| Operation | Rust entry | AI path | Debug `mode` |
|-----------|------------|---------|--------------|
| **Generate** | `generate_and_save_project` | `run_standards_agent` Create | `agent_create` |
| **Continue / Follow-up** | `continue_and_update_project` | `run_standards_agent` Continue | `agent_continue` |

### Agent tools (3)

| Tool | Purpose | Key detail |
|------|---------|------------|
| `search_local_pack` | FTS5 + registry fallback | `standard_id` is UNINDEXED in FTS5 → registry.json fallback for ID searches |
| `get_pack_paragraph` | Citation → extended snippet (4000 chars from file body) | Uses `resolve_citation` → `resolve_from_index` (exact-match first, `max_by_key(char_start)` to skip amendment-metadata entries). Error msg guides AI to use `list_standard_paragraphs` |
| `list_standard_paragraphs` | List all indexed paragraphs for a standard | Reads `paragraphs.json` each call; dedup prefers highest `char_start` (substantive entry) |

### Architecture

- **`ai_agent.rs`:** Self-contained system prompt + agent loop (Generate **and** Continue). `build_agent_system_prompt` = `build_core_writing_prompt` + tool workflow. Provider error classification, recovery retries, storm guard, synthesis fallback. `append_ai_debug_event`, `log_continue_pre_ai`.
- **`ai.rs`:** Post-processing (**pack quote capping** ≤ 600 chars), project save. Calls `run_standards_agent` for create/continue.
- **`session.rs`:** Persists AI sessions under `sessions/<sha256(key)>.json` (migrated from `config.json` on `get_config`).
- **`config.rs`:** `relative_project_path` — canonical-root `strip_prefix` (fixes Windows Continue pre-AI failure).

### Cross-turn API shape (stateless)

Each run seeds the API with **`[system, current user_turn]` only** via `seed_agent_turn`. Prior turns are stripped of `tool` rows / `tool_calls` before persistence. Continue mode embeds the **full normalized `.md`** in the user turn; the current turn re-runs pack tools live.

### Windows Continue failure (0.1.13 root cause)

Same binary as Linux. **Generate worked; Continue often produced no `ai-debug.log` line** because 0.1.13 did:

```rust
validated.strip_prefix(&projects_root)  // projects_root NOT canonicalized
```

On Windows, `validated` is often `\\?\D:\…` while `projects_root` from config is `D:\…` → `strip_prefix` fails **before** `run_standards_agent`. Linux paths usually matched by luck. **Fix:** `config::relative_project_path` canonicalizes the root; pass **validated** path through the Continue chain.

### Session storage

| Path | Content |
|------|---------|
| `sessions/<sha256(relative_path)>.json` | `StoredAiSession`: user/assistant text messages + `activity` log (tool steps for UI) |
| Legacy | `config.json` `ai_agent_sessions` / `ai_threads` migrated on first `get_config` |

### Debug log (`ai-debug.log`)

- Location: app data dir (`~/.local/share/com.moonmaxtea.accounting-copilot/` on Linux)
- Written by `append_ai_debug_event` — **metadata only** (mode, phase, provider, model, status, char counts, tool name, error class, **platform**, **run_id**, **detail**)
- **Never** logs API keys, full prompts, or tool result bodies

**Continue troubleshooting phases** (written before AI if needed):

| phase | When |
|-------|------|
| `continue_requested` | `continue_project_document` entry (always) |
| `continue_failed_before_ai` | path validate / read / config / persist failure (`error_class` set) |
| `continue_enter_ai` | Passed pre-checks, entering `run_standards_agent` |
| `agent_continue` start/complete/error | Inside Agent Continue (same as Linux 0.1.13) |

If Send follow-up produces **no new log line**, failure is before Rust (`continue_requested` missing → frontend/invoke issue). If `continue_requested` but no `agent_continue`, check `error_class`: `relative_path` = canonical path bug.

### System prompt

- Built by `build_agent_system_prompt` (ai_agent.rs) — loads writing spec from content pack
- Agent runs max 12 tool rounds (`MAX_TOOL_ROUNDS`), then forced synthesis (`tool_choice: "none"`)

### Generation lifecycle

1. Frontend calls `generateProjectDocument` / `continueProjectDocument`
2. Continue command logs `continue_requested` immediately; **`relative_project_path` + validated path**
3. Progress events emit `ai-generation-progress` with `run_id` (Continue errors prefixed `Continue failed:` in UI)
4. App.tsx listens globally → `genEpoch` gating prevents stale error toasts
5. `finalize_project_markdown`: parse → inject_pack_quotes (**caps** over-long quotes) → … → save
6. AI disclaimer auto-added at end

### Follow-up DeepSeek prefix error — structural fix (primary)

Follow-ups seed the agent with the prior saved session. **Do not replay the
prior turn's tool plumbing.** `run_standards_agent` runs the seed through
`strip_tool_history`, which drops `tool` rows and strips assistant `tool_calls`
while keeping prior user/assistant **text** turns. Continue embeds the full
document; the current turn re-runs pack tools live.

### Error recovery (prefix / context overflow) — safety net

All chat calls also go through `chat_completion_with_recovery` (ai_agent.rs). The
full history is tried first; it retries **once** with tool history stripped only
when the request would otherwise hard-fail (`is_prefix_not_found_error` or
`is_context_length_error` for 413 / `context_length_exceeded`). With the
structural fix above this rarely triggers, but it remains as defense-in-depth.
Provider HTTP errors are mapped to clear Chinese messages by
`classify_provider_error` while preserving the raw status+body for detection.

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
| Continue passes raw `file_path` instead of validated canonical path | Windows `strip_prefix` / read failures before AI; no `agent_continue` log |
| `validated.strip_prefix(&projects_root)` without canonical root | **0.1.13 Windows bug** — use `relative_project_path` |
| Ignoring `continue_requested` in ai-debug.log | If missing on Send follow-up, invoke never reached Rust |
| DeepSeek "prefix not found" on follow-up | **Do not replay tool history.** `seed_agent_turn` + `strip_tool_history`; Continue embeds full document. `chat_completion_with_recovery` retries once as safety net. |
| Expanding quotes in `inject_pack_quotes` | It must **cap** (≤ 600 chars), never paste the 4 000-char `snippet_en` into the note — expanding overrides the prompt's ≤4-sentence rule and bloats follow-up context |
| Byte-slicing `char_start` | `char_start` is a JS **UTF-16** offset; slice via `slice_utf16` (citations.rs), never `body[start..end]` by bytes — byte slicing mis-aligns on non-ASCII packs and can panic |
| Using `find()` to resolve paragraph index entries | ASC codification files have an amendment-metadata table ("00 Status") at the top that repeats every paragraph number — earliest char_start entries contain boilerplate ("Amended … Accounting Standards Update"), not substantive text. Use `max_by_key(char_start)` to pick the latest occurrence, and **always try exact paragraph match before falling back to normalized matching** (ASC `paragraph_normalized` is just the topic number "718", matching every entry in the standard) |
| `dedup_by` keeping the first entry after paragraph-sort | The paragraph index is sorted by char_start; after sorting by paragraph ID, entries with the same paragraph are in char_start order. `dedup_by` keeps the first (lowest char_start = amendment metadata). Sort by `(paragraph, char_start DESC)` before dedup |
| `paragraph_normalized` loose matching | `normalizeParagraph("718-10-35-3")` → `"718"` — matches every entry in ASC 718. Always gate with exact paragraph match first; only fall back to normalized when no exact match exists |
| Using `deepseek-v4-flash` for document generation | Flash models have weaker instruction-following. NOTE: the 2026-06-21 audit found the *primary* cause of multi-thousand-char English dumps was `inject_pack_quotes` expanding quotes (a code bug, now fixed), **not** the model. Stronger models (`deepseek-v4-pro` / `deepseek-chat`) are still preferred for adherence, but the deterministic cap now enforces quote length regardless of model |

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

Contains: `config.json`, `content/` (installed pack), `downloads/`, `trash/`, `sessions/` (AI conversation state), `ai-debug.log` (redacted AI run metadata).
