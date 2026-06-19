# Accounting Copilot

双准则（IFRS + US GAAP）桌面证据工作台：**离线全量准则包** + **AI 写项目文档** + **引用对照原文** + **官网二次验证**。

> **Product UI name:** Accounting Copilot · **Latest app:** see [Releases](https://github.com/MoonMaxTea/Accounting-Copilot/releases)

## For developers & AI agents

| Doc | Purpose |
|-----|---------|
| [**AGENTS.md**](AGENTS.md) | Start here — repo map, conventions, pitfalls |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module map & data flows |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, tests, release workflow |
| [docs/DESIGN.md](docs/DESIGN.md) | Full product design (Chinese) |

## 相关仓库

| 仓库 | 用途 |
|------|------|
| [AccoutingStandards-IFRS-USGaap](https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap) | Obsidian Vault：**准则正文**与项目笔记规范（内容源） |
| [**Accounting Copilot**](https://github.com/MoonMaxTea/Accounting-Copilot)（本仓库） | Tauri 桌面 App、准则注册表、content pack 构建与 GitHub Releases |

## 功能（规划）

- 全量打包 IFRS / IAS / ASC（现行 + 旧准则 archive）
- 准则浏览、全文搜索、段落锚点跳转
- Evidence 分屏：项目笔记 ↔ 本地准则原文
- 每条准则「在官网查看原文 ↗」
- AI 按 Vault《项目编写说明》生成本地项目文档
- GitHub Releases 检查更新（App + content pack）

## 文档

- [设计说明（完整）](docs/DESIGN.md)
- [standards-registry.yaml](standards-registry.yaml) — 准则元数据（130 条骨架，URL 待核验）
- [examples/](examples/) — registry / manifest 示例

## 目录结构

```
├── docs/DESIGN.md
├── standards-registry.yaml
├── updates/manifest.json
├── examples/
├── app/                    # ✅ Phase 1 Tauri 桌面 App
├── src/                    # （UI 在 app/src）
├── src-tauri/              # （Rust 在 app/src-tauri）
└── writing-spec/           # 构建时从 Vault 同步
```

## 开发阶段

| Phase | 状态 |
|-------|------|
| 0 — 仓库 + registry + pack-builder | ✅ |
| 1 — Tauri + 准则浏览 | ✅ |
| 2 — Evidence 分屏 / Workbench | ✅ |
| 3 — AI 写文档 | ✅ |
| 4 — GitHub Release 自动更新 | ✅ |

## 版权

准则正文版权归 **IFRS Foundation** / **FASB** 所有。本 App 提供本地阅读便利；**请以官网为准**进行二次验证（见 `standards-registry.yaml` 中 `official_url`）。

## 许可证

App 代码：待定（建议 MIT）。准则内容不单独授权，随 content pack 仅供配合 App 使用。
