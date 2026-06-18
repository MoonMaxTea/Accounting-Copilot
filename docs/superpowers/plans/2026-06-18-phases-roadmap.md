# AccoutingStandards Desktop — 实施路线图

> **日期**: 2026-06-18  
> **设计规格**: [2026-06-18-desktop-app-design.md](../specs/2026-06-18-desktop-app-design.md)  
> **产品需求**: [DESIGN.md](../../DESIGN.md)

---

## 总览

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
pack-builder   准则浏览     Evidence      AI 写文档     自动更新
   │              │             │             │             │
   └──────── 首包 zip ────────► App 加载 ◄──────────────────┘
```

每个 Phase 是**独立可交付**的子项目，有各自的实施计划文件。

---

## Phase 依赖关系

| Phase | 计划文件 | 前置 | 产出 |
|-------|----------|------|------|
| **0** | [phase0-pack-builder.md](./2026-06-18-phase0-pack-builder.md) | 无 | `standards-pack-*.zip`、CI build-pack |
| **1** | [phase1-tauri-browser.md](./2026-06-18-phase1-tauri-browser.md) | Phase 0 首包 | 可浏览准则的 Tauri App |
| **2** | [phase2-evidence-split.md](./2026-06-18-phase2-evidence-split.md) | Phase 1 | Evidence 分屏 |
| **3** | [phase3-ai-writer.md](./2026-06-18-phase3-ai-writer.md) | Phase 2 | AI 写项目文档 |
| **4** | [phase4-auto-update.md](./2026-06-18-phase4-auto-update.md) | Phase 0 + Phase 1 | 自动更新 + Release CI |

---

## 推荐执行顺序

### 第一步：Phase 0（当前最高优先级）

没有 pack-builder，App 没有内容可用。Phase 0 计划包含完整 TDD 任务（10 个 Task）。

**关键里程碑**：
1. Monorepo scaffold
2. registry 校验通过（130 条）
3. 首个 `standards-pack-2026.06.18.zip` 发布
4. `updates/manifest.json` 填充真实 SHA256

### 第二步：Phase 1

用 Phase 0 产出的 zip 开发 App。可并行准备 Tauri scaffold，但集成测试依赖首包。

### 第三步：Phase 2 → 3 → 4

顺序执行。Phase 4 的 content 更新逻辑可在 Phase 1 后期开始，但完整 E2E 需 Phase 1–3 就绪。

---

## 工作区建议

使用 git worktree 隔离各 Phase 开发：

```bash
git worktree add ../asd-phase0 -b cursor/phase0-pack-builder-1b98
git worktree add ../asd-phase1 -b cursor/phase1-tauri-1b98
```

---

## 人力/Agent 分工建议

| 角色 | Phase | 说明 |
|------|-------|------|
| Agent A | Phase 0 | pack-builder 纯 TS，无 UI |
| Agent B | Phase 1 | Tauri + React，依赖 A 的首包 |
| Agent C | Phase 2–3 | 前端交互 + AI 集成 |
| Agent D | Phase 4 | CI + 更新状态机 |

Phase 0 与 Phase 1 scaffold 可部分并行（Agent A 做 builder，Agent B 搭 Tauri 空壳）。

---

## 验收标准（全项目）

- [ ] 离线浏览 130 条准则（current + legacy 筛选）
- [ ] 全文搜索 < 200ms（130 篇规模）
- [ ] Evidence 分屏引用跳转正确
- [ ] AI 生成文档引用可校验
- [ ] content pack 可通过 GitHub Release 更新
- [ ] 每条准则有官网验证链接

---

## 执行方式

计划完成后，选择：

1. **Subagent-Driven（推荐）** — 每个 Task 派发独立 subagent，任务间 review
2. **Inline Execution** — 当前 session 按 executing-plans 逐步执行

**建议从 Phase 0 Task 1 开始。**
