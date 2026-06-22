# Release notes

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

## app-v0.1.13 (2026-06-21)

Agent-only generation; pipeline mode removed. See git history / prior PRs (#21).
