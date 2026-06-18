# Phase 4: Auto-Update & Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** App checks `updates/manifest.json` on startup, downloads content pack or app updates via GitHub Releases, applies atomic content replacement, and CI publishes releases automatically.

**Architecture:** Rust update module implements DESIGN.md §6.2 state machine; Tauri built-in updater for app binaries; GitHub Actions for both release types.

**Prerequisite:** Phase 0 CI scaffold + Phase 1 app shell.

---

## Key Tasks Summary

### Task 1: Manifest Fetcher

- [ ] `check_updates(manifest_url)` → `{ content?: UpdateInfo, app?: UpdateInfo }`
- [ ] Compare with `config.last_content_version` and app semver

### Task 2: Content Pack Download & Apply

- [ ] Download to `downloads/pack-{version}.zip`
- [ ] SHA256 verify
- [ ] Extract to `content.new/`
- [ ] Validate manifest + registry
- [ ] Atomic swap content dirs
- [ ] Reload DB connection

### Task 3: Tauri App Updater

- [ ] Configure `tauri.conf.json` updater pubkey
- [ ] Sign releases in CI
- [ ] `platforms` from manifest.app

### Task 4: Settings UI

- [ ] Version info display
- [ ] Manual「检查更新」button
- [ ] Progress indicator during download

### Task 5: CI release-app.yml

- [ ] Build Windows + macOS artifacts
- [ ] Upload to GitHub Release
- [ ] Update updates/manifest.json app section

### Task 6: End-to-End Update Test

- [ ] Install v1 pack → publish v2 pack → app updates → browse new content

---

## Phase 4 Done Checklist

- [ ] Startup manifest check works
- [ ] Content pack update atomic and recoverable
- [ ] App self-update via Tauri updater
- [ ] CI publishes both content and app releases
- [ ] updates/manifest.json always current

---

## Project Complete

All four phases delivered. Run finishing-a-development-branch skill for merge/PR.
