# AccoutingStandards Desktop

双准则（IFRS + US GAAP）桌面证据工作台：**离线全量准则包** + **AI 写项目文档** + **引用对照原文** + **官网二次验证**。

## 相关仓库

| 仓库 | 用途 |
|------|------|
| [AccoutingStandards-IFRS-USGaap](https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap) | Obsidian Vault：**准则正文**与项目笔记规范（内容源） |
| **本仓库** | Tauri 桌面 App、准则注册表、content pack 构建与 GitHub Releases |

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
├── tools/pack-builder/     # Phase 0 待实现
├── src/                    # Phase 1 待实现
├── src-tauri/
└── writing-spec/           # 构建时从 Vault 同步
```

## 开发阶段

| Phase | 状态 |
|-------|------|
| 0 — 仓库 + registry + pack-builder | 🚧 进行中 |
| 1 — Tauri + 准则浏览 | 待开始 |
| 2 — Evidence 分屏 | 待开始 |
| 3 — AI 写文档 | 待开始 |
| 4 — GitHub Release 自动更新 | 待开始 |

## 版权

准则正文版权归 **IFRS Foundation** / **FASB** 所有。本 App 提供本地阅读便利；**请以官网为准**进行二次验证（见 `standards-registry.yaml` 中 `official_url`）。

## 许可证

App 代码：待定（建议 MIT）。准则内容不单独授权，随 content pack 仅供配合 App 使用。
