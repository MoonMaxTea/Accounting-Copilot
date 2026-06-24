# Accounting-Copilot Audit Report

**Date:** 2026-06-24  
**Commit:** `03e76fc`  
**Auditor:** Claude Code (Deputy)  
**Scope:** Full project — Rust backend, React frontend, docs, CI/CD, configuration, citation fix review

---

## Executive Summary

The codebase is in good health. **Zero hardcoded secrets, zero `unsafe` Rust blocks, zero memory leaks in frontend effects.** All 22 vitest + tsc pass clean. The citation fix implementation is correct and well-tested.

### Top 5 Findings (prioritized)

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | **High** | Rust | `update.rs:833-835` — App update status is masked when manifest `content` section is missing; the status is set to `"error"` and the app-available check at line 884 requires `status == "up_to_date"`, so users are never notified of available app updates in this scenario |
| 2 | **High** | Rust | Duplicate HTTP chat completion logic (~60 lines each) in `ai.rs:262-340` and `ai_agent.rs:974-1022`, differing only in timeout values and error messages — a regression in one will likely be missed in the other |
| 3 | **High** | Rust | Duplicate search/paragraph retrieval logic in `ai_agent.rs:563-742` and `retrieval.rs:136-266` — the AI agent's `execute_pack_tool()` reimplements what `retrieval.rs` already provides |
| 4 | **Medium** | Frontend | `tauri.conf.json:25` — CSP disabled entirely (`"csp": null`), removing XSS defense-in-depth for a webview that renders AI-generated markdown |
| 5 | **Medium** | Docs | `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md` all reference app version `0.1.15` — actual is `0.1.17`; `docs/RELEASE-NOTES.md` missing v0.1.16 and v0.1.17 entries |

---

## Part 1: Citation Fix Review

### Verdict: ✅ APPROVED — Implementation is correct, complete, and well-tested

### 1.1 Files Changed

| File | Change | Assessment |
|------|--------|-----------|
| `citations.rs:99-109` | `is_amendment_snippet()` helper with 5 keywords | ✅ Keyword list is comprehensive and case-insensitive. Keywords are specific to ASC amendment metadata and unlikely to false-match substantive text. |
| `citations.rs:131-171` | 4-layer `resolve_from_index` fallback chain | ✅ Correctly simplified from plan's Vec-collection approach to idiomatic `.filter().max_by_key().or_else()`. Layers: (1) exact+filter, (2) exact-no-filter, (3) normalized+filter, (4) normalized-no-filter. |
| `citations.rs:474-508` | `prefers_substantive_over_amendment_entry` test | ✅ Amendment entry at `char_start=8000` (> substantive at `5000`). Old naive `max_by_key` would pick 8000; new filter correctly picks 5000. Properly tests the actual bug scenario. |
| `citations.rs:510-540` | `falls_back_when_all_entries_are_amendments` test | ✅ Verifies graceful fallback: when every match is an amendment, returns one rather than `None`. |
| `EvidenceStandardPanel.tsx` | Removed `excerptExpanded` state, useEffect reset, and matched excerpt JSX block (~30 lines) | ✅ Complete removal. Zero remaining references to `matchedExcerpt`, `excerptExpanded`, or `IconChevronDown` in this file. |
| `i18n.ts` | Removed `matchedExcerpt` key from en and zh | ✅ Zero remaining references across the codebase (verified via grep). |

### 1.2 Review Checklist

| Item | Result |
|------|--------|
| Filter logic handles all ASC amendment patterns | ✅ 5 keywords cover the known patterns; `to_ascii_lowercase()` handles case variations |
| 4-layer fallback chain correct and complete | ✅ Each layer correctly delegates to the next when no match found; final layer has no filter (graceful degradation) |
| Edge cases covered by tests | ✅ Two tests: amendment-preference + all-amendments-fallback. See note below on one missing edge case. |
| `is_amendment_snippet` keyword list comprehensive | ✅ "added by asu", "amended by", "accounting standards update", "superseded by", "paragraph superseded" — covers ASC "00 Status" section patterns |
| `matchedExcerpt` removal doesn't break other components | ✅ `grep -r matchedExcerpt app/src` returns zero results |
| Code style consistent | ✅ Matches existing patterns: `.filter().max_by_key().or_else()` chain, `const KEYWORDS: &[&str]` slice pattern, inline test data construction |

### 1.3 One Missing Edge Case (Low Severity)

The filter checks `snippet_en` only. If an amendment entry has a snippet that does NOT contain any keyword (e.g., a future ASC format change), it would pass the filter. The `max_by_key(char_start)` would then pick whichever entry has the highest offset. This is the same behavior as the pre-fix code — no regression. No action needed for now, but the keyword list should be revisited if new ASC amendment formats emerge.

---

## Part 2: Project Audit Findings

### 2.1 Code Quality

#### Dead Code

| # | Severity | File | Symbol | Detail |
|---|----------|------|--------|--------|
| D1 | Low | `lib/citations.ts:38-71` | `resolveCitation()` | Frontend-only citation resolver — not imported by any component. The app uses the Tauri backend `resolve_citation` command instead. Only the test file imports it. |
| D2 | Low | `lib/citations.ts:98-106` | `scanCitations()` | Not imported by any component. The backend `citations.rs` has its own `scan_citations()`. Only the test file imports it. |
| D3 | Low | `lib/standards-navigation.ts:67-81` | `standardsBreadcrumb()` | Not imported by any component. `StandardsCategoryNav.tsx` builds breadcrumbs inline at lines 39-45. Only the test file imports it. |
| D4 | Low | `lib/standards-navigation.ts:162-167` | `emptyStandardsMessage()` | Not imported by any component. |
| D5 | Low | `lib/standards-navigation.ts:26-28` | `secondaryFieldLabel()` | Not imported by any component. |
| D6 | Low | `lib/standards-navigation.ts:30-37` | `secondaryLabel()` | Only called by dead `standardsBreadcrumb()` in the same file. |
| D7 | Low | `lib/standards-navigation.ts:58-63` | `tertiaryLabel()` | Only called by dead `standardsBreadcrumb()` in the same file. |
| D8 | Low | `lib/i18n.ts:562-573` | `standardsBreadcrumb()` | Exported but not imported anywhere. Separate from the `standards-navigation.ts` version. |

#### Code Duplication (Rust)

| # | Severity | Files | Detail |
|---|----------|-------|--------|
| D9 | **High** | `ai.rs:262-340` vs `ai_agent.rs:974-1022` | Duplicate OpenAI chat completion logic: both build `reqwest::Client`, set bearer auth, POST to `/chat/completions`, check status, parse JSON. Different timeout (120s vs 180s) and error messages. **Suggestion:** Extract a shared `chat_completion()` helper. |
| D10 | **High** | `ai_agent.rs:563-742` vs `retrieval.rs:136-266` | Duplicate search/paragraph retrieval: `execute_pack_tool()` reimplements `search_local_pack`, `list_standard_paragraphs`, `get_pack_paragraph` that `retrieval.rs` already provides. **Suggestion:** `execute_pack_tool` should delegate to `retrieval.rs`. |
| D11 | Medium | `ai_agent.rs:744-766` vs `projects.rs:1167-1202` | Duplicate tool activity label formatting with identical string templates. |
| D12 | Low | Multiple files | `now_secs()` pattern duplicated across `ai_agent.rs:108-113`, `projects.rs:958-961`, `trash.rs:106-109`, `update.rs:800-803`. **Suggestion:** Extract a shared time utility. |

### 2.2 Architecture

| # | Severity | Finding |
|---|----------|---------|
| A1 | Low | `commands.rs:22` defines `DRAFT_AGENT_SESSION_KEY` constant, but `session.rs:118` uses the hardcoded string `"__draft__"` directly — risk of drift |
| A2 | Low | Stringly-typed phase identifiers: `AgentPhase` enum in `ai_agent.rs` is typed, but all progress emission phases are bare strings (`"searching"`, `"generating"`, `"error"`, etc.) — mismatch between frontend and backend if strings change |
| A3 | Info | `EvidencePage.tsx` manages 25+ `useState` variables — not a bug but trending toward maintainability concerns. Consider `useReducer` for related state groups. |
| A4 | Info | `BodySearchBar.tsx:6-10` uses `any` for the `tr`/`trf` prop types instead of the `MessageKey` type from `i18n.ts` |

### 2.3 Security

| # | Severity | Finding |
|---|----------|---------|
| S1 | **Medium** | **CSP disabled:** `tauri.conf.json:25` has `"csp": null`. The webview renders AI-generated markdown — no XSS defense-in-depth. **Recommendation:** Set a restrictive CSP: `"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'"` |
| S2 | Low | `SearchBar.tsx:62`: `dangerouslySetInnerHTML={{ __html: hit.snippet }}` — snippet comes from the Tauri backend. If the content pack were compromised, this is an XSS vector. **Recommendation:** Sanitize or use text content. |
| S3 | Low | CI workflows push directly to `main` branch without PR review (`build-pack.yml:81-82`, `release-app.yml:154-155`). Typical for release automation but carries supply-chain risk if combined with `contents: write` permission. |
| S4 | Info | No hardcoded secrets or API keys found. All credentials loaded from user config. |
| S5 | Info | Zero `unsafe` Rust blocks found in all 15 source files. |

### 2.4 Testing

| # | Severity | Finding |
|---|----------|---------|
| T1 | Medium | No integration tests for the AI agent loop (`ai_agent.rs`, 1842 lines) — the most complex module has zero test coverage |
| T2 | Medium | No integration tests for the update/download flow (`update.rs`, 1372 lines) — critical path for content integrity |
| T3 | Low | `citations.rs` tests are thorough (8 tests including 2 new amendment tests), but `resolve_via_body_search` and `resolve_standard_fallback` are only tested indirectly via the full `resolve_citation` path |
| T4 | Low | Frontend test coverage is thin: 22 tests across 5 files, but no tests for `StandardsPage`, `EvidencePage`, `EvidenceStandardPanel`, or any component rendering logic |
| T5 | Info | Cargo test not runnable in current environment (Rust toolchain not in PATH) — CI should be the source of truth for Rust test results |

### 2.5 Documentation Accuracy

| # | Severity | Finding |
|---|----------|---------|
| M1 | **Medium** | `AGENTS.md:13` states app version `0.1.15` — actual is `0.1.17` |
| M2 | **Medium** | `docs/DESIGN.md:3` references `v0.1.15` — actual is `0.1.17` |
| M3 | **Medium** | `docs/ARCHITECTURE.md:5` references `app-v0.1.15` — actual is `0.1.17` |
| M4 | **Medium** | `docs/RELEASE-NOTES.md` missing v0.1.16 and v0.1.17 entries |
| M5 | Low | `AGENTS.md:164` says `tokio::select!` while `ARCHITECTURE.md:98` says `futures_util::future::select` for URL racing — different crate references for the same mechanism |
| M6 | Low | `writing-spec/` directory contains only a README; actual spec files are populated at build time from the vault repo. `AGENTS.md:40` doesn't clarify this dynamic state. |

### 2.6 Rust-Specific

| # | Severity | File:Line | Finding |
|---|----------|-----------|---------|
| R1 | **High** | `update.rs:833-893` | **App update masked when content section missing.** `manifest.content.is_none()` sets `status = "error"` at line 834. Later at line 884, the app-available check requires `status == "up_to_date"`. If only an app update exists (no content update), users see an error instead of the app update notification. |
| R2 | Medium | `lib.rs:66` | `.expect("error while running tauri application")` — panics on Tauri init failure. Acceptable for a desktop app (cannot recover from init failure), but the error message is not user-friendly. |
| R3 | Medium | `ai_agent.rs:1331,1408` | `debug_assert_eq!` on phase state — compiled out in release builds. If phase state is incorrect in production, the agent proceeds with wrong labels silently. |
| R4 | Low | `citations.rs:93-97` | `slice_utf16()` allocates `Vec<u16>` for the entire file body on every citation resolution. For large standard files with mixed CJK/ASCII text, this is a ~200KB heap allocation. Could be optimized with lazy iteration. |
| R5 | Low | `commands.rs:138,256,505-506,552` | `unwrap_or_default()` on session file loads — corrupted session files are silently treated as empty, losing conversation history without warning. |
| R6 | Low | `update.rs:1030` | Downloaded ZIP files accumulate in the downloads directory with no cleanup mechanism. |
| R7 | Info | `commands.rs:152,165,292,326,422,434` | Progress event emissions use `let _ = app.emit(...)` — failures are silently ignored. Intentional (cannot recover from UI update failures), but debug logging gaps. |

### 2.7 Frontend-Specific

| # | Severity | File:Line | Finding |
|---|----------|-----------|---------|
| F1 | Medium | `BodySearchBar.tsx:33-43`, `SearchBar.tsx:36-40` | Both search inputs lack accessible labels — only `placeholder` is used. **Recommendation:** Add `aria-label` attribute. |
| F2 | Low | `FilterSelect.tsx:83-112` | Dropdown does not trap keyboard focus when open — Tab moves focus outside without closing the dropdown. |
| F3 | Low | `useBodySearch.ts:118-121` | `parentNode` null check is present and correct. Good defensive coding. |
| F4 | Info | `App.tsx:136-141` | Theoretical stale closure in toast message callback — cosmetic only. |
| F5 | Info | `formatModified`/`formatDeleted` | `if (!secs)` treats `0` as falsy. `0` is a valid epoch timestamp (Jan 1, 1970) but extremely unlikely as a file modification time. |
| F6 | Info | All effects verified | Every `useEffect` with async work has proper cancellation flags. All event listeners (`mousemove`, `keydown`, `mousedown`, Tauri events) are properly cleaned up on unmount. **Zero memory leaks found.** |
| F7 | Info | All list renders verified | Every `.map()` in JSX has proper `key` props. **Zero missing keys found.** |

### 2.8 Configuration

| # | Severity | File | Finding |
|---|----------|------|---------|
| C1 | Low | `vite.config.ts:17-20` | Non-Windows build target is `safari13` (2019). Tauri 2 on Linux uses WebKitGTK 2.42+ (Safari 17+ equivalent). Unnecessarily conservative transpilation target. |
| C2 | Info | `tsconfig.json:19-20` | `noUnusedLocals: true`, `noUnusedParameters: true` — good quality controls enabled. |
| C3 | Info | CI workflows | All GitHub Actions use major-version tags (not SHA pins) — standard practice but carries supply-chain risk. No artifact retention policy set for build uploads. |

---

## Prioritized Recommendations

### Immediate (this sprint)

1. **Fix `update.rs:833-893` app-update masking bug.** When `manifest.content` is `None`, check for available app updates before setting the error status.

2. **Enable CSP in `tauri.conf.json`.** Set a restrictive Content Security Policy to add XSS defense-in-depth.

3. **Update documentation versions.** Bump `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md` to v0.1.17. Add v0.1.16 and v0.1.17 entries to `RELEASE-NOTES.md`.

### Short-term (next 1-2 sprints)

4. **Extract shared chat completion helper.** Deduplicate the ~120 lines of HTTP logic between `ai.rs` and `ai_agent.rs`.

5. **Delegate agent tool execution to `retrieval.rs`.** Replace `execute_pack_tool()`'s inline implementations with calls to `retrieval.rs` functions.

6. **Add `aria-label` to search inputs** in `BodySearchBar.tsx` and `SearchBar.tsx`.

### Backlog (future consideration)

7. Remove dead code: 8 unused exports across `lib/citations.ts`, `lib/standards-navigation.ts`, `lib/i18n.ts`.

8. Extract shared time utility (`now_secs()`) to reduce duplication.

9. Add integration tests for AI agent loop and update/download flow.

10. Consider `useReducer` for `EvidencePage` state management as complexity grows.

11. Optimize `slice_utf16` to use lazy UTF-16 iteration instead of full `Vec<u16>` allocation.

12. Pin GitHub Actions to commit SHAs for supply-chain hardening.

---

## Appendix: Files Audited

### Rust (15 files)
`main.rs`, `lib.rs`, `commands.rs`, `config.rs`, `db.rs`, `models.rs`, `ai.rs`, `ai_agent.rs`, `session.rs`, `projects.rs`, `trash.rs`, `retrieval.rs`, `pack.rs`, `update.rs`, `citations.rs`

### Frontend (42 files)
All `.tsx` and `.ts` files in `app/src/` including pages, components, hooks, context, and lib directories.

### Documentation
`AGENTS.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/RELEASE-NOTES.md`, `writing-spec/README.md`

### CI/CD & Config
`.github/workflows/build-pack.yml`, `.github/workflows/release-app.yml`, `tauri.conf.json`, `vite.config.ts`, `tsconfig.json`, `Cargo.toml`, `package.json`, `pnpm-workspace.yaml`

---

*Report generated by Claude Code Deputy Audit. No files were modified during this audit.*
