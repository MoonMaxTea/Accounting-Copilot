# Release notes

## app-v0.1.15 (2026-06-24)

**Tag:** [`app-v0.1.15`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.15)

### Summary

Three UX fixes, data-driven multi-category standards navigation (listing rules, tax law), and documentation cleanup.

### Features

- **Multi-category standards navigation:** Data-driven from `standards-registry.yaml` `category` field. Supports Accounting Standards (IFRS/IAS/ASC), Listing Rules (HK, SEC), Tax Law (CN, DE, US, INTL). Navigation engine (`standards-navigation.ts`) dynamically generates filter options from `CategoryMeta`; adding a new category requires YAML + pack rebuild only. Zero UI visual changes.
- **Backward-compatible pack counts:** `countByCategory` (nested `category → framework → count`) replaces `countByFramework`. Old flat-format packs are auto-converted by `convert_counts` in Rust.

### UX fixes

- **Progress bar animation:** Replaced hardcoded `width: "60%"` with dynamic `getProgressPercent(phase, stepIndex)` + CSS `transition-all duration-500` smooth left-to-right animation.
- **Citation excerpt collapse toggle:** Added expand/collapse button for matched excerpt panel in compact mode (EvidenceSidePanel).
- **Conversation log visibility:** Auto-expands both first and latest conversation rounds when multiple rounds exist.

### Docs

- Removed 22 stale files (superseded plans, git temp files, terminal logs).
- Added `docs/plans/completed-work-summary.md` — all shipped feature work in one place.

---

## app-v0.1.14 (2026-06-22)

**Tag:** [`app-v0.1.14`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.14)  
**Merged:** PR #22 (`cursor/continue-follow-up-fix-f12d`)

### Summary

Fixes **Windows Follow-up (Continue) failing before AI** while keeping the **same Agent + tools quality** as Linux 0.1.13. Adds Continue diagnostics, CI hardening, and neutral product copy.

### Fixes

- **Windows Continue pre-AI failure (root cause):** `continue_project_document` used `validated.strip_prefix(&projects_root)` without canonicalizing `projects_root`. On Windows, canonical file paths (e.g. `\\?\D:\…`) often mismatch config strings → Continue returned before `run_standards_agent` → **no new `ai-debug.log` line**. Fixed via `config::relative_project_path` and passing **validated canonical paths** through the Continue chain.
- **Stale error toasts:** `genEpoch` gating in `App.tsx` / `EvidencePage.tsx`; Continue errors include `run_id` and `Continue failed:` prefix.
- **Product copy:** Removed Obsidian wording from runtime UI; wiki-style links use neutral `internalLinkHint`.

### Unchanged (by design)

- **Generate** and **Continue** both use `run_standards_agent` (3 tools, up to 12 rounds). Debug modes: `agent_create` / `agent_continue`.
- No dependency on Obsidian install paths — `projects_dir` is user-chosen in Settings.

### Observability

Continue pre-AI debug phases in `ai-debug.log`:

| phase | Meaning |
|-------|---------|
| `continue_requested` | Invoke reached Rust |
| `continue_failed_before_ai` | Path/config/read/persist error (`error_class`) |
| `continue_enter_ai` | Entering Agent Continue |
| `agent_continue` | Agent loop (same as Linux 0.1.13) |

### CI / dev

- **Windows release job** now runs `pnpm test` + `cargo test` (aligned with Linux).
- New example: `cargo run --example continue_path_check` (path smoke test, no LLM).

### Windows test checklist

1. Generate → log contains `agent_create` + complete.
2. Send follow-up → `continue_requested` → `continue_enter_ai` → `agent_continue`.
3. Wrong API key → clear error; no stale prefix toast from prior run.

---

## app-v0.1.17 (2026-06-24)

**Tag:** [`app-v0.1.17`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.17)

### Summary

ASC amendment citation resolution fix, matched excerpt panel removal, and project audit cleanup.

### Bug fixes

- **ASC citation fix:** `resolve_from_index` now filters out amendment-metadata entries (e.g., "Added by ASU 2016-02") before selecting by `char_start`. Prevents AI from reading amendment records instead of substantive standard text when citing ASC paragraphs.
- **Matched excerpt panel removed:** Redundant `matchedExcerpt` display block removed from `EvidenceStandardPanel`. The standard body is already scrolled to the cited paragraph.

### Refactoring

- Removed dead chat-completion functions (`call_openai` in `ai.rs`, `request_chat_plain` in `ai_agent.rs`) and unused `retrieval.rs` module (~140 lines deleted).
- Removed 8 dead TypeScript exports in `citations.ts`, `standards-navigation.ts`, `i18n.ts`.
- Extracted shared `now_secs()` utility to reduce inline `SystemTime` duplication.

### Security

- Enabled Content Security Policy (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`) — previously `csp: null`.

### Docs

- Version references synced to 0.1.17 across `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md`.

---

## app-v0.1.16 (2026-06-23)

**Tag:** [`app-v0.1.16`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.16)

### Summary

Content pack CDN acceleration with dual-URL racing and unified app update check/download UI.

### Features

- **Dual-URL racing for manifest fetch:** `raw.githubusercontent.com` and `cdn.jsdelivr.net` raced with `futures_util::future::select`. Mainland China users see significantly faster update checks.
- **Pack CDN download:** Pack ZIP downloads also race GitHub API vs direct URL.
- **App version check/download:** Single "Check for updates" button checks both content pack and app versions. Separate download buttons for content and app updates. Settings page shows each independently.
- **Dual-URL app installer download:** App `.exe`/`.deb` downloads race GitHub Release, GitHub API, and jsDelivr CDN.

### Bug fixes

- Fixed `release-app.yml` CI `download-artifact` path nesting — CDN mirror installer copy was broken.

---

## app-v0.1.13 (2026-06-21)

**Tag:** [`app-v0.1.13`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.13)

### Summary

Agent-only document generation; **pipeline mode removed**. Stateless Agent seeding, session files under `sessions/`, `ai-debug.log` observability. See PR #21 and [ARCHITECTURE.md](./ARCHITECTURE.md) changelog (v0.1.13).

### Note

Windows Follow-up could still fail **before AI** on 0.1.13 due to path canonicalization — fixed in **0.1.14**.
