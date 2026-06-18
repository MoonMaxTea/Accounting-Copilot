# Phase 2: Evidence Split View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split-pane Evidence view linking project notes to local standard paragraphs with click-to-highlight navigation.

**Architecture:** React split layout; Rust commands for project file tree + citation resolver shared with paragraph index.

**Prerequisite:** Phase 1 complete.

---

## Key Tasks Summary

### Task 1: Citation Parser (TypeScript + Vitest)

- [ ] Tests for `IFRS 11 §7–8`, `IAS 28 §16`, `ASC 740-10-25-5`
- [ ] `parseCitation(text): CitationRef | null`
- [ ] `resolveCitation(ref, paragraphsIndex): CitationTarget | null`

### Task 2: Project Directory Config

- [ ] Settings: folder picker for `projects_dir`
- [ ] Persist in `config.json` via Tauri

### Task 3: Project File Tree

- [ ] `list_project_files(projects_dir)` — recursive .md
- [ ] Sidebar tree component

### Task 4: Split Pane UI

- [ ] Left: selected project note (Markdown render)
- [ ] Right: standard detail with scroll-to-highlight
- [ ] Click citation in left → load right panel

### Task 5: Unresolved Citation Warnings

- [ ] Scan note for citation patterns
- [ ] Yellow banner for unresolved refs

---

## Phase 2 Done Checklist

- [ ] projects_dir configurable
- [ ] File tree shows project notes
- [ ] Split pane works
- [ ] Citation click highlights paragraph
- [ ] Unresolved citations warned

---

## Next Phase

[2026-06-18-phase3-ai-writer.md](./2026-06-18-phase3-ai-writer.md)
