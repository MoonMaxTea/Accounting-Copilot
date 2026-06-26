# Release notes

## app-v0.1.20 (2026-06-26)

**Tag:** [`app-v0.1.20`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.20)

### Summary

AI pipeline optimization (Round 2) — expanded chapter structure, quantitative few-shot example, refined tool stop rule, and `standards` field constraint. No UI changes.

### Prompt refinement

- **Chapter expansion:** Added `D-计算演示` (mandatory quantitative chapter with full worked example) and `E-附注模板` (optional disclosure template). `B-实务决策` expanded with "准则更新" and "实务陷阱" sub-sections.
- **Few-shot swap:** Qualitative IFRS 16 lease identification example replaced with complete ASC 260 EPS calculation example covering all mandatory chapters including numerical walkthrough and footnotes template.
- **`standards` constraint:** Frontmatter `standards` limited to ≤3 primary standards; auxiliary standards from incidental tool results must not be listed.
- **Tool stop rule:** Rule 5 now requires both (a) sufficient paragraphs retrieved *and* (b) content converted to concrete output (calculation flow or specific rationale) — not just text lookup.
- **Prompt compression:** Chinese writing quality examples compressed from 2 long paragraphs to a concise Do/Don't pair (~120 chars saved).

### Documentation

- `RELEASE-NOTES.md`, `AGENTS.md`, `completed-work-summary.md` updated with prompt v2 refinement details.

---

## app-v0.1.19 (2026-06-26)

**Tag:** [`app-v0.1.19`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.19)

### Summary

AI pipeline optimization — 12 improvements across performance, prompt quality, tool guidance, and paragraph resolution. No UI changes.

### Performance

- **P0-1: Paragraph cache** — `load_paragraphs` once per agent run via `Arc<Vec<ParagraphRecord>>`, passed to `execute_pack_tool` instead of re-reading disk per tool call.
- **P0-2: Synthesis context trim** — `trim_synthesis_messages` drops empty/nudge tool blocks before the final synthesis call to reduce context bloat.

### Prompt overhaul

- **Compressed persona:** 20-line partner persona condensed to 3 lines of core actionable value.
- **Chinese writing quality standard:** Concrete do/don't examples; demands subject+judgment per sentence, specific paragraph numbers, no vague hedging.
- **Few-shot example:** Full reference output structure (`<<<PROJECT_NAME>>>` / `<<<MARKDOWN>>>`) demonstrating mandatory chapter structure.
- **Mandatory chapter template:** YAML frontmatter → TL;DR → A-准则分析 → B-实务决策 → C-结论 → 日志. Chapter titles must match exactly.

### Tool guidance

- **P1-10: Precise tool workflow** — 6-step ordered workflow in system prompt; forbids common mistakes (guessing paragraphs, endless search without reading).
- **P3-2: Enhanced `get_pack_paragraph` error** — `paragraph_format_hint` provides correct citation format sample when lookup fails.

### Continue mode

- **P1-9: 8 precise rules** — Topic-switch detection, chapter preservation, new subsection insertion, deep-dive vs. correction handling, term clarification shortcut.

### Citation resolution (IFRS new format)

- **Bold-number paragraph lookup:** `find_paragraph_in_body` now matches `**N.**` / `**B1.**` / `**C20BA.**` headings (new IFRS format) before falling back to TOC and `Paragraph §` patterns.
- **IFRS/IAS regex extended:** `parse_citation` and `scan_citations` now capture appendix paragraphs (e.g., `IFRS 16 §B1`, `§C20BA`, `§46A`).
- **3 new tests:** `resolves_new_format_ifrs_via_bold_number_body_search`, `parses_ifrs_appendix_paragraphs`, `scans_appendix_citations`.

### Observability

- **P2-3: Agent metrics** — `AiDebugEvent` now records `tool_rounds`, `tools_called`, `synthesis_triggered`, `early_stop` in `ai-debug.log`.

---

## app-v0.1.18 (2026-06-24)

**Tag:** [`app-v0.1.18`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.18)

### Summary

Design system overhaul (single AppBar, Settings layout, responsive workbench/standards) and release CDN mirror CI fix.

### UI / UX

- **Scheme A AppBar:** Merged title bar and main navigation into one 40px row; Settings is a first-class tab with `aria-current`.
- **Design tokens:** Unified primary button (`brand-navy`), radius scale, success banner tokens, citation link colors with dark-mode support.
- **Settings:** Left-nav layout on desktop (Updates / Projects / AI); version metadata moved to footer.
- **Standards:** List selection uses left accent bar instead of full accent fill; mobile list/detail panes below 1024px.
- **Workbench:** Narrow-screen segment control (Files / Note / Panel); fixed-width side panel on desktop.

### Accessibility

- Dialog: Escape to close, initial focus, `aria-labelledby`.
- SearchBar: combobox keyboard navigation (arrow keys, Enter, Escape).
- Toast: `aria-live` announcements.

### CI

- **CDN mirror:** Fix `upload-artifact` path handling and `git push origin HEAD:main` on tag-triggered releases.

---

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
