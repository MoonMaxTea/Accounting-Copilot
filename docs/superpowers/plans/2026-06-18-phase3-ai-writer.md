# Phase 3: AI Document Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate project Markdown documents via OpenAI API constrained to pack paragraph index and writing-spec rules, with post-generation citation validation.

**Architecture:** Rust Tauri command calls OpenAI HTTP API (keeps API key in Rust side); React shows streaming preview + validation report.

**Prerequisite:** Phase 2 complete.

---

## Key Tasks Summary

### Task 1: AI Config & Key Storage

- [ ] Settings page: API key input (stored local only)
- [ ] `config.ai.provider`, `config.ai.model`, `allow_legacy_citations`

### Task 2: System Prompt Builder

- [ ] Load `writing-spec/项目编写说明.md` + `SKILL.md` from pack
- [ ] Inject allowed paragraph IDs from `paragraphs.json` (filter by status)

### Task 3: OpenAI Streaming Command

- [ ] `generate_document(prompt, facts?)` → stream tokens to frontend
- [ ] Use `reqwest` in Rust with SSE parsing

### Task 4: Citation Validator

- [ ] Extract citations from generated Markdown
- [ ] Cross-check against paragraphs.json
- [ ] Report: valid / missing / legacy-blocked

### Task 5: Save to Project

- [ ] User confirms → write to `projects_dir/{slug}.md`
- [ ] Optional: update `项目索引.md` if exists

---

## Phase 3 Done Checklist

- [ ] AI generates Markdown following writing-spec
- [ ] Citations validated against pack
- [ ] Legacy citations blocked by default
- [ ] Save to project directory works

---

## Next Phase

[2026-06-18-phase4-auto-update.md](./2026-06-18-phase4-auto-update.md)
