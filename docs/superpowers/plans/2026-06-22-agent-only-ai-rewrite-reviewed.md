# Agent-only AI Rewrite Reviewed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Windows Continue/provider failures and improve Agent reliability without prematurely deleting the tested Pipeline path.

**Architecture:** Keep the current shared command/post-processing flow. First make Agent calls stateless per turn, normalize Continue document input, harden retries, and add observability. Only switch default Agent-only and remove Pipeline after live VM and Windows gates prove Agent quality and provider stability.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Vite, pnpm 9, DeepSeek/OpenAI-compatible chat APIs, local standards pack.

---

## Review of uploaded plan

### Feasibility verdict

The uploaded plan is partially feasible but too aggressive in PR ordering. It correctly identifies useful patterns from Dify, LangGraph, Open WebUI, Continue.dev, LiteLLM, and Reasonix, and those patterns can be implemented inside the existing Rust/Tauri app. The risky part is making "Agent-only" and deleting Pipeline before Agent has equivalent statelessness, budgets, tests, and live evidence.

### Keep from the uploaded plan

- Keep stateless cross-turn Agent calls: every new Agent run should start its API payload as `[system, current_user_turn]`.
- Keep full `.md` as the Continue source of truth for P1, after BOM/CRLF normalization.
- Keep tool loop only inside the current turn; never replay old `tool` rows or old assistant `tool_calls`.
- Keep explicit Agent phases, forced synthesis, storm detection, JSON repair, 429/503 retry, and debug logging.
- Keep sessions outside `config.json` as a later storage cleanup.

### Change from the uploaded plan

- Do not delete Pipeline in PR-1. Current code defaults to Pipeline and labels Agent as legacy rollback; removing Pipeline first removes the best-tested provider-compatible path.
- Do not hide Pipeline before Agent live checks pass. Keep the UI toggle until Agent-only is proven on VM and Windows.
- Do not use "tool>=10" as a universal pass condition. Tool count is diagnostic, not quality. Use citation coverage, no prefix errors, no giant quote dumps, and successful create+continue as gates.
- Do not ship `ai-debug.log` with secrets or full prompts. Log metadata, hashes, counts, provider status, phase, and tool names only.

### Recommended PR sequence

1. PR-1: Agent statelessness, normalization, auth-error surfacing, and stale-error UX.
2. PR-2: Agent loop hardening: phase enum, max-round synthesis, storm guard, JSON repair, 429/503 backoff.
3. PR-3: Observability: redacted debug log, richer progress trace, Settings save toast.
4. PR-4: Session storage: move Agent sessions and activity out of `config.json`.
5. PR-5: Agent-only gate: switch default to Agent and keep Pipeline as hidden rollback.
6. PR-6: Delete Pipeline only after VM and Windows 0.1.13 gates pass and the user approves.

---

## Current code facts agents must preserve

- UI code lives under `app/src/`; Rust lives under `app/src-tauri/`.
- `run_standards_orchestrator` currently routes `generation_mode == "agent"` to Agent and everything else to Pipeline.
- `AiConfig.generation_mode` is optional and currently documented/defaulted as Pipeline.
- Settings currently exposes Pipeline and Agent choices.
- Commands, progress events, parsing, markdown finalization, quote capping, and project save are shared across both modes.
- Pipeline ignores `prior_messages` for LLM calls; Agent currently seeds from stripped prior text and then runs tools.
- `projects::read_project_file` reads the existing `.md` before Continue; normalization must happen before prompt construction.
- `AiGenerationProgress` currently has only `phase` and `message`; UI treats phases generically.
- Full tests are `pnpm test` and `cd app/src-tauri && cargo test`; live AI check is `ASD_GENERATION_MODE=agent cargo run --example pipeline_live_check -- <model>` with API credentials and content pack.

---

## Task 0: Prepare branch and baseline

**Files:**
- Read: `AGENTS.md`
- Read: `docs/AI-GENERATION-REWRITE-PLAN.md`
- Read: `app/src-tauri/src/ai.rs`
- Read: `app/src-tauri/src/ai_agent.rs`
- Read: `app/src-tauri/src/ai_pipeline.rs`
- Read: `app/src-tauri/src/retrieval.rs`
- Read: `app/src-tauri/src/config.rs`
- Read: `app/src/pages/SettingsPage.tsx`
- Read: `app/src/pages/EvidencePage.tsx`
- Read: `app/src/App.tsx`

- [ ] **Step 0.1: Create the PR branch**

Run:
`git checkout main && git pull origin main && git checkout -b cursor/agent-stateless-hardening-980c`

Expected:
branch switches to `cursor/agent-stateless-hardening-980c`.

- [ ] **Step 0.2: Run baseline Rust tests**

Run:
`cd app/src-tauri && cargo test`

Expected:
all Rust tests pass. If tests fail before changes, save the output and stop; do not mix environment repair with this PR.

- [ ] **Step 0.3: Run baseline frontend/TS tests**

Run:
`pnpm test`

Expected:
shared-types, pack-builder, app tests, and TypeScript checks pass.

---

## PR-1: Stateless Agent and Continue input safety

### Task 1: Add Agent API-shape tests before changing behavior

**Files:**
- Modify: `app/src-tauri/src/ai_agent.rs`

- [ ] **Step 1.1: Add a helper contract test in `#[cfg(test)] mod tests`**

Add a test named `agent_turn_seed_uses_only_system_and_current_user_for_api`. The test must create prior messages with:
- one prior user message,
- one prior assistant text message,
- one prior assistant with `tool_calls`,
- one prior `tool` row.

The expected API seed must contain exactly:
- `system`
- current `user`

The expected persisted seed must keep prior user/assistant text and current user, but no `tool` rows and no `tool_calls`.

Implementation requirement:
- If no helper exists yet, write the test against a new private helper named `seed_agent_turn_for_test`.
- The helper may be test-only if needed, but prefer a real helper used by `run_standards_agent`.

- [ ] **Step 1.2: Run the new test and confirm it fails**

Run:
`cd app/src-tauri && cargo test ai_agent::tests::agent_turn_seed_uses_only_system_and_current_user_for_api`

Expected:
FAIL because current `run_standards_agent` includes stripped prior text in `api_messages`.

### Task 2: Implement stateless per-run Agent seeding

**Files:**
- Modify: `app/src-tauri/src/ai_agent.rs`

- [ ] **Step 2.1: Add normalized user-turn helper**

Add:
`fn normalize_markdown_for_prompt(markdown: &str) -> String`

Behavior:
- Remove leading UTF-8 BOM `\u{feff}`.
- Convert `\r\n` and bare `\r` to `\n`.
- Return the normalized string.

- [ ] **Step 2.2: Update `build_user_turn`**

Change Continue existing markdown handling from direct append to:
`let existing = normalize_markdown_for_prompt(existing);`
then append `当前项目笔记全文：\n{existing}`.

Do not truncate in PR-1. The P1 contract is full `.md`.

- [ ] **Step 2.3: Add `seed_agent_turn` helper**

Create:
`fn seed_agent_turn(system_prompt: String, prior_messages: Vec<AiAgentMessage>, current_user_turn: String) -> (Vec<AiAgentMessage>, Vec<ApiChatMessage>)`

Behavior:
- `persisted_session = trim_session(strip_tool_history(prior_messages))`.
- Push current user message into `persisted_session`.
- `api_messages = [system, current user]`.
- Do not append prior user/assistant text to `api_messages`.

- [ ] **Step 2.4: Use helper in `run_standards_agent`**

Replace the current `session` and `api_messages` initialization with the helper. During the current turn:
- Keep a separate `turn_messages` or append to `api_messages` for tool loop continuity.
- Push tool rows only to `api_messages`, not to returned `session_messages`.
- Push activity rows for each tool call as today.
- When final assistant text arrives, push only that final assistant text into returned `session_messages`.

Invariant:
returned `AgentRunOutput.session_messages` contains no `role == "tool"` and no assistant `tool_calls`.

- [ ] **Step 2.5: Run Agent unit tests**

Run:
`cd app/src-tauri && cargo test ai_agent`

Expected:
all `ai_agent` tests pass.

- [ ] **Step 2.6: Commit PR-1 Agent seeding changes**

Run:
`git add app/src-tauri/src/ai_agent.rs && git commit -m "Harden agent turns with stateless API seeding"`

### Task 3: Stop Pipeline planner from swallowing auth errors

**Files:**
- Modify: `app/src-tauri/src/ai_pipeline.rs`
- Modify tests in: `app/src-tauri/src/ai_pipeline.rs`

- [ ] **Step 3.1: Add pure classifier tests**

Add tests:
- `planner_error_auth_is_fatal` for strings containing `401`, `403`, `unauthorized`, `forbidden`, `invalid api key`.
- `planner_error_non_auth_can_fallback` for network timeout or malformed JSON.

- [ ] **Step 3.2: Add helper**

Add:
`fn is_planner_auth_error(error: &str) -> bool`

Behavior:
lowercase match on `401`, `403`, `unauthorized`, `forbidden`, `invalid api key`, `authentication`.

- [ ] **Step 3.3: Change `plan_retrieval` signature**

Change:
`pub async fn plan_retrieval(...) -> RetrievalPlan`
to:
`pub async fn plan_retrieval(...) -> Result<RetrievalPlan, String>`

Behavior:
- `Ok(merge_retrieval_plans(...))` on successful planning or parse fallback.
- `Err(error)` when `is_planner_auth_error(&error)` is true.
- `Ok(baseline)` for non-auth planner failures.

- [ ] **Step 3.4: Update caller**

In `run_standards_pipeline`, change:
`let plan = plan_retrieval(...).await;`
to:
`let plan = plan_retrieval(...).await?;`

- [ ] **Step 3.5: Run focused tests**

Run:
`cd app/src-tauri && cargo test ai_pipeline`

Expected:
all `ai_pipeline` tests pass.

- [ ] **Step 3.6: Commit Pipeline auth handling**

Run:
`git add app/src-tauri/src/ai_pipeline.rs && git commit -m "Surface planner authentication failures"`

### Task 4: Clear stale generation errors at request start

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/pages/EvidencePage.tsx`

- [ ] **Step 4.1: Add `onGenerationStart` prop**

In `EvidencePageProps`, add:
`onGenerationStart: () => void;`

In `App.tsx`, pass:
`() => { setGenError(null); setGenResultPath(null); setGenProgress(null); }`

- [ ] **Step 4.2: Call it before Generate and Continue**

In `handleGenerate`, after empty-question validation and before `setGenerating(true)`, call `onGenerationStart()`.

In `handleContinue`, after empty-question validation and before `setGenerating(true)`, call `onGenerationStart()`.

- [ ] **Step 4.3: Run frontend checks**

Run:
`pnpm --filter @asd/accounting-copilot test`

Expected:
app vitest and TypeScript checks pass.

- [ ] **Step 4.4: Commit UX fix**

Run:
`git add app/src/App.tsx app/src/pages/EvidencePage.tsx && git commit -m "Clear stale AI generation state on new requests"`

### PR-1 verification

- [ ] **Step 5.1: Run full tests**

Run:
`pnpm test`

Expected:
all JS/TS tests pass.

Run:
`cd app/src-tauri && cargo test`

Expected:
all Rust tests pass.

- [ ] **Step 5.2: Run optional live Agent check when credentials and content pack exist**

Run:
`cd app/src-tauri && ASD_GENERATION_MODE=agent DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" cargo run --example pipeline_live_check -- deepseek-v4-flash`

Expected:
create + three continues pass; output ends with `ALL 4 ROUNDS PASSED`; no prefix error appears; session assertion passes.

- [ ] **Step 5.3: Push and open draft PR**

Run:
`git push -u origin cursor/agent-stateless-hardening-980c`

Create a draft PR with summary:
- stateless Agent API seed,
- normalized Continue markdown,
- planner auth errors surfaced,
- stale UI error cleared,
- tests run and live-check status.

---

## PR-2: Agent loop hardening

### Task 6: Add explicit Agent phases and max-round synthesis guard

**Files:**
- Modify: `app/src-tauri/src/ai_agent.rs`

- [ ] **Step 6.1: Add enum**

Add:
`#[derive(Debug, Clone, Copy, PartialEq, Eq)] enum AgentPhase { Retrieving, Synthesizing, Complete }`

- [ ] **Step 6.2: Track phase in `run_standards_agent`**

Initialize `phase = AgentPhase::Retrieving`.
Set `Synthesizing` before final synthesis nudge.
Set `Complete` after final blocks are found.

- [ ] **Step 6.3: Strengthen forced synthesis prompt**

When max rounds are exhausted or assistant returns empty content, call `call_chat_with_tools_synthesis` with an appended user nudge requiring both `<<<PROJECT_NAME>>>` and `<<<MARKDOWN>>>`.

- [ ] **Step 6.4: Add unit tests for final-block detection helpers**

Test:
- final blocks present returns true,
- missing project name returns false,
- missing markdown returns false.

- [ ] **Step 6.5: Run tests and commit**

Run:
`cd app/src-tauri && cargo test ai_agent`

Expected:
all `ai_agent` tests pass.

Commit:
`git add app/src-tauri/src/ai_agent.rs && git commit -m "Add explicit agent phases and synthesis guard"`

### Task 7: Tool-call storm guard

**Files:**
- Modify: `app/src-tauri/src/ai_agent.rs`

- [ ] **Step 7.1: Add storm helper tests**

Add tests:
- same tool name and same arguments repeated three times in a sliding window is storm.
- same tool with different arguments is not storm.
- different tools are not storm.

- [ ] **Step 7.2: Add helper**

Add:
`fn is_repeated_tool_call(recent: &[(String, String)], name: &str, arguments: &str) -> bool`

Behavior:
return true when the same `(name, arguments)` appears at least two times in the recent window before dispatching the third call.

- [ ] **Step 7.3: Use helper in loop**

Maintain `recent_tool_calls: Vec<(String, String)>`.
Before `execute_pack_tool`, check storm.
If storm:
- append an activity row `kind: "tool"` with content `Skipped repeated tool call: <name>`.
- append a tool result JSON `{"error":"Repeated tool call skipped; synthesize with existing evidence or choose a different citation."}` to `api_messages`.
- do not execute the local pack tool.

- [ ] **Step 7.4: Run tests and commit**

Run:
`cd app/src-tauri && cargo test ai_agent`

Commit:
`git add app/src-tauri/src/ai_agent.rs && git commit -m "Guard agent tool loop against repeated calls"`

### Task 8: JSON argument repair

**Files:**
- Modify: `app/src-tauri/src/ai_agent.rs`

- [ ] **Step 8.1: Add repair tests**

Test cases:
- complete JSON object parses unchanged.
- arguments with trailing whitespace parse.
- truncated JSON missing one closing brace is repaired.
- badly malformed JSON returns original parse error.

- [ ] **Step 8.2: Add helper**

Add:
`fn parse_tool_args_with_repair<T: serde::de::DeserializeOwned>(raw: &str) -> Result<T, String>`

Behavior:
- Try `serde_json::from_str(raw)`.
- If it fails, count unmatched `{`/`[` and append needed `}`/`]` in reverse order.
- Try parse once more.
- Return a clear error containing the original serde error if still invalid.

- [ ] **Step 8.3: Replace direct tool arg parsing**

In `execute_pack_tool`, replace each `serde_json::from_str::<...>(arguments)` call with `parse_tool_args_with_repair::<...>(arguments)`.

- [ ] **Step 8.4: Run tests and commit**

Run:
`cd app/src-tauri && cargo test ai_agent`

Commit:
`git add app/src-tauri/src/ai_agent.rs && git commit -m "Repair truncated agent tool arguments"`

### Task 9: 429/503 backoff around chat calls

**Files:**
- Modify: `app/src-tauri/src/ai_agent.rs`

- [ ] **Step 9.1: Add retry classifier tests**

Tests:
- `429` and `rate limit` are retryable.
- `503` and `service unavailable` are retryable.
- `401` and `403` are not retryable.
- prefix/context errors still use existing recovery path, not repeated blind retry.

- [ ] **Step 9.2: Add helpers**

Add:
`fn is_retryable_provider_error(error: &str) -> bool`

Add:
`async fn chat_completion_with_backoff(...) -> Result<ApiChatMessage, String>`

Behavior:
- Up to three attempts for retryable 429/503 errors.
- Backoff delays: 500ms, 1000ms, 2000ms.
- Do not retry 401/403.
- Do not log API keys or request bodies.

- [ ] **Step 9.3: Wire backoff**

Use `chat_completion_with_backoff` inside `call_chat_with_tools` and `call_chat_with_tools_synthesis`, preserving prefix/context recovery.

- [ ] **Step 9.4: Run tests and commit**

Run:
`cd app/src-tauri && cargo test ai_agent`

Commit:
`git add app/src-tauri/src/ai_agent.rs && git commit -m "Retry transient provider failures in agent chat"`

### PR-2 verification

- [ ] Run `cd app/src-tauri && cargo test ai_agent`.
- [ ] Run `cd app/src-tauri && cargo test`.
- [ ] Run optional live Agent create+continue check with `ASD_GENERATION_MODE=agent`.
- [ ] Push branch and update the PR.

---

## PR-3: Observability and Settings feedback

### Task 10: Add redacted AI debug logging

**Files:**
- Modify: `app/src-tauri/src/ai_agent.rs`
- Modify: `app/src-tauri/src/ai.rs`
- Modify: `app/src-tauri/src/models.rs`

- [ ] **Step 10.1: Add debug event struct**

Add Rust struct:
`AiDebugEvent { ts_secs, mode, phase, provider, model, status, prompt_chars, completion_chars, tool_name, error_class }`

Every field except counts and timestamp should be `Option<String>` where unknown.

- [ ] **Step 10.2: Add append function**

Add:
`fn append_ai_debug_event(app_handle: Option<&tauri::AppHandle>, event: &AiDebugEvent)`

Behavior:
- Resolve app data dir.
- Append one JSON line to `ai-debug.log`.
- Never include API key, raw prompt, raw completion, or raw tool output.
- Ignore logging failures.

- [ ] **Step 10.3: Call logger**

Log:
- Agent run start.
- Each tool dispatch by tool name.
- Final synthesis start/end.
- Provider HTTP error class.
- Pipeline start/write end if Pipeline remains enabled.

- [ ] **Step 10.4: Run tests and commit**

Run:
`cd app/src-tauri && cargo test`

Commit:
`git add app/src-tauri/src/ai_agent.rs app/src-tauri/src/ai.rs app/src-tauri/src/models.rs && git commit -m "Add redacted AI debug logging"`

### Task 11: Extend progress payload without breaking UI

**Files:**
- Modify: `app/src-tauri/src/models.rs`
- Modify: `app/src/types.ts`
- Modify: `app/src/App.tsx`
- Modify: `app/src/pages/EvidencePage.tsx`

- [ ] **Step 11.1: Extend models**

Add optional fields:
- `run_id: Option<String>`
- `step_index: Option<u32>`
- `kind: Option<String>`
- `detail: Option<String>`

Keep existing `phase` and `message`.

- [ ] **Step 11.2: Update TS interface**

Add optional fields to `AiGenerationProgress`.

- [ ] **Step 11.3: Keep UI backward compatible**

Do not require new fields for rendering. Continue showing `message` as today.

- [ ] **Step 11.4: Run frontend and Rust tests**

Run:
`pnpm --filter @asd/accounting-copilot test`

Run:
`cd app/src-tauri && cargo test`

Commit:
`git add app/src-tauri/src/models.rs app/src/types.ts app/src/App.tsx app/src/pages/EvidencePage.tsx && git commit -m "Extend AI generation progress metadata"`

### Task 12: Settings save toast

**Files:**
- Modify: `app/src/pages/SettingsPage.tsx`

- [ ] **Step 12.1: Import toast hook**

Import `useToast` from `../components/Toast`.

- [ ] **Step 12.2: Show toast on successful AI settings save**

Inside `handleSaveAiConfig`, after `setNotice(tr("aiSettingsSaved"))`, call:
`showToast(tr("aiSettingsSaved"), "success")`.

- [ ] **Step 12.3: Show toast on update settings save**

Inside `handleSaveUpdateConfig`, after `setNotice(tr("updateSettingsSaved"))`, call:
`showToast(tr("updateSettingsSaved"), "success")`.

- [ ] **Step 12.4: Run test and commit**

Run:
`pnpm --filter @asd/accounting-copilot test`

Commit:
`git add app/src/pages/SettingsPage.tsx && git commit -m "Show settings save confirmation toasts"`

---

## PR-4: Move Agent sessions out of config

### Task 13: Create session storage module

**Files:**
- Create: `app/src-tauri/src/session.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/src/config.rs`
- Modify: `app/src-tauri/src/commands.rs`
- Modify: `app/src-tauri/src/models.rs`
- Modify: `app/src/api.ts`
- Modify: `app/src/types.ts`
- Modify: `app/src/pages/EvidencePage.tsx`

- [ ] **Step 13.1: Define schema**

Create:
`StoredAiSession { version: u32, project_relative_path: String, messages: Vec<AiAgentMessage>, activity: Vec<AiConversationTurn> }`

Use `version = 1`.

- [ ] **Step 13.2: Define paths**

Store files under:
`app_data_dir()/sessions/<sha256(session_key)>.json`

Do not use raw relative paths in filenames because project paths can contain slashes and Windows-reserved characters.

- [ ] **Step 13.3: Add API**

Implement:
- `pub fn load_session(app: &AppHandle, key: &str) -> Result<(Vec<AiAgentMessage>, Vec<AiConversationTurn>), String>`
- `pub fn save_session(app: &AppHandle, key: &str, messages: &[AiAgentMessage], activity: &[AiConversationTurn]) -> Result<(), String>`
- `pub fn delete_session(app: &AppHandle, key: &str) -> Result<(), String>`
- `pub fn list_session_activity_index(app: &AppHandle) -> Result<Vec<AiConversationIndexEntry>, String>`
- `pub fn migrate_config_sessions(app: &AppHandle) -> Result<(), String>`

- [ ] **Step 13.4: Register module**

Add `mod session;` in `lib.rs`.

### Task 14: Wire commands to session files

**Files:**
- Modify: `app/src-tauri/src/commands.rs`
- Modify: `app/src-tauri/src/config.rs`
- Modify: `app/src-tauri/src/models.rs`
- Modify: `app/src/api.ts`
- Modify: `app/src/types.ts`
- Modify: `app/src/pages/EvidencePage.tsx`

- [ ] **Step 14.1: Load prior session from files**

In `generate_project_document`, replace `config.projects_ui.agent_session(DRAFT_AGENT_SESSION_KEY)` with `session::load_session(&app, DRAFT_AGENT_SESSION_KEY).unwrap_or_default().0`.

In `continue_project_document`, load by `relative_path`.

- [ ] **Step 14.2: Persist session to files**

Change `persist_agent_run` so it:
- reads existing `(messages, activity)` from `session::load_session(app, to_session_key)`,
- merges any draft activity when `from_session_key != to_session_key`,
- saves the new messages and merged activity through `session::save_session`,
- removes writes to `projects_ui.ai_agent_sessions`,
- removes writes to `projects_ui.ai_threads`.

- [ ] **Step 14.3: Keep UI conversation command working**

Update `get_project_conversation` to read activity from session files first, then fall back to `projects_ui.ai_threads`, then fall back to markdown log parsing.

- [ ] **Step 14.4: Add conversation index command**

In `models.rs`, add:
`AiConversationIndexEntry { relative_path: String, latest_timestamp_secs: u64 }`

In `commands.rs`, add Tauri command:
`pub fn list_ai_conversation_index(app: AppHandle) -> Result<Vec<AiConversationIndexEntry>, String>`

Implementation:
- call `session::list_session_activity_index(&app)`,
- include old `projects_ui.ai_threads` keys until migration has cleared them,
- skip `__draft__`,
- sort descending by `latest_timestamp_secs`.

Register the command in `lib.rs`.

- [ ] **Step 14.5: Update frontend active-conversation lookup**

In `app/src/api.ts`, add wrapper:
`export async function listAiConversationIndex(): Promise<AiConversationIndexEntry[]>`

In `app/src/types.ts`, add matching interface.

In `EvidencePage.tsx`:
- replace the `findLatestConversationFolder(projectsUi.ai_threads, ...)` dependency with state loaded from `listAiConversationIndex()`,
- refresh that index after Generate, Continue, and `refreshProjectsUi()`,
- keep `projectsUi.last_evidence_file` and selected folder fallback logic unchanged.

- [ ] **Step 14.6: Migration**

At app startup or first `get_config`, call `migrate_config_sessions`.
Move existing `projects_ui.ai_agent_sessions` and `projects_ui.ai_threads` into session files.
After successful migration, clear both maps in config.

- [ ] **Step 14.7: Tests**

Add Rust tests for:
- session filename hashing is stable,
- save/load round trip,
- migration clears config messages after writing session file,
- delete removes session file.
Add TS test or component-level test for:
- latest conversation folder is derived from `listAiConversationIndex`,
- `last_evidence_file` fallback still works when index is empty.

Run:
`cd app/src-tauri && cargo test session commands config`

Run:
`pnpm --filter @asd/accounting-copilot test`

Commit:
`git add app/src-tauri/src/session.rs app/src-tauri/src/lib.rs app/src-tauri/src/config.rs app/src-tauri/src/commands.rs app/src-tauri/src/models.rs app/src/api.ts app/src/types.ts app/src/pages/EvidencePage.tsx && git commit -m "Store AI sessions outside config"`

---

## PR-5: Agent-only default gate

Do this PR only after PR-1 through PR-4 pass tests and live checks.

### Task 15: Switch default to Agent while preserving rollback

**Files:**
- Modify: `app/src-tauri/src/ai.rs`
- Modify: `app/src-tauri/src/config.rs`
- Modify: `app/src/types.ts`
- Modify: `app/src/pages/SettingsPage.tsx`
- Modify: `app/src/lib/i18n.ts`
- Modify: `app/src/browser-mock.ts`

- [ ] **Step 15.1: Change orchestrator default**

In `run_standards_orchestrator`, route:
- `Some("pipeline")` to Pipeline.
- all other values to Agent.

- [ ] **Step 15.2: Change config/UI defaults**

Set default `generation_mode` to `Some("agent")` in Rust default config and `"agent"` in frontend default state.

- [ ] **Step 15.3: Update copy**

Use English UI copy:
- Agent option: `Agent (recommended)`
- Pipeline option: `Pipeline (rollback)`

Chinese i18n may mirror the meaning.

- [ ] **Step 15.4: Keep setting visible**

Do not hide the toggle yet. This is the emergency rollback during 0.1.13 validation.

- [ ] **Step 15.5: Tests and commit**

Run:
`pnpm test`

Run:
`cd app/src-tauri && cargo test`

Commit:
`git add app/src-tauri/src/ai.rs app/src-tauri/src/config.rs app/src/types.ts app/src/pages/SettingsPage.tsx app/src/lib/i18n.ts app/src/browser-mock.ts && git commit -m "Make agent the default generation mode"`

### PR-5 live acceptance

- [ ] Run Agent live check on VM:
`cd app/src-tauri && ASD_GENERATION_MODE=agent DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" cargo run --example pipeline_live_check -- deepseek-v4-flash`

- [ ] Run Pipeline rollback live check on VM:
`cd app/src-tauri && ASD_GENERATION_MODE=pipeline DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" cargo run --example pipeline_live_check -- deepseek-v4-flash`

- [ ] Manually verify app UI if GUI is available:
`pnpm app:dev`

Check:
- Settings shows Agent recommended.
- Generate starts with no stale error.
- Continue succeeds.
- Conversation activity shows tool/retrieval steps.

---

## PR-6: Remove Pipeline after explicit approval

Do not start PR-6 until the user confirms VM and Windows 0.1.13 acceptance.

### Task 16: Delete Pipeline code and config

**Files:**
- Delete: `app/src-tauri/src/ai_pipeline.rs`
- Keep or partially keep: `app/src-tauri/src/retrieval.rs` if Agent still uses deterministic retrieval helpers.
- Modify: `app/src-tauri/src/ai.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/examples/pipeline_live_check.rs`
- Modify: `app/src-tauri/src/config.rs`
- Modify: `app/src/types.ts`
- Modify: `app/src/pages/SettingsPage.tsx`
- Modify: `app/src/lib/i18n.ts`
- Modify: `app/src/browser-mock.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `AGENTS.md`

- [ ] **Step 16.1: Remove orchestrator mode branch**

`run_standards_orchestrator` should call `run_standards_agent` directly.

- [ ] **Step 16.2: Remove `generation_mode` from config and UI**

Remove field from Rust and TS types only after migration logic tolerates old `generation_mode` in existing `config.json`.

Use serde defaults/unknown-field tolerance; do not break old configs.

- [ ] **Step 16.3: Rename live example**

Rename `pipeline_live_check.rs` to `agent_live_check.rs`.

Update usage text and scripts.

- [ ] **Step 16.4: Update docs**

In `AGENTS.md` and `docs/ARCHITECTURE.md`, document:
- Agent-only mode.
- Stateless cross-turn API shape.
- Current-turn-only tool loop.
- Session storage path.
- Debug log location and redaction rules.

- [ ] **Step 16.5: Tests and commit**

Run:
`pnpm test`

Run:
`cd app/src-tauri && cargo test`

Run:
`cd app/src-tauri && DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" cargo run --example agent_live_check -- deepseek-v4-flash`

Commit:
`git add -A && git commit -m "Remove pipeline generation mode"`

---

## Release and Windows gate

- [ ] Build a Windows 0.1.13 installer only after PR-5 or PR-6 is selected for release.
- [ ] Wrong key gate: Create returns clear 401/auth error, not prefix/context error.
- [ ] Correct key gate: Create succeeds.
- [ ] Correct key gate: Continue succeeds three times on the same note.
- [ ] Output quality gate: generated note has concise Chinese analysis, blockquotes do not exceed quote cap after post-processing, citations resolve locally.
- [ ] Regression gate: Settings token/key placeholders remain redacted and no secrets appear in `config.json` or `ai-debug.log`.
- [ ] User confirmation gate: do not merge `main` or tag `app-v0.1.13` until the user confirms Windows results.

---

## Self-review checklist

- Spec coverage: The plan covers uploaded PR-1 through PR-5 ideas, but reorders Pipeline deletion behind evidence gates.
- Placeholder scan: Passed; the plan contains concrete paths, commands, checks, and expected outcomes.
- Type consistency: `AiGenerationProgress`, `AiConfig.generation_mode`, `AiAgentMessage`, `AiConversationTurn`, and session storage names are consistent with current code.
- Risk control: Every behavioral PR includes focused tests, full tests, commits, push/PR update, and live-check criteria.
