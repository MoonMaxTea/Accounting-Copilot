# P2 长期优化计划（Long-term Plan）

> 状态：**计划中，暂未实施**。本文件由技术审计（2026-06-21）产出，记录在 P0/P1 修复完成后、需要单独立项推进的架构级优化。
>
> 关联：P0/P1 已在 PR #14 落地（见 `docs/ARCHITECTURE.md` 变更日志 2026-06-21）。本计划只覆盖 **P2**。

## 背景与目标

当前 AI 分析链路是「Agent + 工具」模式：LLM 自主调用 `search_local_pack`（FTS5 + registry 兜底）、`list_standard_paragraphs`、`get_pack_paragraph` 三个工具读取本地准则库。P0/P1 已修复 Prompt 失效、Follow-up 报错、片段偏移错配、错误分级与检索排序等问题。

P2 的目标是把「检索与上下文」从**依赖模型自觉**升级为**可验证、可观测、低成本的确定性管道**，提升召回/精度、降低 token 成本，并防止文档与代码再次失配。

每一项都遵循 P0/P1 的红线：**不得影响核心功能可用性，不得削弱核心功能效果**；新增能力应可灰度、可回退。

---

## P2-1：语义检索 + 重排（RAG 升级）

**问题**：现状只有 FTS5 关键词检索 + registry 模糊兜底，召回依赖模型「想出正确的查询词」，对中文/同义表达召回弱，且无相关性精排。

**方案**
- 在 `tools/pack-builder` 构建 content pack 时，额外产出**段落级向量索引**（embedding 随 pack 发布，离线生成，运行时不联网）。
- 运行时新增检索路径：向量召回 → 与 FTS5 结果融合（RRF / 加权）→ 轻量 rerank（bm25 + 向量分数，或本地 cross-encoder）。
- 作为 `search_local_pack` 的**增强后端**，对模型透明；保留 FTS5 + registry 作为回退，确保「不削弱召回」。

**涉及**
- `tools/pack-builder/`（新增 embedding 生成、索引写出、pack-manifest schema）
- `app/src-tauri/src/db.rs` / 新模块（向量读取与融合）
- `app/src-tauri/src/ai_agent.rs::execute_pack_tool`（`search_local_pack` 接入融合检索）

**风险/约束**
- embedding 模型选型需可离线（本地 onnx 或随 pack 预计算）；不得引入运行时联网。
- pack 体积增大——需评估并可选下载。
- 必须可灰度开关，默认与现有 FTS5 结果**并集**，保证召回只增不减。

**验收**
- 召回率（人工标注集）较纯 FTS5 提升且无回退用例；
- 检索延迟在可接受范围；
- 关闭开关时行为与当前完全一致。

---

## P2-2：Prompt Caching 与上下文复用

**问题**：每个 Agent 轮次都全量重发超长 system prompt（身份 + writing-spec 全文 + 铁律 + 自检清单）；writing-spec、registry 每次读盘。token 与延迟随轮次线性膨胀。

**方案**
- 拆分 system prompt 为**稳定前缀**（身份/规范/铁律，可被 provider 的 prompt caching 复用）与**动态后缀**。
- 对支持 prompt caching 的 provider（OpenAI/Anthropic/DeepSeek）启用缓存标记。
- writing-spec 与 registry 加进程内缓存（带 pack 版本失效）。

**涉及**
- `app/src-tauri/src/ai_agent.rs`（消息构造、缓存标记）
- `app/src-tauri/src/pack.rs` / `citations.rs`（registry/paragraphs 内存缓存）

**风险/约束**
- 不同 provider 缓存语义不同，需按 provider 分支且默认安全降级（不支持时退回现状）。
- 缓存失效必须绑定 content pack 版本，避免读到旧规范。

**验收**：相同问题的重复/多轮调用 token 与延迟下降；输出质量不变。

---

## P2-3：会话上下文成本治理

**问题**：会话历史（`ai_agent_sessions`）存了每个 `get_pack_paragraph` 的 ~4000 字符原文，最多 80 条全量重放；Follow-up 时再叠加整篇旧文档。P1 已加「溢出降级」兜底，但常态成本仍高。

**方案**
- 会话持久化时**只存引用号 + 摘要**，原文按需用 `get_pack_paragraph` 重取（工具调用可缓存）。
- Continue 模式优先传「system + 旧文档 + 追问」，工具历史按需而非默认全量。
- 对 `existing_markdown` 做**按章节裁剪**（保留与追问相关章节），需在「不削弱效果」前提下灰度验证。

**涉及**
- `app/src-tauri/src/ai_agent.rs`（`build_user_turn`、`trim_session`、会话存储结构）
- `app/src-tauri/src/commands.rs`（`persist_agent_run`）

**风险/约束**
- 裁剪历史可能影响多轮连贯性——必须默认保守、可回退，并以 A/B 对比验证输出质量不降。

**验收**：常态 follow-up token 显著下降；多轮输出质量人工评测不降。

---

## P2-4：可观测性与诊断

**问题**：当前问题排查依赖事后猜测；缺乏对检索命中、token 用量、工具轮次、错误类型的结构化记录。

**方案**
- 在 Agent loop 记录结构化诊断（每轮工具名/查询/命中数/耗时、最终 token 估算、错误分类），落到本地诊断文件（可在设置中开关，默认关闭，避免泄露）。
- 设置页提供「导出最近一次生成诊断」按钮。

**涉及**：`ai_agent.rs`、`commands.rs`、`SettingsPage.tsx`、`api.ts`、`types.ts`

**风险/约束**：诊断内容可能含业务数据，默认关闭且仅本地存储，不上报。

---

## P2-5：文档—代码—Pack 一致性校验

**问题**：本次审计发现 `AGENTS.md`/`ARCHITECTURE.md` 曾声称「`call_chat_with_tools` 自动重试 prefix not found」，但代码中并不存在；也把「英文原文 dump」误归因于 flash 模型，而真因是 `inject_pack_quotes`。文档与代码失配会误导后续每个工程师/Agent。

**方案**
- 把关键不变量写成**测试**而非仅文档：
  - prompt 路径唯一（Agent 模式）；
  - `char_start` 偏移语义（UTF-16）；
  - prefix/context 重试策略存在且生效；
  - `inject_pack_quotes` 只截断不扩写。
- 增加 CI 检查：content pack 必含 `writing-spec/项目编写说明.md` 与 `writing-spec/SKILL.md`（否则 `build_agent_system_prompt` 会整体失败）。

**涉及**：`app/src-tauri/src/*`（测试）、`tools/pack-builder`（pack 校验）、CI workflow

**风险/约束**：低；纯增量保障。

---

## 实施顺序建议

1. **P2-5**（一致性测试/CI）—— 成本低、立即降低回归与失配风险，作为后续改动的安全网。
2. **P2-3**（会话成本治理）—— 直接降本，且与 P1 的溢出兜底协同。
3. **P2-2**（Prompt caching）—— 降本提速，provider 适配为主。
4. **P2-1**（语义检索 + rerank）—— 收益最高但工程最重，需 pack 重建与选型，放在管道稳固后。
5. **P2-4**（可观测性）—— 贯穿全程，建议与 P2-1 同期落地以量化收益。

> 红线复述：以上任何一项默认不得改变正常成功路径的行为与召回；新增能力一律可灰度、可回退，并以人工评测确认「核心效果不降」后方可设为默认。
