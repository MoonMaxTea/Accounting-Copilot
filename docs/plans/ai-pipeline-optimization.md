# AI 生成流水线优化方案

所有优化必须以**保持或提升** AI 文档生成效果为前提。改动按优先级分为四个层级。

---

## P0：性能与可靠性（不改变行为）

### P0-1：每次 agent 运行只加载一次 paragraphs 和 registry

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)、[`citations.rs`](app/src-tauri/src/citations.rs)

**问题：** `load_paragraphs()` 和 `load_registry()` 分别在 `search_local_pack`（第 586、587 行）和 `list_standard_paragraphs`（第 671 行）内部被调用——每次工具调用都重新从磁盘读取。一次 agent 运行如有 8 次工具调用，就会产生 8 次冗余文件读取。

**改动方案：**
1. 修改 `execute_pack_tool()` 签名：新增 `paragraphs: &[ParagraphRecord]` 和 `registry: &RegistryFile` 参数（替代基于 `content_dir` 的内部调用）。
2. 在 `run_standards_agent()` 中：主循环前一次性加载 `paragraphs` 和 `registry`，与第 1112 行 `_writing_spec` 的模式一致。
3. 在 `search_local_pack` 分支：使用传入的 `entries` 替代调用 `load_paragraphs()`；使用传入的 `registry` 替代调用 `pack::load_registry()`。
4. 在 `list_standard_paragraphs` 分支：使用传入的 `paragraphs` 替代调用 `load_paragraphs()`。

**预期收益：** 每次 agent 运行消除 5-8 次冗余文件读取，减少延迟约 20-50ms。行为完全不变。

### P0-2：合成兜底调用前精简上下文

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 1280-1347 行）

**问题：** 合成兜底路径在 12 轮工具调用后触发时，`api_messages` 包含全部工具调用/结果历史以及 nudge 消息，可能溢出上下文窗口或降低最终输出质量。第 1324 行的合成调用直接使用完整的 `api_messages`。

**改动方案：**
1. 合成调用前，构建精简消息列表：
   - 保留 `api_messages[0]`（system prompt）
   - 保留 `api_messages[1]`（原始用户问题）
   - 过滤工具结果：仅保留有实质性内容的（如 `get_pack_paragraph` 的 `snippet_en` 长度 > 200 字符，`search_local_pack` 结果数 > 0）
   - 丢弃所有中间 nudge 消息（第 1277 行和第 1320 行插入的）
2. 精简列表仅用于合成调用。完整的 `api_messages` 保留作为最终输出参考。

**预期收益：** 合成调用获得聚焦、紧凑的上下文。降低上下文溢出风险，在兜底路径被触发时改善输出连贯性。预计消息数减少 30-60%。

---

## P1：工作流与提示词效率（低风险质量改进）

### P1-1：动态 nudge 提示消息

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 1263-1277 行）

**问题：** 每轮非最终输出后的 nudge 消息是固定的：`"请继续调用工具补全 pack 依据，或输出最终笔记..."`，不根据 agent 已完成的操作进行调整。

**改动方案：**
追踪当前已调用的工具（统计 `get_pack_paragraph`、`search_local_pack`、`list_standard_paragraphs` 的调用次数），动态生成 nudge：
- 若 `get_pack_paragraph_count >= 3`：`"你已经获取了足够的准则原文（{count} 段），请直接输出最终笔记。必须包含 PROJECT_NAME 与 MARKDOWN 区块。"`
- 否则若 `get_pack_paragraph_count == 0`：`"请调用 get_pack_paragraph 读取关键段落原文（每次返回数千字符），不要仅依赖搜索结果中的摘要。"`
- 否则若 `search_local_pack_count > list_standard_paragraphs_count`：`"请对已找到的准则调用 list_standard_paragraphs 查看可用段落，再用 get_pack_paragraph 逐个读取。"`
- 兜底：当前静态消息。

**预期收益：** 减少 agent 已有足够信息却不知道的停滞轮次。根据各轮状态提供更有针对性的引导。

### P1-2：独立工具调用并行执行

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 1174-1254 行）

**问题：** 模型在同一轮返回多个工具调用时（如 3 个独立的 `get_pack_paragraph` 调用），它们虽然互不依赖，却串行执行。

**改动方案：**
1. 对每个同批次 `tool_call`，判断是否依赖同批次内其他调用。当前 3 个工具彼此独立。
2. 使用 `futures::future::join_all` 并发执行独立的工具调用。
3. 保持结果顺序与原 `tool_call` 顺序一致（对 `tool_call_id` 映射至关重要）。

**预期收益：** 当模型在一轮内调用多个 `get_pack_paragraph` 时，延迟从 `N × 磁盘读取时间` 降至 `max(磁盘读取时间)`。典型节省：每次多工具调用轮次约 40-100ms。

### P1-3：压缩 persona 描述

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 292-301 行）

**问题：** Persona 约 200+ tokens 的职业叙事对输出质量没有直接影响。

**改动方案：** 将第 293-301 行替换为精简版本（保留 诊断-定位-解读-输出 分析框架）：

```
## 身份
你是一位资深 IFRS/US GAAP 会计准则与上市咨询合伙人。
你的核心价值：从客户混乱的业务描述中精准识别适用准则，将数千字
英文准则提炼为一段中文让 CFO 五分钟决策，在准则灰色地带给出有
依据的专业判断——而非照本宣科。
```

**预期收益：** 每次运行节省约 100 tokens（system prompt 开销）。不影响生成效果。精简版本保留了所有功能性约束（中文提炼、灰色地带判断），去掉了叙事性修饰。

### P1-4：早停机制（停滞轮次检测）

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 1155-1278 行）

**问题：** 循环最多运行 12 轮，即使 agent 已停止取得进展。连续两轮无有效工具调用浪费时间和 token。

**改动方案：**
每轮结束后：
- 追踪 `consecutive_no_new_info` 计数器
- 当一轮既无工具调用、assistant 文本也不含 final blocks 时，计数器 +1
- 当一轮有返回实质性内容的工具调用（结果非空、非纯错误）时，计数器清零
- 若 `consecutive_no_new_info >= 3`，提前跳出循环并触发合成兜底

**预期收益：** 约 30% 的运行节省 1-3 轮浪费的轮次。不影响正常完成的运行。

---

## P2：质量增强（细微改进，需验证）

### P2-1：工具调用与合成阶段使用不同的 temperature

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 877-883、1044-1061 行）

**问题：** 工具调用和最终合成都使用 `temperature: 0.2`。较低 temperature 有助于 function-calling 可靠性，但可能让中文写作显得呆板。合成阶段适当提高 temperature 可改善自然流畅度，且不会引入幻觉。

**改动方案：**
1. 为 `build_plain_chat_payload()` 增加 `temperature` 参数。
2. `call_chat_with_tools()` 保持 `temperature: 0.2`。
3. `call_chat_with_tools_synthesis()` 使用 `temperature: 0.4`。
4. 注意：需验证主流厂商（OpenAI、DeepSeek）在 `tool_choice: "none"` 模式下正确响应 temperature 变更。

**预期收益：** 最终文档中文行文更自然。风险：较高 temperature 可能偶尔影响结构。建议合并前对 5-10 份文档进行 A/B 测试。

### P2-2：Continue 模式嵌入上一轮已引用准则列表

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 369-385 行）、[`models.rs`](app/src-tauri/src/models.rs)

**问题：** Continue 模式下 AI 可能重新搜索上一轮已读过的准则。没有传递已查阅上下文。

**改动方案：**
1. 解析已有文档的 frontmatter（或引用章节），提取已引用准则列表。
2. 在 `build_user_turn()` 中，当 mode 为 Continue 且 `existing_markdown` 存在时，追加：`"\n\n上一轮已引用准则：{standards_list}。如果追问不涉及新准则，可直接使用已有准则知识。"`
3. 提取函数：扫描 YAML frontmatter 的 `standards:` 字段，或扫描 `A-准则分析` 章节提取 standard ID。

**预期收益：** 减少 Continue 模式的冗余搜索/列表/读取循环。AI 聚焦于增量部分而非重新获取已知内容。

### P2-3：Agent 运行指标采集

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 1359-1374 行）、`models.rs`

**问题：** 除脱敏 debug 事件外，没有采集每次运行的统计数据，无法做数据驱动的优化决策。

**改动方案：**
在 `AiDebugEvent` 的完成事件（第 1361 行）中增加：
- `tool_rounds: Option<u32>` —— 主循环运行的轮次数
- `tools_called: Option<String>` —— 逗号分隔的工具名列表（如 `"search_local_pack,get_pack_paragraph,get_pack_paragraph"`）
- `synthesis_triggered: Option<bool>` —— 是否触发了合成兜底路径
- `early_stop: Option<bool>` —— 是否触发了 P1-4 早停

不记录 API key 或内容，纯统计计数。

**预期收益：** 上线 1-2 周后可分析：合成兜底触发频率、平均工具轮次、工具使用分布，指导下一轮优化方向。

---

## P3：边界情况改进（锦上添花）

### P3-1：改进 list_standard_paragraphs 采样策略

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 696-717 行）

**问题：** 采样从索引 0 开始等距选取，ASC codification 文件可能仍选中 amendment metadata 附近的段落，代表性不足。

**改动方案：**
将第 698 行 `substantive[0]` 改为 `substantive[skip_start]`，其中 `skip_start = (substantive.len() / 4).min(10)`。跳过前 25% 条目（或前 10 条），从文档实质内容区选取样本。

### P3-2：增强 get_pack_paragraph 的 ASC 格式错误提示

**涉及文件：** [`ai_agent.rs`](app/src-tauri/src/ai_agent.rs)（第 639-651 行）

**问题：** 错误提示只说"请调用 list_standard_paragraphs"，但不告知 AI 正确格式。ASC 有多种引用格式。

**改动方案：**
当引用查找失败且 `standard_id` 以 "ASC" 开头时，在错误信息中追加：`（ASC 段落格式示例：718-10-25-2。请使用 list_standard_paragraphs 查看实际可用编号，复制粘贴以确保格式准确。）`

---

## 实施顺序

```
阶段一（P0）：  P0-1（缓存加载） → P0-2（合成上下文精简）
阶段二（P1）：  P1-1（动态 nudge） → P1-2（并行执行） → P1-3（压缩 persona） → P1-4（早停机制）
阶段三（P2）：  P2-3（指标采集先行，为验证提供数据） → P2-1（分设 temperature） → P2-2（Continue 嵌入准则列表）
阶段四（P3）：  P3-1 + P3-2（批量完成）
```

P0 和 P1 是纯工程改进——只改变代码行为，不改变 prompt 或输出结构。P2 涉及 prompt 或模型交互的改动，需要在实际文档上验证效果。

## 测试策略

- **单元测试：** P0-1（缓存命中行为）、P0-2（消息过滤正确性）、P1-1（nudge 选择逻辑）、P1-2（结果顺序一致性）、P1-4（计数器边界情况）
- **集成测试：** 用示例问题运行流水线，对比 `parse_ai_response()` 输出结构，验证 validation warnings 不变
- **人工验证（P2）：** 用 P2 改动生成 5-10 份文档，由领域专家审核是否有质量退化
- **指标验证（P2-3）：** 上线后查看 `ai-debug.log` 的工具轮次分布、合成触发率、早停触发率
