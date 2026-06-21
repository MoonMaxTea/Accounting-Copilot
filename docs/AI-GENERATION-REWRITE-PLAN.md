# 重构工作单（Engineering Handoff）：Tools-free 三阶段生成管道

> 状态：**已实施（pipeline 默认）**。详见 `docs/AI-GENERATION-REWRITE-PLAN.md`。
> 负责人视角（Manager）编写：下面每一步都写明「改哪个文件、加什么函数/结构、消息长什么样、怎么测、验收标准」，实施 Agent 照做即可，无需再猜。

---

## 0. 给实施 Agent 的 TL;DR

- **要做的事**：把 AI 生成笔记的编排从「LLM function-calling 多轮工具循环」改为「**Rust 确定性检索 + 不带 `tools` 的纯对话三阶段管道**」。
- **为什么（重构目标，非 bug 补丁）**：
  - 使 **create / follow-up（Continue）每次 LLM 调用形态一致**：无状态 `[system, user]`，永不发送 `tools`/`tool_calls`/`tool` 消息。
  - 将检索从「依赖模型多轮探索」升级为「**可测试、可观测的确定性管道**」，与 provider 的 function-calling 限制解耦。
  - 现场已验证：换模型（flash / pro / hy3preview 等）不能根治 follow-up 失败；必须从架构上消除对 function-calling 与多轮历史的依赖。
- **红线**：不得降低核心检索/输出效果；新模式用配置开关灰度，旧 `agent` 模式保留一个版本周期可回退。
- **不要做**：不要继续在 function-calling 上打补丁；不要把本次工作当作「修某个模型的 bug」。

---

## 1. 背景与动机

### 1.1 现状问题

当前 `run_standards_agent` 使用最多 12 轮 function-calling 循环。该模式存在结构性缺陷：

| 问题 | 说明 |
|------|------|
| create / follow-up 行为不一致 | follow-up 播种 `prior_messages`（含大段 assistant 输出），与 create 的干净 `[system, user]` 不同 |
| 不可测试 | 检索路径由模型随机决定，难以回归 |
| provider 兼容性差 | 多轮 `tools` + 历史重放在 DeepSeek 及兼容网关（含 pro、hy3preview 等）上均可触发 `prefix not found` |
| token 成本高 | 会话可累积 80 条消息（含 4000 字符 tool 结果），follow-up 再叠加全文文档 |

### 1.2 排除项（不再作为重构依据）

- ❌ 不是「仅 flash 模型」的问题（用户已验证 pro、hy3preview 同样失败）。
- ❌ 不是「换 pro/chat 就能缓解」——换模型不是重构的替代方案。
- ❌ 不是在现有 agent 循环上继续打补丁（已失败多次）。

### 1.3 重构原则

1. **每次 LLM 调用** = 无状态 `[system, user]`，payload **永不出现** `tools` / `tool_choice`。
2. **pipeline 不读取 `prior_messages`**；Continue 上下文仅来自 `question` + `facts` + `existing_markdown` + 本轮新检索证据。
3. **检索在 Rust 中确定性完成**；LLM 只负责规划（可选增强）与写作。
4. **后处理链不变**：`parse_ai_response` → `finalize_project_markdown` 全复用。

---

## 2. 目标与非目标

**目标**

- 生成 / 追问（Continue）全流程**永不发送 `tools`/`tool_choice`**，**永不出现 `tool_calls`/`tool` 角色消息**。
- 每次 LLM 调用都是**无状态、最小化**的纯对话（`[system, user]`），不重放历史。
- 保持检索质量与现有后处理（引用截断、frontmatter、日志、免责声明）。
- create 与 follow-up **架构同构**，对任意配置的模型/网关行为一致。

**非目标**

- 不改 UI 交互、不改文件存储格式、不改 content pack。
- 不引入向量检索（那是 P2，见 `docs/P2-PLAN.md`）。
- 不删除旧 `agent` 模式（先保留作回退，一个版本周期后删除）。

---

## 3. 目标架构：tools-free 三阶段管道

```
generate_project_document / continue_project_document  (commands.rs，不变)
  → ai::generate_and_save_project / continue_and_update_project  (ai.rs，仅改内部调用)
      → run_standards_pipeline(...)   ← 新函数（ai_pipeline.rs）
          Phase 0  derive_plan_from_question()   纯 Rust 规则层（始终运行）
          Phase A  plan_retrieval()              1 次 chat，无 tools，增强检索计划（失败可跳过）
          Phase B  gather_evidence()             纯 Rust，无 LLM
          Phase C  write_note()                  1 次 chat，无 tools，输出最终 Markdown
      → parse_ai_response + finalize_project_markdown   (ai.rs，不变，复用)
```

**模块划分（必须，不要全塞进 `ai_agent.rs`）**

| 文件 | 职责 |
|------|------|
| `retrieval.rs` | 数据结构、`search_pack`、`list_paragraphs`、`read_paragraph`、`gather_evidence`、`derive_plan_from_question` |
| `ai_pipeline.rs` | `plan_retrieval`、`write_note`、`build_writer_system_prompt`、`run_standards_pipeline` |
| `ai_agent.rs` | 保留 `run_standards_agent`（回退）、共享 `request_chat_plain` / `request_chat_completion` |

每个 LLM 调用的消息形态（**唯二**两种，均无 tools）：

- Phase A：`[{system: planner}, {user: 问题+事实(+Continue: 文档摘要)}]`
- Phase C：`[{system: writer}, {user: 问题+事实+【检索证据】(+Continue: 现有文档，按长度分级)}]`

> 关键：**不拼接 `prior_messages`、不带 tools**。create 与 follow-up 走同一管道，仅 `existing_markdown` 与证据预算不同。

---

## 4. 数据结构（Rust，新增于 `retrieval.rs`）

```rust
/// Phase A / 规则层产出：检索计划
#[derive(Debug, Deserialize, Default, Clone)]
pub struct RetrievalPlan {
    /// 用于 FTS5/registry 检索的查询词（英文/中文皆可），1-6 条
    #[serde(default)]
    pub queries: Vec<String>,
    /// 模型/规则提取的准则 ID（如 "IFRS 11" / "ASC 842"）
    #[serde(default)]
    pub standards: Vec<String>,
}

/// FTS5 / registry 准则级命中（不是段落级）
#[derive(Debug, Clone)]
pub struct PackSearchHit {
    pub standard_id: String,
    pub title: String,
    pub snippet: String,
    pub pack_path: String,
    /// 越小越相关（FTS5 bm25）；registry 兜底命中可设较大默认值
    pub rank: f64,
}

/// Phase B 组装的单条证据（段落级）
#[derive(Debug, Clone, Serialize)]
pub struct EvidenceItem {
    pub citation: String,      // 如 "IFRS 11 §7"
    pub standard_id: String,
    pub title: String,
    pub snippet_en: String,    // 段落原文（单条上限见 §6 预算）
}

/// Phase B 的产出：注入 Phase C 的证据包
#[derive(Debug, Default, Serialize)]
pub struct EvidencePack {
    pub items: Vec<EvidenceItem>,
}
```

---

## 5. 函数清单（签名 + 职责 + 复用点）

### 5.0 Phase 0：规则层检索计划（纯 Rust，始终运行）

```rust
/// 从问题/事实中用正则提取准则 ID，生成 baseline 查询词。不调用 LLM。
pub fn derive_plan_from_question(question: &str, facts: Option<&str>) -> RetrievalPlan;
```

- 正则提取：`IFRS \d+`、`IAS \d+`、`ASC \d+(-\d+)*` 等 → `standards`
- `queries` = `[question.trim()]` + 从 facts 拆出的关键词（若有）
- **永不失败**；作为 Phase A 的回退，也与 LLM 计划合并（并集去重）

```rust
pub fn merge_retrieval_plans(base: &RetrievalPlan, extra: &RetrievalPlan) -> RetrievalPlan;
```

### 5.1 检索原语（从现有 `execute_pack_tool` 抽出，放 `retrieval.rs`）

```rust
/// FTS5 全文 + registry 兜底 → 准则级命中
pub fn search_pack(
    content_dir: &Path,
    allow_legacy: bool,
    query: &str,
    limit: u32,
) -> Vec<PackSearchHit>;

/// 列出某准则已索引段落 citation（含 dedup，见 §5.3）
pub fn list_paragraphs(
    content_dir: &Path,
    allow_legacy: bool,
    standard_id: &str,
) -> Vec<String>;

/// 读取段落全文（复用 citations::resolve_citation；UTF-16 安全截断）
pub fn read_paragraph(
    content_dir: &Path,
    allow_legacy: bool,
    citation: &str,
    max_chars: usize,
) -> Option<EvidenceItem>;
```

- 复用：`db::search_standards`、`pack::load_registry`、`citations::load_paragraphs`、`citations::resolve_citation`
- **原样迁移** `execute_pack_tool` 里 `search_local_pack` 的 registry 模糊兜底逻辑
- `search_pack` 返回 `PackSearchHit`（准则级），**不是** `EvidenceItem`；段落级证据由 `gather_evidence` 桥接

### 5.2 Phase A：LLM 增强规划（1 次 chat，无 tools，可选增强）

```rust
pub async fn plan_retrieval(
    ai: &AiConfig,
    question: &str,
    facts: Option<&str>,
    doc_summary: Option<&str>,   // Continue 时：文档摘要（见 §5.4 裁剪函数）
) -> RetrievalPlan;
```

- 调 `request_chat_plain(ai, &[system_planner, user])`
- system_planner（精简常量）：**只输出 JSON**，形如 `{"queries":["..."],"standards":["IFRS 11"]}`
- 解析容错：剥离 ` ```json ` 代码块、截取第一个 `{...}`；失败 → 返回空 plan（不中断）
- 最终计划：`merge_retrieval_plans(&derive_plan_from_question(...), &llm_plan)`
- **绝不因 Phase A 失败而中断**

### 5.3 Phase B：检索 + 证据组装（纯 Rust）

```rust
pub fn gather_evidence(
    content_dir: &Path,
    allow_legacy: bool,
    plan: &RetrievalPlan,
    budget: EvidenceBudget,
) -> EvidencePack;
```

```rust
pub struct EvidenceBudget {
    pub max_items: usize,
    pub max_item_chars: usize,
    pub max_total_chars: usize,
}

pub const CREATE_EVIDENCE_BUDGET: EvidenceBudget = EvidenceBudget {
    max_items: 8,
    max_item_chars: 1500,
    max_total_chars: 8000,
};

pub const CONTINUE_EVIDENCE_BUDGET: EvidenceBudget = EvidenceBudget {
    max_items: 5,
    max_item_chars: 1500,
    max_total_chars: 5000,
};
```

**流程**

1. 对每个 `query` 调 `search_pack`（limit 10）
2. 对每个 `standard` 调 `list_paragraphs` + 段落选择（见下）
3. 合并去重（按 `standard_id` + `citation`）
4. 按 `PackSearchHit.rank` 排序（registry 兜底排后）
5. 截断到 `budget` 上限
6. 若证据为空：返回空包（Phase C 仍可写作，按规范注明「本地准则库未收录」）

**段落选择算法（必须按此实现）**

对每个 `standard_id`：

1. `list_paragraphs` → 加载 `paragraphs.json` 条目
2. 按 `(paragraph, char_start DESC)` 排序后 `dedup`（复用现有逻辑，跳过 ASC amendment metadata 的低 `char_start` 条目）
3. 用 `plan.queries` 对每条 `snippet_en` 做简单关键词命中打分（query 词在 snippet 中出现则 +1）
4. 取得分最高的 **top 2** 段落，`read_paragraph`
5. 若无 query 命中：跳过 "00 Status" / 纯 amendment 元数据段，取实质性段落 top 2

对每个 `PackSearchHit`（FTS/registry 准则级命中）：

1. 若 hit 已含可解析 citation → 直接 `read_paragraph`
2. 若仅 `standard_id` → 走上述 standard 段落选择流程

### 5.4 Phase C：写作（1 次 chat，无 tools）

```rust
pub async fn write_note(
    ai: &AiConfig,
    content_dir: &Path,
    mode: AgentMode,
    question: &str,
    facts: Option<&str>,
    evidence: &EvidencePack,
    existing_markdown: Option<&str>,
) -> Result<String, String>;
```

- system_writer：`build_writer_system_prompt(content_dir)?`
- user 内容顺序（固定模板）：
  1. `用户问题：…`
  2. `补充事实：…`（可选）
  3. `【检索证据】` + 每条 `### {citation}\n{snippet_en}`
  4. Continue 时：`当前项目笔记：\n{truncated_doc}`（见分级策略）
- 调 `request_chat_plain(ai, &[system_writer, user])`
- 返回 raw（含 `<<<PROJECT_NAME>>>` / `<<<MARKDOWN>>>` 区块）

**Continue 文档分级策略（写入 `retrieval.rs` 或 `ai_pipeline.rs`）**

```rust
/// Phase A 用：前 ~1500 字符摘要（TL;DR + 首段）
pub fn summarize_for_planning(markdown: &str) -> String;

/// Phase C 用：按长度分级传入文档
pub fn truncate_for_continue(markdown: &str, question: &str) -> String;
```

| 文档长度 | Phase C 传入内容 |
|---------|-----------------|
| ≤ 12_000 字符 | 全文 |
| 12_000 – 24_000 | frontmatter + TL;DR + 各 `##` 标题行 + 结论段 |
| > 24_000 | 上述 + 与 `question` 关键词匹配的 `##` 章节全文 |

### 5.5 Prompt 架构（共享骨架，避免分叉）

```rust
/// 身份、分析方法、铁律、输出格式、自检清单（不含工具/证据来源指引）
fn build_core_writing_prompt(content_dir: &Path) -> Result<String, String>;

/// agent 回退用：core + 工具工作流
pub fn build_agent_system_prompt(...) -> Result<String, String>;

/// pipeline 用：core + 「所有依据来自 user 提供的【检索证据】」
pub fn build_writer_system_prompt(content_dir: &Path) -> Result<String, String>;
```

- 复用 `load_writing_spec`（编写规范 + SKILL）
- `build_writer_system_prompt`：**删除**所有工具名引用，**替换为**：
  > 所有准则依据来自下方 user 提供的【检索证据】；证据未覆盖则如实注明，禁止编造。
- 保留：≤4 句英文引用、提炼表、中文精炼、`<<<PROJECT_NAME>>>`/`<<<MARKDOWN>>>` 分隔符、诊断标记

### 5.6 LLM 请求契约

```rust
/// 重构专用：保证 payload 永不包含 tools / tool_choice
pub async fn request_chat_plain(
    ai: &AiConfig,
    messages: &[ApiChatMessage],
) -> Result<ApiChatMessage, String>;
```

- 内部构建 payload 时**不设置** `tools` / `tool_choice` 键（不是传空数组）
- Phase A、Phase C **必须**经此函数调用
- 可复用 `classify_provider_error`；上下文溢出时 Phase C 可降级 `truncate_for_continue` 后重试一次

### 5.7 顶层编排

```rust
pub async fn run_standards_pipeline(
    app_handle: Option<&tauri::AppHandle>,
    content_dir: &Path,
    ai: &AiConfig,
    input: AgentRunInput<'_>,
) -> Result<AgentRunOutput, String>;
```

**硬性规则：`input.prior_messages` 必须忽略**（不 strip、不播种、不传入 Phase A/C）。

执行顺序：

1. `baseline = derive_plan_from_question(question, facts)`
2. emit `searching`；`plan = merge(baseline, plan_retrieval(...).await 或 空)`
3. Phase B：`gather_evidence`（Create 用 `CREATE_EVIDENCE_BUDGET`，Continue 用 `CONTINUE_EVIDENCE_BUDGET`）
   - 每处理一个 query / citation：emit `searching` + activity_log（`kind: "retrieval"`）
4. emit `generating`；Phase C：`write_note(...)`
5. 组 `AgentRunOutput`：
   - `raw_response` = Phase C 输出
   - `session_messages` = **仅追加本轮** 1 条 user（问题文本）+ 1 条 assistant（最终文本），**无 tool 消息**
   - `activity_log` = 检索记录 + 「已生成/更新」

---

## 6. 配置开关与接线

`app/src-tauri/src/config.rs` → `AiConfig` 增加：

```rust
#[serde(default)]
pub generation_mode: Option<String>,   // "pipeline"(默认) | "agent"
```

`ai.rs` 的 `generate_and_save_project` / `continue_and_update_project` 内：

```rust
let output = match ai.generation_mode.as_deref() {
    Some("agent") => run_standards_agent(app, content_dir, ai, input).await?,
    _             => run_standards_pipeline(app, content_dir, ai, input).await?,
};
```

- 后续步骤（`parse_ai_response` / `finalize_project_markdown` / 保存）**完全不变**
- **Settings → Advanced**：暴露 `generation_mode` 开关（重构期建议实现，便于 A/B 与回滚）

---

## 7. 改动文件清单（逐文件）

| 文件 | 改动 |
|------|------|
| `app/src-tauri/src/retrieval.rs` | **新建** §4 结构、§5.0–5.3、文档裁剪函数 |
| `app/src-tauri/src/ai_pipeline.rs` | **新建** §5.2、5.4–5.7 |
| `app/src-tauri/src/ai_agent.rs` | `request_chat_plain`、抽取 `build_core_writing_prompt`；保留 `run_standards_agent` |
| `app/src-tauri/src/ai.rs` | 按 `generation_mode` 选择编排 |
| `app/src-tauri/src/config.rs` | `AiConfig.generation_mode` |
| `app/src-tauri/src/lib.rs` | `mod retrieval; mod ai_pipeline;` |
| `app/src/types.ts` / `api.ts` / `pages/SettingsPage.tsx` | Advanced 开关 |
| `AGENTS.md` / `docs/ARCHITECTURE.md` | 记录 pipeline 架构 |

**不动**：`db.rs`、`citations.rs`、`pack.rs`、`finalize_project_markdown`、文件存储、content pack、UI 交互流程。

---

## 8. 向后兼容

- 旧 `ai_agent_sessions` 可能含 tool 消息：**pipeline 模式完全不读取 `prior_messages`**，旧数据不影响新管道。
- 新 pipeline 运行后，`session_messages` 只累积纯文本轮次，旧 tool 行随时间被新轮次替换。
- 会话 UI（`conversation_turns_from_agent_session` 等）只读 user 文本轮次，已兼容。
- `generation_mode = "agent"` 时行为与当前版本一致（回退）。

---

## 9. 测试计划（实施 Agent 必须全绿）

### 单元测试（`cargo test`）

- [ ] `derive_plan_from_question`：从中文/英文问题提取 IFRS/IAS/ASC ID
- [ ] `search_pack` / `list_paragraphs` / `read_paragraph`：fixtures 断言命中、dedup、ASC metadata 跳过
- [ ] `gather_evidence`：去重、排序、Create/Continue 预算上限、段落选择算法
- [ ] `RetrievalPlan` 解析容错：纯 JSON / ` ```json ` 包裹 / 非法 → 回退到规则层 baseline
- [ ] `truncate_for_continue` / `summarize_for_planning`：分级裁剪边界
- [ ] **`request_chat_plain` 消息形态断言**：payload 不含 `tools` / `tool_choice` 键；messages 无 `tool` 角色
- [ ] `build_writer_system_prompt`：不含工具名；含「检索证据」指引与分隔符
- [ ] `build_core_writing_prompt` 被 agent 与 writer 共用（结构断言）

### 质量回归集（10–15 题，create + continue 链）

| 类别 | 示例 |
|------|------|
| 单准则简单题 | IFRS 11 合营安排 |
| 多准则对比 | IFRS 15 vs ASC 606 收入确认差异 |
| ASC metadata 敏感 | ASC 718 股份支付（验证跳过 amendment 表） |
| 中文模糊表述 | 「关联方交易披露」类无明确准则号的问题 |
| Continue 更新 | 同文档连续 3 轮追问，验证「更新」而非无关重写 |

每题对比 `agent` vs `pipeline`（pipeline 为验收主线）：

- 引用段落来自 pack 证据
- blockquote ≤ 4 句英文
- 有提炼表
- 无超长英文 dump（`finalize` 截断兜底）

### 真实联调

- [ ] 用户环境：flash / pro / hy3preview（同一 Base URL）create + follow-up ×3 无 `prefix not found`
- [ ] OpenAI 兼容端点正常

**门禁**：`pnpm test` + `cargo test` 全绿；无新增编译告警。

---

## 10. 验收标准（Definition of Done）

1. **任意模型** follow-up 不再出现 `prefix not found`（用户环境联调通过）。
2. pipeline 路径下所有 LLM 请求经 `request_chat_plain`，payload **不含** `tools`/`tool_choice`（有单测断言）。
3. 质量回归集通过：pipeline 输出不低于 agent（引用准确、格式合规、continue 正确更新）。
4. `generation_mode` 默认 `pipeline`；Settings Advanced 可切 `agent` 回退。
5. `AGENTS.md` / `ARCHITECTURE.md` 更新；测试全绿；版本 bump + 发布。

---

## 11. 实施步骤（建议顺序，带检查点）

1. **任务 1**：新建 `retrieval.rs` — `derive_plan_from_question`、`search_pack`、`list_paragraphs`、`read_paragraph` + 单测 → `cargo test` 绿
2. **任务 2**：`gather_evidence`（含 §5.3 段落选择算法）+ 预算单测
3. **任务 3**：`request_chat_plain` + `build_core_writing_prompt` / `build_writer_system_prompt` + 消息形态单测
4. **任务 4**：新建 `ai_pipeline.rs` — `plan_retrieval`、`truncate_for_continue`、`write_note`、`run_standards_pipeline`
5. **任务 5**：`generation_mode` 接线 + Settings Advanced 开关
6. **任务 6**：质量回归集 + 真实联调（用户协助）
7. **任务 7**：文档更新 + 版本 bump + 发布
8. **任务 8（一个周期后）**：回归集持续全绿且无回滚需求 → 删除 `run_standards_agent`、`pack_agent_tools`、工具循环死代码

---

## 12. 风险登记

| 风险 | 应对 |
|------|------|
| Phase A JSON 不规范 | 规则层 `derive_plan_from_question` 始终运行；LLM 计划为增强层 |
| FTS 只返回准则级、段落选错 | §5.3 段落选择算法 + ASC dedup 单测 |
| 确定性检索召回 < Agent 多步探索 | 多 query + standards 列段落 + 预算调参；回归集校准；保留 agent 回退 |
| Continue 长文档撑爆 Phase C | `truncate_for_continue` 分级策略 + 溢出重试 |
| flash 等模型指令遵循弱 | `finalize_project_markdown` 引用截断（≤600 字）兜底 |
| pipeline 与 agent 输出风格分叉 | 共享 `build_core_writing_prompt`；同一后处理链 |
| 旧会话含 tool 消息 | pipeline 不读 `prior_messages`，无影响 |

---

## 13. 回滚

- 出问题：Settings → Advanced → `generation_mode = "agent"`，或 `config.json` 手动设置。
- 代码级：pipeline 与 agent 并存一个版本周期；任务 8 条件满足后再删旧代码。
