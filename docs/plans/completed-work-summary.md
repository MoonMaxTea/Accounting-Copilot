# Completed Work Summary

> All items below are shipped. Original plan/spec documents deleted as stale.

## AI Pipeline Optimization (v0.1.19)

12 improvements across performance, prompt quality, tool guidance, and paragraph resolution. See [RELEASE-NOTES.md](../RELEASE-NOTES.md#app-v0119-2026-06-26) for full details.

- **P0-1:** Paragraph cache — `load_paragraphs` once per agent run via `Arc`
- **P0-2:** Synthesis context trim — `trim_synthesis_messages` before final call
- **P2-3:** Agent metrics — `tool_rounds`, `tools_called`, `synthesis_triggered`, `early_stop` in `ai-debug.log`
- **P3-1/P3-2:** Improved paragraph sampling + enhanced `get_pack_paragraph` error with format hint
- **P1-9:** Continue mode — 8 precise rules for document updates
- **P1-10:** Tool usage — ordered 6-step workflow in system prompt
- **P1-3/P3-4/P1-7/P1-8/P2-4:** Prompt overhaul — compressed persona, Chinese writing standard, few-shot example, mandatory chapter structure
- **IFRS new format:** Bold-number paragraph lookup (`**N.**`), appendix paragraph regex (`B1`, `C20BA`), 3 new tests

## UX Fixes (v0.1.14 → v0.1.15, commit `e72bd8a`)

1. **Progress bar animation** — Replaced hardcoded `width: "60%"` with dynamic width computed from `phase` + `stepIndex`, smooth CSS transition (`transition-all duration-500`)
2. **Citation excerpt collapse toggle** — Added expand/collapse button for matched excerpt panel in compact mode (EvidenceSidePanel)
3. **Conversation log visibility** — Auto-expand first + latest conversation round when multiple rounds exist

## Multi-Category Standards Navigation (v0.1.15, commit `16ebc4f`)

Data-driven navigation engine supporting arbitrary content categories. Zero UI visual changes.

- **Pack builder** — `countByFramework` → `countByCategory` (nested), `category` field in registry entries
- **Backend** — `CategoryMeta` / `CategoryCounts` models, backward-compatible `convert_counts` for old packs
- **Frontend** — `standards-navigation.ts` fully data-driven from `CategoryMeta`, `FrameworkFilter` expanded to `string`

## AI Agent Rewrite (v0.1.13)

Pipeline-based generation plan was superseded. Current architecture: Agent-only with 3 tools (`search_local_pack`, `get_pack_paragraph`, `list_standard_paragraphs`). Continue mode uses `strip_tool_history` + stateless seed.

## Desktop App Phases 0–4 (v0.1.14)

All initial development phases shipped:
- Phase 0: Content pack builder
- Phase 1: Tauri browser shell
- Phase 2: Evidence split-pane workbench
- Phase 3: AI writer (Agent mode, not original pipeline)
- Phase 4: Auto-update via GitHub Releases
