# 重构工作单（Engineering Handoff）：移除 function-calling，根治 DeepSeek "prefix not found"

> 状态：**已确诊根因，计划待实施（本工作单供实施 Agent 直接执行）**。
> 负责人视角（Manager）编写：下面每一步都写明「改哪个文件、加什么函数/结构、消息长什么样、怎么测、验收标准」，实施 Agent 照做即可，无需再猜。

---

## 0. 给实施 Agent 的 TL;DR

- **要做的事**：把 AI 生成笔记的编排从「LLM function-calling 多轮工具循环」改为「**Rust 确定性检索 + 不带 `tools` 的纯对话三阶段管道**」。
- **为什么**：DeepSeek 在 `deepseek-v4-flash` 上，**只要请求里带 `tools`（function calling）就会和其内部 "prefix" 路径冲突**，返回 400 `Function call should not be used with prefix` / `prefix not found`。只要我们**完全不发 `tools`**，该错误整类消失（与厂商、网关、模型无关）。
- **红线**：不得降低核心检索/输出效果；新模式用配置开关灰度，旧 `agent` 模式保留一个版本周期可回退。
- **不要做**：不要继续在 function-calling 上打补丁（已失败 3 次）。

---

## 1. 确诊根因（含证据）

### 1.1 现场信息（用户确认）
- Base URL：`https://api.deepseek.com/v1`（标准端点，**非** `/beta`）
- 模型：`deepseek-v4-flash`
- 报错原文：`prefix not found`

### 1.2 排除项
- ❌ 不是 `/beta` 端点导致（用户用 `/v1`）。
- ❌ 不是 `deepseek-reasoner` 的「最后一条必须是 user」限制（用户用 flash）。
- ❌ 不是 0.1.11 的播种重放（`strip_tool_history` 已生效，但仍报错）。

### 1.3 真因（高置信度，有外部证据）
DeepSeek 的 **function calling 与 "prefix" 路径互斥**，且 `deepseek-v4-flash` 会进入该冲突：
- 证据：GitHub `Kilo-Org/kilocode#10203` —「API conflict with **deepseek-v4-flash**」，DeepSeek 返回
  `HTTP 400 {"error":{"message":"Function call should not be used with prefix", ...}}`。
- 我们当前**每个请求都带 `tools`**（`ai_agent.rs` 的 `pack_agent_tools()` + `payload["tools"]`），并在循环中产生 `tool_calls`/`tool` 消息。`flash` 在多轮/特定结构下进入 prefix 路径 → 与 function call 冲突 → `prefix not found`。
- 这解释了：首轮有时成功、follow-up 失败；以及为何「改错误字符串匹配/剥离历史」都治不好——**触发点是"带 tools"本身**，不是历史。

### 1.4 立即可用的临时缓解（无需改代码，发给用户先用）
- 把模型从 `deepseek-v4-flash` 换成 **`deepseek-v4-pro`** 或 **`deepseek-chat`**（设置 → AI 写作）。这两个模型通常不进入 flash 的 prefix 冲突路径，可能立刻可用。
- 这是缓解，不是根治；根治见下方重构（移除 `tools`，任何 DeepSeek 模型都安全）。

---

## 2. 目标与非目标

**目标**
- 生成 / 追问（Continue）全流程**永不发送 `tools`/`tool_choice`**，**永不出现 `tool_calls`/`tool` 角色消息**。
- 每次 LLM 调用都是**无状态、最小化**的纯对话（`[system, user]`），不重放历史。
- 保持多步检索质量与现有后处理（引用截断、frontmatter、日志、免责声明）。

**非目标**
- 不改 UI 交互、不改文件存储格式、不改 content pack。
- 不引入向量检索（那是 P2，见 `docs/P2-PLAN.md`）。
- 不删除旧 `agent` 模式（先保留作回退）。

---

## 3. 目标架构：tools-free 三阶段管道

```
generate_project_document / continue_project_document  (commands.rs，不变)
  → ai::generate_and_save_project / continue_and_update_project  (ai.rs，仅改内部调用)
      → run_standards_pipeline(...)   ← 新函数，替代 run_standards_agent（由配置开关选择）
          Phase A  plan_retrieval()     1 次 chat，无 tools，返回 JSON 查询计划
          Phase B  gather_evidence()    纯 Rust，无 LLM，复用现有检索原语
          Phase C  write_note()         1 次 chat，无 tools，输出最终 Markdown 区块
      → parse_ai_response + finalize_project_markdown   (ai.rs，不变，复用)
```

每个 LLM 调用的消息形态（**唯二**两种，均无 tools）：
- Phase A：`[{system: planner}, {user: 问题+事实(+Continue:现有文档摘要)}]`
- Phase C：`[{system: writer}, {user: 问题+事实+【检索证据】(+Continue:现有文档全文)}]`

> 关键：**不拼接历史、不带 tools**，因此 DeepSeek 不会进入 prefix/function-call 冲突。

---

## 4. 数据结构（Rust，新增于 `ai_agent.rs` 或新建 `retrieval.rs`）

```rust
/// Phase A 的产出：模型给出的检索计划（JSON 解析得到）
#[derive(Debug, Deserialize, Default)]
struct RetrievalPlan {
    /// 用于 FTS5/registry 检索的查询词（英文/中文皆可），1-6 条
    #[serde(default)]
    queries: Vec<String>,
    /// 模型认为相关的准则 ID（如 "IFRS 11" / "ASC 842"），可空
    #[serde(default)]
    standards: Vec<String>,
}

/// Phase B 组装的单条证据
#[derive(Debug, Clone, Serialize)]
struct EvidenceItem {
    citation: String,      // 如 "IFRS 11 §7"
    standard_id: String,
    title: String,
    snippet_en: String,    // 段落原文（单条上限见 §6 预算）
}

/// Phase B 的产出：注入 Phase C 的证据包
#[derive(Debug, Default, Serialize)]
struct EvidencePack {
    items: Vec<EvidenceItem>,
}
```

---

## 5. 函数清单（签名 + 职责 + 复用点）

> 全部放在 `ai_agent.rs`（或新建 `app/src-tauri/src/retrieval.rs` 并在 `lib.rs` 挂上 `mod retrieval;`）。

### 5.1 检索原语（从现有 `execute_pack_tool` 抽出为纯 Rust，无 LLM）

```rust
/// FTS5 全文 + registry 兜底（搬运现有 search_local_pack 分支逻辑）
fn search_pack(content_dir: &Path, allow_legacy: bool, query: &str, limit: u32) -> Vec<EvidenceItem>;

/// 列出某准则已索引段落（搬运 list_standard_paragraphs 逻辑）
fn list_paragraphs(content_dir: &Path, allow_legacy: bool, standard_id: &str) -> Vec<String>;

/// 读取段落全文（直接复用 citations::resolve_citation；返回 snippet_en 已是 UTF-16 安全的 4000 字）
fn read_paragraph(content_dir: &Path, allow_legacy: bool, citation: &str) -> Option<EvidenceItem>;
```
- 复用：`db::search_standards`、`pack::load_registry`、`citations::load_paragraphs`、`citations::resolve_citation`。
- 注意：把现有 `execute_pack_tool` 里 search_local_pack 的「registry 模糊兜底」逻辑原样搬过来（保证召回不降）。

### 5.2 Phase A：规划（1 次 chat，无 tools）

```rust
async fn plan_retrieval(
    ai: &AiConfig,
    question: &str,
    facts: Option<&str>,
    existing_markdown: Option<&str>,   // Continue 时给摘要（前 ~1500 字）
) -> RetrievalPlan;
```
- 调 `request_chat_completion(ai, &[system_planner, user], &[] /* 无 tools */, "")`。
- system_planner（精简，写死常量）：要求**只输出 JSON**，形如
  `{"queries":["..."],"standards":["IFRS 11"]}`，不要解释。
- 解析容错：剥离 ```json 代码块、截取第一个 `{...}`；`serde_json` 失败 → 回退
  `RetrievalPlan{ queries: vec![question.to_string()], standards: vec![] }`。
- **绝不因 Phase A 失败而中断**（永远有回退）。

### 5.3 Phase B：检索 + 证据组装（纯 Rust）

```rust
fn gather_evidence(content_dir: &Path, allow_legacy: bool, plan: &RetrievalPlan) -> EvidencePack;
```
- 流程：对每个 `query` 调 `search_pack`；对每个 `standard` 调 `list_paragraphs` 选代表段落并 `read_paragraph`；
  合并去重（按 `standard_id`+`citation`）→ 按相关性排序（FTS5 已 bm25；registry 兜底排后）→ 截断到
  **上限**：最多 `MAX_EVIDENCE_ITEMS = 8` 条，单条 `MAX_ITEM_CHARS = 1500`，总预算 `MAX_EVIDENCE_CHARS = 8000`。
- 若证据为空：返回空包（Phase C 仍可写作，并按规范注明"本地准则库未收录"）。

### 5.4 Phase C：写作（1 次 chat，无 tools）

```rust
async fn write_note(
    ai: &AiConfig,
    content_dir: &Path,
    mode: AgentMode,
    question: &str,
    facts: Option<&str>,
    evidence: &EvidencePack,
    existing_markdown: Option<&str>,   // Continue 时给全文
) -> Result<String, String>;           // 返回 raw（含 <<<PROJECT_NAME>>>/<<<MARKDOWN>>>）
```
- system_writer：由 `build_writer_system_prompt(content_dir)` 生成（见 5.5）。
- user 内容顺序：`用户问题` → `补充事实`（可选）→ `【检索证据】`（把 EvidencePack 渲染成中文小节，每条：`citation` + `snippet_en`）→ Continue 时附 `当前项目笔记全文`。
- 调 `request_chat_completion(ai, &[system_writer, user], &[], "")`。
- 复用 `chat_completion_with_recovery` 的**错误分级/上下文降级**（但此处 messages 无 tools/history，几乎不会触发）。

### 5.5 写作版 system prompt（由现有写作规范派生，去掉工具相关）

```rust
fn build_writer_system_prompt(content_dir: &Path) -> Result<String, String>;
```
- 复用 `load_writing_spec`（编写规范 + SKILL）。
- 与 `build_agent_system_prompt` 的差异：**删除**所有"用 search_local_pack/get_pack_paragraph 工具"的工作流文字，**替换为**「所有准则依据来自下方 user 提供的【检索证据】；证据未覆盖则如实注明，禁止编造」。
- 保留：身份、分析方法、铁律（≤4 句英文引用、提炼表、中文精炼）、输出格式（`<<<PROJECT_NAME>>>`/`<<<MARKDOWN>>>` 分隔符）、自检清单、诊断标记。

### 5.6 顶层编排（替代 run_standards_agent）

```rust
pub async fn run_standards_pipeline(
    app_handle: Option<&tauri::AppHandle>,
    content_dir: &Path,
    ai: &AiConfig,
    input: AgentRunInput<'_>,
) -> Result<AgentRunOutput, String>;
```
- emit 进度：`searching`（Phase A/B）→ `generating`（Phase C）→ 由 commands 层 emit `complete`/`error`。
- 组 `AgentRunOutput`：`raw_response = raw`；`session_messages` 存**纯文本轮次**（user 问题 + assistant 最终文本，**无 tools/tool 消息**）；`activity_log` 记录「检索：queries」「读取：citations」「已生成/更新」。

---

## 6. 配置开关与接线

`app/src-tauri/src/config.rs` → `AiConfig` 增加：
```rust
#[serde(default)]
pub generation_mode: Option<String>,   // "pipeline"(默认) | "agent"
```
- `ai.rs` 的 `generate_and_save_project` / `continue_and_update_project` 内：
  ```rust
  let output = match ai.generation_mode.as_deref() {
      Some("agent") => run_standards_agent(app, content_dir, ai, input).await?,
      _             => run_standards_pipeline(app, content_dir, ai, input).await?, // 默认
  };
  ```
- 后续步骤（`parse_ai_response` / `finalize_project_markdown` / 保存）**完全不变**。
- （可选）`SettingsPage.tsx` + `types.ts` + `api.ts` 暴露开关；默认 pipeline，无需用户操作。

---

## 7. 改动文件清单（逐文件）

| 文件 | 改动 |
|------|------|
| `app/src-tauri/src/ai_agent.rs`（或新 `retrieval.rs`） | 新增 §4 结构、§5 函数；保留 `run_standards_agent` 与 `request_chat_completion`/`chat_completion_with_recovery`；**Phase 调用一律传 `tools=&[]`** |
| `app/src-tauri/src/ai.rs` | `generate_and_save_project`/`continue_and_update_project` 内按 `generation_mode` 选择编排；其余不变 |
| `app/src-tauri/src/config.rs` | `AiConfig.generation_mode` |
| `app/src-tauri/src/lib.rs` | 若新建 `retrieval.rs` 则 `mod retrieval;` |
| `app/src/types.ts` / `api.ts` / `pages/SettingsPage.tsx` | （可选）开关 UI |
| `AGENTS.md` / `docs/ARCHITECTURE.md` | 记录 pipeline 架构；更新关于 function-calling 的过时说明与 flash pitfall（真因＝tools 与 prefix 冲突） |

**不动**：`db.rs`、`citations.rs`、`pack.rs`、`finalize_project_markdown` 及后处理、文件存储、content pack。

---

## 8. 向后兼容

- 旧 `ai_agent_sessions` 可能含 tool 消息：pipeline 模式读取 `prior_messages` 时**只取文本轮次**（复用 `strip_tool_history`），或直接忽略（pipeline 每次 Phase A/C 都是无状态调用，可不依赖 prior_messages）。
- 会话 UI 重建（`conversation_turns_from_agent_session` 等）只读 user 文本轮次，已兼容。

---

## 9. 测试计划（实施 Agent 必须全绿）

**单元测试（`cargo test`）**
- [ ] `search_pack`/`list_paragraphs`/`read_paragraph`：用 fixtures，断言命中与去重（迁移自现有 `execute_pack_tool` 测试）。
- [ ] `RetrievalPlan` 解析容错：纯 JSON / ```json 包裹 / 含多余文本 / 非法 → 回退到 `queries=[question]`。
- [ ] `gather_evidence`：去重、排序、条数与字符预算上限生效。
- [ ] **消息形态断言（关键）**：构造 Phase A/C 的 messages，断言 **无任何 `tools` 字段、无 `tool_calls`、无 `tool` 角色**，且 `payload` 不含 `tools` 键。
- [ ] `build_writer_system_prompt`：不含"search_local_pack/get_pack_paragraph 工具"字样，含"检索证据"指引与分隔符。

**端到端回归（人工/脚本）**
- [ ] 用 `tools/pack-builder/tests/fixtures` 的样例问题跑 create + continue，对比输出：结论明确、引用来自证据、格式合规、**无超长英文**。
- [ ] 对照旧 `agent` 模式，确认引用准确性与召回不降。

**真实联调（用户侧）**
- [ ] `deepseek-v4-flash` + `/v1`：create 与 follow-up **均不再报 prefix not found**。
- [ ] 同时验证 `deepseek-chat` / `deepseek-v4-pro` / OpenAI 兼容端点正常。

**门禁**：`pnpm test` + `cargo test` 全绿；无新增编译告警。

---

## 10. 验收标准（Definition of Done）

1. follow-up 在 `deepseek-v4-flash`+`/v1` 下不再出现 `prefix not found`（真实联调通过）。
2. 任何路径下发出的请求**都不含 `tools`/`tool_calls`/`tool`**（有单测断言）。
3. 生成/追问质量不低于旧 agent 模式（回归对比）。
4. `generation_mode` 默认 `pipeline`，`agent` 可回退。
5. 文档更新；测试全绿；版本 bump + 发布（沿用 `release-app.yml`）。

---

## 11. 实施步骤（建议顺序，带检查点）

1. **任务 1**：抽检索原语（§5.1）+ 单测 → checkpoint：`cargo test` 绿。
2. **任务 2**：`RetrievalPlan` + `plan_retrieval`（§5.2）+ 解析容错单测。
3. **任务 3**：`gather_evidence`（§5.3）+ 预算/去重/排序单测。
4. **任务 4**：`build_writer_system_prompt`（§5.5）+ `write_note`（§5.4）+ 消息形态断言单测。
5. **任务 5**：`run_standards_pipeline`（§5.6）+ `generation_mode` 开关接线（§6）。
6. **任务 6**：端到端回归（§9）+ 真实联调（用户协助）。
7. **任务 7**：文档更新 + 版本 bump + 发布。
8. **任务 8（一个周期后）**：删除旧 `agent` 模式与 `pack_agent_tools`/工具循环死代码。

---

## 12. 风险登记

| 风险 | 应对 |
|------|------|
| Phase A 的 JSON 不规范 | 宽松解析 + 回退到问题原文检索；永不中断 |
| 确定性检索召回 < Agent 多步检索 | 多 query + standards 列段落 + 字符预算调参；用回归集校准；保留 agent 回退 |
| Phase C 上下文偏大（Continue 全文 + 证据） | 证据预算上限 + `chat_completion_with_recovery` 上下文降级兜底 |
| flash 指令遵循弱（粘贴长英文） | `finalize_project_markdown` 的引用截断（≤600 字）已兜底 |
| 旧会话含 tool 消息 | pipeline 无状态调用，不依赖；或 `strip_tool_history` 过滤 |

---

## 13. 回滚

- 出问题：将 `ai.generation_mode` 设为 `"agent"` 即恢复旧行为（开关级回滚）。
- 代码级：pipeline 与 agent 并存一个版本周期，确认稳定后再删旧代码（任务 8）。

---

### 附：给用户的话
1. **现在就能试**：把模型从 `deepseek-v4-flash` 换成 `deepseek-v4-pro` 或 `deepseek-chat`，很可能立即不再报错（缓解）。
2. **根治**：批准本工作单后，由实施 Agent 按 §11 执行 tools-free 重构，从架构上消除该错误，且效果不降、可回退。
