# Phase 1: Tauri Standards Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Tauri 2 desktop app that loads a local content pack, browses 130 standards with framework filter, full-text search, legacy badges, and official URL links.

**Architecture:** `app/` package with React frontend and thin Rust command layer. Content pack lives in `{AppData}/content/`. Rust handles SQLite FTS queries and file reads; React handles UI state.

**Tech Stack:** Tauri 2, React 19, TypeScript, Vite, Tailwind, shadcn/ui, rusqlite

**Prerequisite:** Phase 0 complete — at least one `standards-pack-*.zip` available for dev.

**Spec:** [docs/superpowers/specs/2026-06-18-desktop-app-design.md](../specs/2026-06-18-desktop-app-design.md)

---

## File Map

| File | Responsibility |
|------|----------------|
| `app/src-tauri/src/main.rs` | Tauri entry, register commands |
| `app/src-tauri/src/commands/content.rs` | list/get standards, search |
| `app/src-tauri/src/commands/pack.rs` | load pack from AppData, init on first run |
| `app/src-tauri/src/db.rs` | SQLite FTS connection wrapper |
| `app/src/App.tsx` | Router shell |
| `app/src/pages/StandardsPage.tsx` | List + filter + detail |
| `app/src/components/StandardDetail.tsx` | Markdown render + official link |
| `app/src/components/SearchBar.tsx` | FTS search UI |
| `app/src/hooks/useStandards.ts` | invoke Tauri commands |

---

### Task 1: Tauri App Scaffold

- [ ] **Step 1: Create Tauri app**

```bash
cd /workspace
pnpm create tauri-app app --template react-ts
# Select: React + TypeScript + pnpm
```

- [ ] **Step 2: Add Tailwind + shadcn/ui**

```bash
cd app
pnpm dlx shadcn@latest init
```

- [ ] **Step 3: Verify dev runs**

```bash
pnpm tauri dev
```

Expected: empty window opens

- [ ] **Step 4: Commit**

---

### Task 2: Content Pack Loader (Rust)

- [ ] **Step 1: Write Rust test for pack detection**

`app/src-tauri/src/pack.rs`:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn detects_valid_pack_when_registry_exists() {
        // setup temp dir with registry.json
        assert!(is_valid_pack(&path));
    }
}
```

- [ ] **Step 2: Implement `load_pack_dir` — reads registry.json**

- [ ] **Step 3: Tauri command `get_pack_info` → content_version, counts**

- [ ] **Step 4: First-run wizard: prompt user to select zip or download**

- [ ] **Step 5: Commit**

---

### Task 3: Standards List API

- [ ] **Step 1: Rust test `list_standards` filters by framework and legacy**

- [ ] **Step 2: Implement `list_standards` command**

- [ ] **Step 3: React `StandardsPage` renders list with framework tabs**

- [ ] **Step 4: Toggle「显示旧准则」includes archive entries**

- [ ] **Step 5: Commit**

---

### Task 4: Standard Detail View

- [ ] **Step 1: `get_standard(id)` returns markdown body from pack_path**

- [ ] **Step 2: Install react-markdown + remark-gfm**

- [ ] **Step 3: `StandardDetail` renders with official_url button**

- [ ] **Step 4: Legacy banner when status=legacy, link to superseded_by**

- [ ] **Step 5: Commit**

---

### Task 5: Full-Text Search

- [ ] **Step 1: Rust `search_standards(query)` queries index/search.sqlite**

- [ ] **Step 2: React SearchBar with debounced input**

- [ ] **Step 3: Click hit → navigate to standard detail**

- [ ] **Step 4: Commit**

---

### Task 6: Settings Page (minimal)

- [ ] **Step 1: Show content_version, vault_commit, app version**

- [ ] **Step 2: Button to re-import pack zip (dev helper)**

- [ ] **Step 3: Commit**

---

## Phase 1 Done Checklist

- [ ] App loads pack from AppData
- [ ] 130 standards browsable with filters
- [ ] Search returns relevant hits
- [ ] Official URL opens in browser
- [ ] Legacy standards show badge + superseded link

---

## Next Phase

[2026-06-18-phase2-evidence-split.md](./2026-06-18-phase2-evidence-split.md)
