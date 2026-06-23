---
name: fix-three-ux-issues
overview: "Fix three UX issues: (1) AI generation progress bar animation from left to right, (2) add collapse toggle for citation matched excerpt panel, (3) preserve first-generation activity log when showing follow-up conversation rounds."
todos:
  - id: task1
    content: "[任务1] 进度条动画：EvidencePage.tsx — 移除 60% 硬编码，phase+step_index 计算宽度，CSS transition 平滑过渡"
    status: pending
  - id: task2
    content: "[任务2] 匹配摘录取折叠：EvidenceStandardPanel.tsx — 新增 excerptExpanded state，compact 模式下可收起/展开"
    status: pending
  - id: task3
    content: "[任务3] 初稿日志可见：EvidenceSidePanel.tsx — 多轮时同时展开第一轮和最后一轮"
    status: pending
  - id: deputy-review
    content: "[Deputy 审阅] MCP 发送 plan 到 Claude Code 终端 -> Deputy 审阅"
    status: pending
  - id: implement
    content: "[实施] Lead 按 plan 执行三个任务的代码修改"
    status: pending
  - id: verify
    content: "[验证] 运行 pnpm test && cargo test，Deputy 验收"
    status: pending
isProject: false
---

# Fix Three UX Issues

> 状态：草案 | 创建：2026-06-23  
> **分工**：Lead 起草 plan | Deputy 审阅 + 验收 | User 确认与 UI 验收  
> **实施主**：lead  
> **Superpowers 协作**：on  
> **终端桥接**：ok  
> 关联代码：`app/src/pages/EvidencePage.tsx`, `app/src/components/EvidenceStandardPanel.tsx`, `app/src/components/EvidenceSidePanel.tsx`

## 分工表

| 阶段 | Lead | Deputy | User |
|------|------|--------|------|
| Plan 起草 | 起草与维护 | 只审不改 | 确认 plan |
| 实施 | 写代码 | — | 产品取舍 |
| 验收 | — | 静态检查 + 验收 | 浏览器/UI |

`plan_author` 固定为 **Lead**。

## Deputy 监测配置

| 项 | 配置 |
|----|------|
| 启用监测 | true |
| 检查间隔（分钟） | 1 |
| 无进展时 | notify_user |

## Superpowers 协作（`on`）

| 阶段 | Superpowers skill | 执行方 | 来源 |
|------|-------------------|--------|------|
| Plan 起草 | brainstorming → writing-plans | Lead | 插件 |
| Plan 审阅 | executing-plans Step 1（只审不改） | Deputy | 内置 |
| 实施 | executing-plans + TDD | Lead | 插件 |
| 实施后审 diff | requesting-code-review | Lead | 插件 |
| 验收 | verification-before-completion | Deputy | 内置 |
| 修复 | systematic-debugging | Lead | 插件 |

## 概述

修复三个 UI 问题：AI 生成进度条缺少从左到右的前进动画；点击准则引用后右侧匹配摘录占据整个 EvidenceSidePanel；追问后对话日志仅显示最新轮次。

## 背景与问题

### 问题 1：进度条固定在 2/3 位置

代码位置：[`app/src/pages/EvidencePage.tsx`](app/src/pages/EvidencePage.tsx) 第 549-553 行

```typescript
{genProgress.phase === "searching" && (
  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-brand-hover">
    <div className="h-full animate-pulse rounded-full bg-brand-accent" style={{ width: "60%" }} />
  </div>
)}
```

- `width: "60%"` 硬编码，永远不变化
- 仅 `phase === "searching"` 时显示
- AI Agent 端发射的进度含 `step_index` 和不同 `phase`（`searching`, `generating`, `complete`, `error`），但前端未利用
- **注意：** `synthesis_start`/`synthesis_end` 仅写入 `ai-debug.log`，不作为 progress event 发出（Deputy 审阅发现，已修正）

### 问题 2：匹配摘录占满侧面板

代码位置：[`app/src/components/EvidenceStandardPanel.tsx`](app/src/components/EvidenceStandardPanel.tsx) 第 198-202 行

```typescript
{activeHighlight.snippet_en && !isStandardFallback && (
  <p className="mt-3 rounded-lg bg-brand-paper px-4 py-3 text-sm text-brand-ink">
    {trf("matchedExcerpt", { snippet: activeHighlight.snippet_en })}
  </p>
)}
```

- 匹配摘录 `<p>` 在 header 中始终展开
- 在 compact 模式（EvidenceSidePanel 内）时，header 中摘录 + 标准正文占据整个侧面板高度
- 缺少收起/展开交互

### 问题 3：追问后仅显示最新日志

代码位置：[`app/src/components/EvidenceSidePanel.tsx`](app/src/components/EvidenceSidePanel.tsx) 第 172-181 行

```typescript
useEffect(() => {
    if (conversationRounds.length === 0) {
      setExpandedRoundIds(new Set());
      return;
    }
    const latest = conversationRounds[conversationRounds.length - 1];
    if (latest) {
      setExpandedRoundIds(new Set([latest.id]));
    }
}, [conversationScopeKey, conversationRounds]);
```

- 当 conversation 数据变化后，仅 auto-expand 最新的一轮
- 初稿（第一轮）处于 collapsed 状态，用户需要手动点击 + 展开
- 当仅有 1-2 轮对话时，此行为让用户以为初稿日志丢失

## 目标与范围

### 在范围内

1. 进度条根据 phase 和 step_index 动态计算宽度，显示从左到右的进展感
2. 匹配摘录区域加点击收起/展开按钮（compact 模式下）
3. 对话日志默认展开初稿（第一轮）+ 最新轮，确保初稿日志可见

### 不在范围内

- 不修改后端 AI Agent 进度发射逻辑
- 不修改 session / activity 持久化逻辑
- 不改变 EvidenceSidePanel 的布局结构
- 不影响 Standards 页面独立模式的样式

## 审阅结论 / 接纳建议

> 阶段 A：Deputy 审阅后，由 Lead 填写；User 确认前必填。

| # | Deputy 建议 | 严重程度 | Lead 接纳 | 理由 |
|---|-----------|----------|-----------|------|
| 1 | Task 1 phase 映射错误：synthesis_start/end 仅出现在 debug log，不作为 progress event 发出 | high | **采纳** | 修正为实际 phase：searching（step_index 驱动）+ generating（80%），移除不存在分支 |
| 2 | step_index 可能为 undefined（error/complete phase 时 step_index: None） | med | **采纳** | getProgressPercent 使用 `step_index ?? 0` 防御 |
| 3 | implement/verify 待办事项过于粗粒度，三个任务捆绑在一起 | med | **采纳** | 拆分为 3 个独立的 implement 任务 + per-task verify 命令 |
| 4 | Task 2 citationKey 依赖数组正确性需验证 | med | **采纳** | 实施时验证 citationKey 在 target 变化时正确触发重置 |
| 5 | 任务粒度偏粗（10-15 分钟而非 2-5 分钟） | med | **部分采纳** | 在每个任务内用细粒度 TodoWrite 跟踪，不再拆分子文件减少 overhead |
| 6 | 终端 phase 列表未明确定义 | low | **采纳** | 明确定义：searching + generating 显示进度条；error/complete 隐藏 |
| 7 | 收起/展开按钮缺少 aria-label / aria-expanded | low | **采纳** | 实施时加入无障碍属性 |
| 8 | Task 3 scope key 切换边界情况未验证 | low | **采纳** | 现有逻辑正确但实施后人工验证 |
| 9 | getProgressPercent 适合写 vitest 单元测试 | low | **采纳** | 添加简单 vitest 测试覆盖关键分支 |
| 10 | Task 2 grep 验证模式管道符问题 | low | **采纳** | 简化为 `rg "excerptExpanded"` |
| 11 | 非 compact 模式行为未说明 | low | **采纳** | 非 compact 模式保持当前始终可见行为不变 |
| 12 | 仓库惯例 UI 语言为英文 — Task 2 需补充说明 | low | **采纳** | 按钮/aria 文本使用英文 |

## 验收标准

- [ ] Generate 时进度条从 0% 左右逐步增长到接近 100%（不超过 95%），不再固定在 60%
- [ ] 进度条宽度变化有平滑 CSS 过渡，不突兀
- [ ] 点击准则引用后，匹配摘录区域旁有收起/展开按钮（compact 模式）
- [ ] 点击收起按钮后匹配摘录区域折叠；再次点击展开
- [ ] 切换不同准则引用时，摘录区域自动展开
- [ ] 追问后初稿（第一轮）和追问（最后一轮）对话日志均处于展开状态
- [ ] 当只有一个对话轮次时，仅展开该轮（现有行为不变）
- [ ] 无控制台报错，无现有功能回退
- [ ] `pnpm test && cd app/src-tauri && cargo test` 通过

## 测试环境配置

### 运行环境

| 项 | 配置 |
|----|------|
| 工作目录 | `d:\OneDrive\AIrelated\Project\Accounting-Copilot` |
| 启动命令 | `pnpm app:dev` |
| 版本核对 | `app/package.json` version |

### Deputy 可做的自动化检查（无需浏览器）

| 检查项 | 方法 |
|--------|------|
| 进度条宽度逻辑已改为变量 | `rg "60%" app/src/pages/EvidencePage.tsx` → 不存在硬编码 60% |
| EvidenceStandardPanel 有 collapse state | `rg "useState.*collaps" app/src/components/EvidenceStandardPanel.tsx` |
| 默认展开多轮逻辑存在 | `rg "setExpandedRoundIds" app/src/components/EvidenceSidePanel.tsx` |
| TypeScript 编译通过 | `npx tsc -p app/tsconfig.json --noEmit` |

### 待人工（浏览器 / UI）

1. 启动 `pnpm app:dev`，打开 EvidencePage，触发 AI 生成，观察进度条动画
2. 生成完成后点击准则引用，确认匹配摘录可收起/展开
3. 对生成的文档进行追问，确认对话日志显示初稿和追问两轮
4. 硬刷新（Ctrl+F5）后复测

## 实施清单

### 任务 1：进度条动画

**文件：** `app/src/pages/EvidencePage.tsx`

- 移除 `width: "60%"` 硬编码
- 新增 `getProgressPercent(phase, stepIndex)` 函数：
  - `searching` → 10% + (stepIndex ?? 0) * 5%（cap 55%）
  - `generating` → 80%
  - 其他 → 5%
- 仅 `searching` 和 `generating` phase 显示进度条；`error`/`complete` 隐藏
- 移除 `animate-pulse`，改用 CSS transition（`transition-all duration-500`）
- `synthesis_start`/`synthesis_end` 仅为 debug log phase，不作为 progress event 发出 — 不纳入映射
- 验证命令：`rg "60%" app/src/pages/EvidencePage.tsx` 应无匹配

### 任务 2：匹配摘录取折叠

**文件：** `app/src/components/EvidenceStandardPanel.tsx`

- 新增 `useState<boolean>(true)` — `excerptExpanded` (默认展开)
- 在 `useEffect` 依赖 `citationKey` 变化时重置为 `true`
- 将 matchedExcerpt `<p>` 包裹在可折叠容器中
- 添加收起/展开按钮（chevron icon，与项目现有模式一致）
- 折叠时仅显示一行截断文字 + 展开按钮
- 仅在 `compact` 模式下生效
- 验证命令：`rg "useState.*expanded\|excerptExpanded" app/src/components/EvidenceStandardPanel.tsx`

### 任务 3：初稿日志可见

**文件：** `app/src/components/EvidenceSidePanel.tsx`

- 修改 `useEffect`（第 172-181 行）：
  - 当 `conversationRounds.length === 1` 时：展开该轮（不变）
  - 当 `conversationRounds.length >= 2` 时：展开第一轮 + 最后一轮
  - `new Set([conversationRounds[0].id, latest.id])`
- 验证命令：`rg "conversationRounds\[0\]" app/src/components/EvidenceSidePanel.tsx`

## Handoff（实施方填写）

```text
version_or_build_id: 0.1.14
changed_files:
  - app/src/pages/EvidencePage.tsx
  - app/src/components/EvidenceStandardPanel.tsx
  - app/src/components/EvidenceSidePanel.tsx
run_url: http://localhost:1420
start_command: pnpm app:dev
notes: 无需重启构建；dev server 热更新
```
