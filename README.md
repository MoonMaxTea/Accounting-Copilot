# Accounting Copilot

多分类准则桌面工作台：**离线全量准则包** + **AI 写项目文档** + **引用对照原文** + **官网二次验证**。

> **Product UI name:** Accounting Copilot · **Latest app:** [`app-v0.1.15`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.15) — [release notes](docs/RELEASE-NOTES.md)

## For developers & AI agents

| Doc | Purpose |
|-----|---------|
| [**AGENTS.md**](AGENTS.md) | Start here — repo map, conventions, pitfalls |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module map & data flows |
| [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md) | App release notes |
| [docs/P2-PLAN.md](docs/P2-PLAN.md) | Long-term backlog |
| [docs/plans/completed-work-summary.md](docs/plans/completed-work-summary.md) | Summary of completed feature work |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, tests, release workflow |
| [docs/DESIGN.md](docs/DESIGN.md) | Full product design (Chinese) |

## 相关仓库

| 仓库 | 用途 |
|------|------|
| [AccoutingStandards-IFRS-USGaap](https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap) | 内容源 Vault：**准则正文**与项目笔记编写规范 |
| [**Accounting Copilot**](https://github.com/MoonMaxTea/Accounting-Copilot)（本仓库） | Tauri 桌面 App、准则注册表、content pack 构建与 GitHub Releases |

## 功能（v0.1.15 已实现）

- 全量打包 IFRS / IAS / ASC（现行 + 旧准则 archive）
- **多分类准则导航**：会计准则（IFRS/IAS/ASC）、上市规则（HK Listing Rules / SEC）、税法（CN / DE / US / 国际税）— 数据驱动，按 YAML `category` 字段自动归类
- 准则浏览、全文搜索、段落锚点跳转、文内查找
- **Workbench** 分屏：项目笔记 ↔ 本地准则原文（引用跳转、Mermaid 渲染）
- 每条准则「在官网查看原文 ↗」
- **AI Agent** 生成与追问（Follow-up）：同一套 3 工具 Agent 循环；按 Vault《项目编写说明》写本地项目文档
- AI 生成进度条动画、引用摘录折叠/展开、多轮对话日志保留
- 用户自选 **projects folder**（Settings）；与 content pack 独立
- GitHub Releases 检查更新（App + content pack）；私有仓库支持 GitHub token
- Windows / Linux 安装包（CI 发版 `app-v*`）

## 文档

- [docs/DESIGN.md](docs/DESIGN.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [standards-registry.yaml](standards-registry.yaml) — 准则元数据（130 条骨架，URL 待核验）
- [examples/](examples/) — registry / manifest 示例

## 目录结构

```
├── AGENTS.md               # AI / 开发者入口
├── docs/
│   ├── DESIGN.md           # 产品设计（中文）
│   ├── ARCHITECTURE.md     # 模块与数据流
│   ├── RELEASE-NOTES.md    # App 发版说明
│   └── plans/
│       └── completed-work-summary.md  # 已完成工作汇总
├── standards-registry.yaml
├── updates/manifest.json
├── examples/
├── app/                    # Tauri 桌面 App
│   ├── src/                # React UI
│   └── src-tauri/          # Rust 后端
├── tools/pack-builder/     # content pack 构建
├── packages/shared-types/
└── writing-spec/           # 构建时从 Vault 同步
```

## 开发阶段

| Phase | 状态 | 备注 |
|-------|------|------|
| 0 — 仓库 + registry + pack-builder | ✅ | |
| 1 — Tauri + 准则浏览 | ✅ | |
| 2 — Workbench 分屏 | ✅ | |
| 3 — AI Agent 写文档 + Follow-up | ✅ | v0.1.15 多分类导航 + UX 修复 |
| 4 — GitHub Release 自动更新 | ✅ | |

当前 App 版本：**0.1.15**（[`app-v0.1.15`](https://github.com/MoonMaxTea/Accounting-Copilot/releases/tag/app-v0.1.15)）。

## 版权

准则正文版权归 **IFRS Foundation** / **FASB** 所有。本 App 提供本地阅读便利；**请以官网为准**进行二次验证（见 `standards-registry.yaml` 中 `official_url`）。

## 许可证

App 代码：待定（建议 MIT）。准则内容不单独授权，随 content pack 仅供配合 App 使用。
