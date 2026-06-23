# Evidence 体验与引用解析修复 — 设计说明

> **Historical spec (2026-06-19).** Most items implemented in Workbench / citations. Current: **v0.1.14**.

## 问题评估

| # | 现象 | 根因 |
|---|------|------|
| 1 | 黄色「未找到引用」条挡住正文 | `NotePanel` 固定渲染 `unresolved` 列表，占满中间栏顶部 |
| 2 | 再点其他准则无反应 | 未命中时 `setCitationTarget(null)` 清空右栏；错误只在页面顶部；同准则切换时右栏缺少 remount/反馈 |
| 3 | tags/date/status 挤在一起 | YAML frontmatter 被 `react-markdown` 当正文渲染，`---` 变成 `<hr>` |
| 4 | 大量 IFRS/IAS 引用未命中 | Pack 段落索引只匹配行首 `Paragraph N`；知识库 IFRS 原文用 TOC「Joint control 7」+ 正文标题格式，与 Vault 侧全文检索不一致 |

## 方案

1. **未找到引用**：改为默认收起的 `<details>`，标题显示数量。
2. **引用点击**：toast 提示；未命中时在右栏显示错误，不清空已有内容；`HighlightedBody` 加 `key` 强制切换段落时重渲染。
3. **Frontmatter**：解析 YAML 头，单独 `NoteMetadata` 组件分行展示，正文去掉 frontmatter。
4. **引用解析**：扩展 `paragraph-indexer`（TOC 行 + 正文标题）；Rust `resolve_citation` 增加 body 内 TOC/标题 fallback；重建 content pack。
