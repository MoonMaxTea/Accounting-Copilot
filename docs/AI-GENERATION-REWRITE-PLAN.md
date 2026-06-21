# AI 生成功能重构计划：彻底消除 "prefix not found"（及同类工具协议错误）

> 状态：**计划，待批准后实施**。本文档回应「follow-up 仍报 prefix not found，是否重构更快」的问题。
>
> 结论先行：**是。** 但建议先用 ~10 分钟做 Phase 0 诊断（很可能是配置问题，能立刻解决）；若诊断未命中，则按本计划做一次**针对性重构**（移除 function-calling，改为 Rust 确定性检索 + 纯对话消息）。这是一次**编排层重构**，复用现有全部检索与后处理能力，**不是整个功能从零重写**，效果不降，且能一次性消除整类错误。

---

## 一、评估：为什么重构（编排层）比继续打补丁更快、更可靠

### 1.1 为什么已经修了 3 个版本还没好（0.1.9 / 0.1.10 / 0.1.11）

| 版本 | 改动 | 为什么没根治 |
|------|------|--------------|
| 0.1.9 | 命中 `"prefix not found"` 后剥离工具历史重试 | DeepSeek 真实报错文案不含该字面量，闸门不触发 |
| 0.1.10 | 放宽「何时重试」 | 闸门仍是同一个字符串匹配，依然不触发 |
| 0.1.11 | 播种时 `strip_tool_history`，不再重放上一轮工具历史；放宽错误识别 | 仍**对每个请求附带 `tools`**，且当前轮仍会实时产生 `tool_calls`/`tool` 消息——只要走 function-calling 协议，DeepSeek 兼容端点/特定模型仍可能拒绝 |

**根本问题有两层：**
1. **架构层**：生成流程依赖 LLM function-calling（多轮 `tools` + `tool_calls` + `tool` 角色消息）。这是 DeepSeek（尤其 `deepseek-reasoner` 与 `/beta` 端点）和很多国内 OpenAI 兼容网关最容易出问题的部分。
2. **工程层**：我们一直**没有抓到真实失败请求与原始错误体**，三次都是「盲修」。`"prefix not found"` 这个具体字面量不在 DeepSeek 官方文档的标准措辞里，强烈指向**特定模型（reasoner）或网关/`/beta` 端点**。

### 1.2 结论

- **继续打补丁**：只要还用 function-calling，就要逐个适配每家厂商/网关对工具消息、消息顺序、prefix、缓存的怪异要求——属于「打地鼠」，不可收敛。
- **针对性重构（推荐）**：把检索从「LLM 用工具自己调」改为「Rust 里确定性地调用现有检索函数」，对 LLM 只发送**纯 `system/user/assistant` 文本消息、完全不带 `tools`**。这样：
  - 永远不会出现 `tool_calls`/`tool` 角色消息 → **整类 prefix/工具协议错误从源头消失**（与厂商/网关/模型无关，`deepseek-reasoner` 也能用）；
  - 复用现有检索原语（`db::search_standards`、`citations::*`、`execute_pack_tool` 的逻辑），**工作量可控**；
  - 更便宜、更快、更可预测（无多轮工具往返）。

> 风险提示：朴素的「一次性单轮检索」可能弱于 Agent 的多步检索。因此本计划保留**多步检索**，只是把「决定搜什么」和「读取段落」拆成 **不带工具的两阶段**，**效果不降**（详见 §三）。

---

## 二、Phase 0：先诊断（强制，~10 分钟，可能直接解决）

在动手重构前，必须先确认真因，避免第 4 次盲修。

- [ ] **确认用户当前配置**（设置 → AI 写作）：
  - **模型**：是否为 `deepseek-reasoner`？该模型对 function-calling 支持差，且要求「最后一条必须是 user / 带 prefix 的 assistant」。若是 → 换 `deepseek-chat` 或 `deepseek-v4-pro` 很可能立即修复。
  - **Base URL**：是否为 `https://api.deepseek.com/beta`？`/beta` 会启用 prefix-completion（FIM）行为，可能直接产生 `prefix not found`。若是 → 改为 `https://api.deepseek.com`（或 `/v1`）很可能立即修复。
  - 是否经第三方网关（one-api / new-api 等）？网关可能改写错误或自带 prefix 缓存。
- [ ] **抓真实证据**：临时在 `request_chat_completion` 失败分支把「发出的 messages + 原始响应体」写入本地诊断文件（`_diag_last_request.json`，仅本地、用后即删），复现一次 follow-up，拿到**确切的失败请求与厂商原文**。
- [ ] **快速实验**：加一个临时开关，follow-up 时**不附带 `tools`**（`tools=[]`）发一次单轮请求，看是否还报错。
  - 若「不带 tools 就不报错」→ 证实是 function-calling 协议问题 → 直接进入 §三 重构。
  - 若「仍报错」→ 是更底层（端点/网关/鉴权/缓存）问题 → 按诊断文件定位，可能无需重构。

> Phase 0 的产出决定后续：很可能 §二 就解决了；若没有，§三 重构是高置信度的终极方案。

---

## 三、目标架构：无工具（tools-free）的确定性检索 + 纯对话

把当前「Agent 自驱工具循环」替换为**固定三阶段管道**，三次调用都是**纯文本消息、绝不带 `tools`**：

```
Phase A 规划（1 次 chat，无 tools）
  输入: system(精简) + user(问题/事实 [+ Continue: 现有文档])
  要求模型输出 JSON：{ "queries": [...], "standards": [...] }
  → 在 Rust 中解析（解析失败则回退到用问题原文做检索）

Phase B 检索（纯 Rust，无 LLM）
  用 Phase A 的 queries/standards 调用现有函数：
    - db::search_standards (FTS5 + bm25 排序)
    - execute_pack_tool 内的 registry 兜底逻辑
    - load_paragraphs / resolve_citation → 读取关键段落全文(4000字)
  组装「检索证据包」(标准/段落/snippet_en)，去重、按相关性排序、限量

Phase C 写作（1 次 chat，无 tools）
  输入: system(身份+编写规范+铁律) + user(问题/事实 + 证据包 [+ Continue: 现有文档])
  → 直接输出 <<<PROJECT_NAME>>> / <<<MARKDOWN>>> 区块
  → 复用现有 finalize_project_markdown（截断引用/frontmatter/日志/免责声明…）
```

**消息形态**永远是 `[system, user]` 或 `[system, user, assistant, user]`，**无 `tools`/`tool_calls`/`tool`**。这对 OpenAI / DeepSeek（含 reasoner）/ 各类网关都安全。

### 为什么效果不降
- 仍是**多步检索**（先让模型规划查询，再确定性检索，再写作），保留了 Agent「先定位再细读」的优点。
- 仍**完整读取段落全文**（4000 字）供写作，证据质量不变。
- 检索更**可控、可观测**（命中、排序、数量都在 Rust 里，可记录可调），反而比「模型随机调工具」更稳。
- 失败模式更少：无工具往返 → 无多轮放大、无协议错误、token 更省、更快。

---

## 四、详细工作计划（实施阶段）

> 实施前置：Phase 0 完成且确认需要重构。

### 任务 1：抽出可复用的检索原语（重构准备，低风险）
- [ ] 将 `ai_agent.rs::execute_pack_tool` 内三类检索逻辑抽为**纯 Rust 函数**（不依赖 LLM）：
  - `search_pack(content_dir, query, limit) -> Vec<Hit>`
  - `list_paragraphs(content_dir, standard_id) -> Vec<Citation>`
  - `read_paragraph(content_dir, citation) -> Option<CitationTarget>`（已有 `resolve_citation`）
- 涉及：`app/src-tauri/src/ai_agent.rs`（或新建 `retrieval.rs`）、复用 `db.rs`/`citations.rs`/`pack.rs`
- 风险：低（搬运现有逻辑 + 单元测试覆盖）

### 任务 2：Phase A 规划调用（无 tools）
- [ ] 新增 `plan_retrieval(ai, question, facts, existing) -> RetrievalPlan`
  - 一次 `chat`（`tools` 不传），prompt 要求输出严格 JSON
  - Rust 端宽松解析（容错：代码块包裹、多余文本）；解析失败 → 回退：`queries=[question]`
- 涉及：`ai_agent.rs`、`models.rs`（`RetrievalPlan`）
- 风险：模型 JSON 不规范 → 必须有回退；已设计

### 任务 3：Phase B 确定性检索 + 证据组装
- [ ] `gather_evidence(content_dir, plan) -> EvidencePack`
  - 跑查询 → 合并/去重 → bm25 排序 → 取 top-N 标准
  - 对关键标准 `list_paragraphs` + `read_paragraph` 取全文
  - 限制总量（条数/字符预算）防止 Phase C 超长
- 涉及：`ai_agent.rs`/`retrieval.rs`
- 风险：召回不足 → top-N 与字符预算需可调；用现有人工标注问题回归

### 任务 4：Phase C 写作调用（无 tools）+ 复用后处理
- [ ] `write_note(ai, system, question, facts, evidence, existing) -> raw`
  - 一次 `chat`（无 tools），证据包以中文小节嵌入 user 内容
  - 复用 `parse_ai_response` + `finalize_project_markdown`（引用截断、frontmatter、日志、禁语、免责声明）
- 涉及：`ai_agent.rs`、`ai.rs`
- 风险：低（后处理已稳定）

### 任务 5：接线 + 移除工具循环
- [ ] `run_standards_agent` 改为：Phase A → B → C；删除 `MAX_TOOL_ROUNDS` 工具循环、`pack_agent_tools`、`tool_choice`、`call_chat_with_tools*` 中的 `tools` 注入
- [ ] 保留 `chat_completion_with_recovery` 仅作通用错误分级/上下文降级（不再涉及工具）
- [ ] Continue 模式：现有文档进 user 内容（已是如此）；不再有任何工具消息
- 涉及：`ai_agent.rs`、`commands.rs`（会话持久化可简化为纯文本轮次）
- 风险：会话结构变化 → 兼容旧 `ai_agent_sessions`（读取时忽略残留工具消息，已有 `strip_tool_history` 可复用）

### 任务 6：可观测性（顺带补上，避免再次盲修）
- [ ] 失败时（可选开关，默认关）落地诊断：发出的 messages 概要 + 厂商原始错误 + 阶段
- 涉及：`ai_agent.rs`、`SettingsPage.tsx`（开关）
- 风险：低；默认关闭、仅本地

### 任务 7：测试与回归
- [ ] 单测：检索原语、JSON 计划解析容错、证据组装去重/排序/限量、消息形态断言（**永不含 tools/tool_calls/tool**）
- [ ] 用现有样例项目（fixtures）做端到端质量回归，确认结论/引用质量不降
- [ ] `cargo test` + `pnpm test` 全绿
- 涉及：`ai_agent.rs` tests、`ai.rs` tests

### 任务 8：灰度与发布
- [ ] 加配置开关 `ai.generation_mode = "pipeline" | "agent"`，默认 `pipeline`；保留 `agent` 作为可回退（一个版本周期后再删旧代码）
- [ ] 文档更新（AGENTS.md / ARCHITECTURE.md）：记录新管道、删除关于 function-calling 的过时说明
- [ ] 版本 bump + tag 发布；按现有 `release-app.yml` 出四平台安装包

---

## 五、范围与复杂度（技术口径，非工期）

- **改动集中在** `ai_agent.rs`（编排重写）+ 少量 `ai.rs`/`models.rs`/`commands.rs`/`config.rs`/`SettingsPage.tsx`。
- **复用**：`db.rs`、`citations.rs`、`pack.rs`、`finalize_project_markdown` 全部不动或微调。
- **删除**：工具定义与多轮工具循环（净减代码）。
- **可回退**：保留 `agent` 模式开关一个周期。
- **风险点**：Phase A 的 JSON 稳定性（已设计回退）、Phase B 的召回调参（用回归集校准）。整体**低-中风险**，且**一次性消除整类协议错误**。

---

## 六、给用户的两条路（按推荐顺序）

1. **先做 Phase 0（最快）**：很可能你把模型设成了 `deepseek-reasoner`，或 Base URL 用了 `https://api.deepseek.com/beta`。改成 `deepseek-chat`/`deepseek-v4-pro` + 标准 Base URL，可能立刻不再报错。请把你的**模型名、Base URL、以及报错完整原文**发我，我可据此 5 分钟内确认。
2. **若 Phase 0 未命中或你希望一劳永逸**：批准本计划，我按 §四 执行 tools-free 重构，从架构上根除该类错误，效果不降、成本更低。

> 红线不变：重构默认不降低核心检索/输出效果；新模式可灰度、可回退；旧 `agent` 模式保留一个版本周期后再移除。
