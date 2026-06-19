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

**Goal:** 「项目」页：历史列表（最近修改 + 搜索）+ AI 生成项目笔记，自动命名并直接保存。

### Task 0: 项目历史列表（Rust + React）

- [ ] `list_project_files(projects_dir)` → `{ path, title, mtime, snippet }[]`，按 mtime 降序
- [ ] `search_project_files(query)` → 过滤文件名 / 标题 / 正文
- [ ] React 左栏：搜索框 + 历史列表

### Task 2: System Prompt Builder

- [ ] Load writing-spec from pack
- [ ] Prompt 要求 AI 输出：**短项目名** + 正文；项目名用于 `# 标题` 与文件名

### Task 5: 自动命名与保存

- [ ] 从 AI 响应解析 `project_name`
- [ ] 文件名 `{项目名}-{YYYY-MM-DD}.md`；冲突加 `-2`
- [ ] **直接写入**（无确认）；更新 `项目索引.md`
- [ ] 刷新历史列表，新项置顶

---

## Phase 3 Done Checklist

- [ ] 历史列表按最近修改排序，搜索可用
- [ ] AI 自动生成项目名 + 文件名 `{项目名}-{日期}.md`
- [ ] 生成后直接保存，引用校验仅警告
- [ ] 保存后可在 Evidence 打开

---

## Next Phase

[2026-06-18-phase4-auto-update.md](./2026-06-18-phase4-auto-update.md)
