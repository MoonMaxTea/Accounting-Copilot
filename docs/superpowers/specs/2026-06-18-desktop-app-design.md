# Accounting Copilot — 技术设计规格

> **状态**: Superpowers Brainstorming 产出 v1  
> **日期**: 2026-06-18  
> **前置文档**: [docs/DESIGN.md](../../DESIGN.md)（产品级设计稿）  
> **范围**: Phase 0–4 全栈技术设计；本规格聚焦**如何实现**，DESIGN.md 聚焦**做什么**

---

## 1. 执行摘要

Accounting Copilot 是一个**离线优先的 Tauri 桌面应用**，从 Obsidian Vault（`AccoutingStandards-IFRS-USGaap`）构建 content pack，为用户提供 IFRS/IAS/ASC 准则浏览、Evidence 分屏、AI 写项目文档、GitHub Releases 更新能力。

**推荐技术路线**：

| 层 | 选型 | 理由 |
|----|------|------|
| 桌面壳 | Tauri 2.x | 轻量、Rust 安全边界、内置 updater |
| 前端 | React 19 + TypeScript + Vite | Tauri 生态成熟、组件库丰富 |
| UI | Tailwind CSS + shadcn/ui | 快速构建专业桌面 UI |
| pack-builder | TypeScript CLI（`tools/pack-builder`） | 与前端同语言、YAML/zip 生态好、CI 易集成 |
| 全文索引 | SQLite FTS5（预构建进 pack） | 离线搜索性能好、Tauri 可通过 rusqlite 读取 |
| 段落索引 | JSON（`index/paragraphs.json`） | 轻量、AI 校验与跳转共用 |
| 测试 | Vitest（TS）+ cargo test（Rust 薄层） | 统一工具链 |
| 包管理 | pnpm workspace | monorepo：`app/` + `tools/pack-builder/` |

**子项目分解**（每个子项目独立 spec → plan → 实现）：

```
Phase 0  pack-builder + 首包 Release     ← 数据管道基础，必须先做
Phase 1  Tauri 壳 + 准则浏览 + 搜索
Phase 2  Evidence 分屏 + 项目目录
Phase 3  AI 写文档 + 引用校验
Phase 4  自动更新 + CI Release 流水线
```

---

## 2. 目标与非目标

### 2.1 目标

1. **离线可用**：安装后无需联网即可浏览全部 130 条准则
2. **证据可追溯**：项目笔记引用 → 本地原文段落 → 官网二次验证
3. **AI 可控**：生成文档仅引用 pack 内已索引段落，默认禁止 legacy
4. **可更新**：content pack 与 App 通过 GitHub Releases 独立发版
5. **双仓库分离**：Vault 管内容，Desktop 管 App 与元数据

### 2.2 非目标（v1）

- Web/SaaS 版本
- 用户编辑 pack 内准则正文
- 本地大模型
- 多用户协作 / 云同步项目笔记
- 自动从官网爬取准则更新

---

## 3. 方案对比

### 3.1 桌面框架

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **A. Tauri 2** | 安装包小、内存低、Rust 后端安全 | 需维护 Rust 薄层 | ✅ **推荐** |
| B. Electron | 生态最大、纯 TS | 包体大、内存高 | 否决 |
| C. Flutter Desktop | 跨平台一致 | 与 Web 技术栈割裂、Markdown 渲染弱 | 否决 |

### 3.2 pack-builder 语言

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **A. TypeScript** | 与前端共享类型、Vitest、yaml/zip 库成熟 | 需 Node 运行时（CI 有） | ✅ **推荐** |
| B. Rust | 与 Tauri 统一、性能好 | 开发慢、YAML/段落解析样板多 | 否决（v1） |
| C. Python | 脚本快 | 与主栈割裂、CI 多依赖 | 否决 |

### 3.3 搜索索引策略

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **A. 预构建 SQLite FTS** | 启动快、查询稳定 | pack 略大、构建复杂 | ✅ **推荐** |
| B. 运行时索引 | pack 小 | 首次启动慢、占 CPU | 否决 |
| C. 纯内存搜索（flexsearch 等） | 无 SQLite 依赖 | 130 篇 Markdown 内存占用高 | 否决 |

### 3.4 AI 集成

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **A. 直连 OpenAI 兼容 API** | 简单、用户自配 Key | 需联网 | ✅ **推荐（v1）** |
| B. 内置 prompt 模板 + 多 provider 抽象 | 可扩展 | v1 过度设计 | Phase 3 预留接口 |
| C. 本地模型 | 离线 AI | v1 明确不做 | 否决 |

---

## 4. 系统架构

### 4.1 仓库与运行时边界

```
┌─────────────────────────────────────────────────────────────────┐
│  Vault Repo (AccoutingStandards-IFRS-USGaap)                    │
│  03 - 知识库/*.md  │  02 - 项目/项目编写说明.md  │  SKILL.md   │
└────────────────────────────┬────────────────────────────────────┘
                             │ git clone @ ref (CI / pack-builder)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Desktop Repo (Accounting-Copilot)                    │
│  standards-registry.yaml ──► pack-builder ──► standards-pack.zip│
│  src/ + src-tauri/ ◄── reads pack from AppData/content/         │
└────────────────────────────┬────────────────────────────────────┘
                             │ GitHub Releases
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  用户桌面                                                        │
│  AppData/content/  ← content pack                               │
│  用户项目目录/02 - 项目/  ← 项目笔记（不在 pack 内）              │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Monorepo 目录结构（目标态）

```
Accounting-Copilot/
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── app/                         # Tauri 前端 + Rust 壳
│   ├── src/                     # React UI
│   ├── src-tauri/               # Tauri commands
│   └── package.json
├── tools/
│   └── pack-builder/            # Phase 0
│       ├── src/
│       │   ├── cli.ts
│       │   ├── registry.ts
│       │   ├── vault-sync.ts
│       │   ├── paragraph-indexer.ts
│       │   ├── search-indexer.ts
│       │   ├── pack-writer.ts
│       │   └── types.ts
│       ├── tests/
│       └── package.json
├── packages/
│   └── shared-types/            # registry、paragraph、manifest 共享类型
├── standards-registry.yaml
├── updates/manifest.json
├── docs/
│   ├── DESIGN.md
│   └── superpowers/
│       ├── specs/
│       └── plans/
└── .github/workflows/
    ├── build-pack.yml
    └── release-app.yml
```

### 4.3 模块职责

| 模块 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `registry.ts` | 解析/校验 YAML registry | `standards-registry.yaml` | `RegistryEntry[]` |
| `vault-sync.ts` | 从 Vault 复制 Markdown + writing-spec | Vault 路径、registry | staging 目录树 |
| `paragraph-indexer.ts` | 提取段落锚点 | Markdown 文件 | `ParagraphEntry[]` |
| `search-indexer.ts` | 构建 FTS 索引 | Markdown 文件 | `search.sqlite` |
| `pack-writer.ts` | 组装 zip + manifest + registry.json | staging + 索引 | `.zip` + SHA256 |
| Tauri `content` 命令 | 读取本地 pack | AppData 路径 | 准则列表、全文、段落 |
| Tauri `search` 命令 | FTS 查询 | query string | 命中列表 |
| Tauri `citation` 命令 | 解析引用字符串 | `IFRS 11 §7-8` | pack_path + char range |
| Tauri `update` 命令 | 检查/下载/应用更新 | manifest URL | 状态机事件 |

---

## 5. 数据模型

### 5.1 RegistryEntry（YAML → JSON）

```typescript
interface RegistryEntry {
  id: string;                    // "IFRS 11" | "ASC 740"
  title: string;
  title_zh?: string;
  framework: 'IFRS' | 'IAS' | 'ASC';
  status: 'current' | 'legacy';
  legacy_label?: string;         // 默认 "旧准则"
  effective_from?: string;       // ISO date
  effective_until?: string;
  superseded_by?: string;
  supersedes?: string[];
  official_url: string;
  official_url_note?: string;
  vault_path: string;
  pack_filename?: string;
  tags?: string[];
  // 构建时填充
  pack_path?: string;            // "current/IFRS/IFRS 11 - ....md"
}
```

**校验规则**：

- `id` 全局唯一
- `status: legacy` 时建议有 `superseded_by`
- `vault_path` 在构建时必须存在于 Vault clone
- 同一 `id` 仅允许一条 `current`
- `official_url` 必须为 https URL

### 5.2 ParagraphEntry

```typescript
interface ParagraphEntry {
  standard_id: string;
  paragraph: string;             // 原始匹配文本 "7-8"
  paragraph_normalized: string;  // 规范化 "7"
  pack_path: string;
  char_start: number;
  char_end: number;
  snippet_en: string;            // 前 120 字符
  status: 'current' | 'legacy';
}
```

**段落匹配规则**：

| 框架 | 正则模式 | 示例 |
|------|----------|------|
| IFRS/IAS | `(?:Paragraph\|§)\s*(\d+(?:[–-]\d+)?)` | `Paragraph 7`, `§7-8` |
| ASC | `(\d{3}-\d{2}-\d{2}-\d+)` | `740-10-25-5` |

### 5.3 PackManifest

见 [examples/pack-manifest.example.json](../../../examples/pack-manifest.example.json)。

### 5.4 UpdatesManifest

见 [examples/updates-manifest.example.json](../../../examples/updates-manifest.example.json)。

### 5.5 用户 config.json

```typescript
interface AppConfig {
  projects_dir: string;
  update: {
    manifest_url: string;
    check_on_startup: boolean;
    last_content_version: string | null;
  };
  ai: {
    provider: 'openai';
    api_key?: string;            // 仅存本地，不入 git
    model: string;               // 默认 "gpt-4o"
    allow_legacy_citations: boolean;
  };
}
```

---

## 6. 段落引用解析器

项目笔记与 AI 输出使用统一引用格式：

```
IFRS 11 §7–8
IAS 28 §16
ASC 740-10-25-5
```

**解析状态机**：

```
输入字符串
  → 匹配 framework prefix (IFRS|IAS|ASC) + 编号
  → 匹配分隔符 (§|Paragraph|codification dash)
  → 提取 paragraph id
  → 查 paragraphs.json
  → 返回 { standard_id, pack_path, char_start, char_end } | null
```

**失败处理**：UI 标黄「未在本地 pack 找到」；不阻断保存。

---

## 7. UI 信息架构

### 7.1 主导航

```
┌──────────────────────────────────────────────┐
│ [准则库] [Evidence] [项目] [设置]             │
└──────────────────────────────────────────────┘
```

> **命名**：第三项为 **「项目」**（非「AI 写文档」），面向用户表达「写/管项目笔记」，AI 为手段而非标签。

### 7.2 准则库页

- 左：框架筛选（IFRS/IAS/ASC）+ 搜索框 + 「显示旧准则」开关
- 中：准则列表（id、title、徽章）
- 右：准则详情（Markdown 渲染 + 官网按钮）

### 7.3 Evidence 分屏

- 左：项目文件树 + Markdown 编辑器（只读或轻编辑，v1 只读）
- 右：准则原文（引用点击跳转高亮）
- 底：未解析引用警告条

### 7.4 项目（历史列表 + AI 生成 + 自动保存）

**布局：** 左栏历史项目，右栏新建。

**历史列表：**

- 扫描 `projects_dir` 全部 `.md`
- 默认排序：**最近修改** 优先
- **搜索框**：过滤文件名、标题、正文关键词
- 点击 → Evidence 打开 / Reveal 文件夹

**新建：**

- 输入：问题 + 可选事实 JSON
- **项目名**：AI 从问题自动生成（用户不填）
- **文件名**：`{项目名}-{YYYY-MM-DD}.md`；同日冲突加 `-2`、`-3`…
- 生成流式展示 → **结束即自动写入**（无确认保存）
- 反馈：toast + 引用校验报告（警告不撤销文件）
- 更新 `项目索引.md`（若存在）

### 7.5 设置

- 项目目录选择
- AI API Key
- 更新检查 / 版本信息
- `allow_legacy_citations` 开关

---

## 8. Tauri 命令接口

```rust
// src-tauri/src/commands/content.rs
#[tauri::command]
fn list_standards(framework: Option<String>, include_legacy: bool) -> Result<Vec<StandardSummary>, String>;

#[tauri::command]
fn get_standard(standard_id: String) -> Result<StandardDetail, String>;

#[tauri::command]
fn search_standards(query: String, limit: u32) -> Result<Vec<SearchHit>, String>;

#[tauri::command]
fn resolve_citation(citation: String) -> Result<CitationTarget, String>;

#[tauri::command]
fn list_project_files(projects_dir: String) -> Result<Vec<ProjectFile>, String>;

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String>;

// src-tauri/src/commands/update.rs
#[tauri::command]
async fn check_updates(manifest_url: String) -> Result<UpdateStatus, String>;

#[tauri::command]
async fn apply_content_update(pack_url: String, expected_sha256: String) -> Result<(), String>;
```

**原则**：重逻辑放 Rust（文件 IO、SQLite、更新原子替换）；UI 状态放 React。

---

## 9. 更新状态机（实现约束）

与 DESIGN.md §6.2 一致，实现时必须满足：

1. 下载到 `downloads/pack-{version}.zip`
2. SHA256 校验
3. 解压到 `content.new/`
4. 验证 `pack-manifest.json` + `registry.json`
5. 原子替换：`content/` → `content.bak/`，`content.new/` → `content/`
6. 重载 SQLite 连接
7. 更新 `config.last_content_version`
8. 失败时保留 `content.bak/` 供手动回滚

---

## 10. 项目（AI 生成）流程

```
用户输入问题
  → AI 先生成短「项目名」（用于文件名与 # 标题）
  → 加载 writing-spec，构建 system prompt
  → 流式生成正文
  → 写入 projects_dir/{项目名}-{YYYY-MM-DD}.md
  → 更新 项目索引.md（若有）
  → 展示校验报告 + 「在 Evidence 中打开」
  → 历史列表刷新（新文件置顶）
```

**命名示例：** 问题「50:50 合营如何判断」→ 项目名 `合营安排判断` → 文件 `合营安排判断-2026-06-18.md`

**保存策略：** 直接保存，无确认步骤；校验仅警告。

---

## 11. 错误处理策略

| 场景 | 行为 |
|------|------|
| pack 未安装 | 启动向导：下载首包或指定本地 zip |
| registry vault_path 不存在 | pack-builder 构建失败，CI 红灯 |
| 引用无法解析 | UI 标黄，Evidence 面板显示提示 |
| 更新 SHA256 失败 | 中止替换，保留旧 content |
| AI API 失败 | 显示错误，不写入文件 |
| SQLite 损坏 | 提示重新下载 content pack |

---

## 12. 测试策略

| 层 | 工具 | 覆盖重点 |
|----|------|----------|
| pack-builder | Vitest | registry 校验、段落正则、zip 完整性 |
| 引用解析器 | Vitest | IFRS/IAS/ASC 格式、边界 |
| Tauri commands | cargo test + 集成测试 | 文件 IO、原子替换 |
| UI | Vitest + Testing Library | 组件渲染、筛选逻辑 |
| E2E | 手动 / 后续 Playwright | 分屏跳转、更新流程 |

**TDD 要求**：每个 Phase 先写失败测试，再实现。

---

## 13. CI/CD

### 13.1 build-pack.yml

触发：`workflow_dispatch`、每周 cron

步骤：
1. checkout Desktop
2. clone Vault @ `inputs.vault_ref`（默认 main）
3. `pnpm install && pnpm --filter pack-builder build`
4. `pnpm pack-builder --vault $VAULT --registry standards-registry.yaml --output build/`
5. 上传 artifact + 创建 Release `content-{date}`
6. 更新 `updates/manifest.json` 并 commit

### 13.2 release-app.yml

触发：`workflow_dispatch`、tag push `app-v*`

步骤：
1. `pnpm tauri build`
2. 签名（Tauri updater）
3. 上传安装包 + 更新 manifest `app` 段

---

## 14. 分阶段交付标准

### Phase 0 — pack-builder ✅ 交付标准

- [ ] CLI 可从 Vault 构建 zip
- [ ] zip 含 current/archive、paragraphs.json、search.sqlite、registry.json、pack-manifest.json、writing-spec
- [ ] 130 条 registry 全部 vault_path 校验通过
- [ ] 输出 SHA256
- [ ] Vitest 覆盖率 ≥ 80%（pack-builder 核心模块）

### Phase 1 — 准则浏览 ✅ 交付标准

- [ ] Tauri App 启动并加载本地 pack
- [ ] 准则列表 + 框架筛选 + legacy 开关
- [ ] 全文搜索返回结果
- [ ] 准则详情 Markdown 渲染 + 官网外链
- [ ] legacy 徽章 + superseded_by 跳转

### Phase 2 — Evidence ✅ 交付标准

- [ ] 配置 projects_dir
- [ ] 项目文件树
- [ ] 分屏：笔记 ↔ 准则
- [ ] 点击引用跳转高亮

### Phase 3 — AI 写文档 ✅ 交付标准

- [ ] OpenAI API 集成
- [ ] 按 writing-spec 生成 Markdown
- [ ] 引用校验报告
- [ ] 保存到项目目录

### Phase 4 — 自动更新 ✅ 交付标准

- [ ] 启动检查 manifest
- [ ] 下载 + 校验 + 原子替换 content
- [ ] 设置页版本信息
- [ ] CI 自动发 Release

---

## 15. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Vault 私有/不可访问 | 无法构建 pack | CI 用 deploy key；本地 dev 文档说明 |
| ASC 官网需登录 | 用户验证体验差 | `official_url_note` 提示 |
| 准则版权 | 法律风险 | 不公开 pack 下载页；README 声明 |
| pack 体积增长 | 更新慢 | 130 篇可接受；后续增量更新（P2） |
| AI 幻觉引用 | 证据不可靠 | 强制 paragraphs.json 校验 |

---

## 16. 默认决策（无需用户确认即可推进）

| 决策 | 默认值 |
|------|--------|
| 前端框架 | React 19 + Vite |
| UI 库 | shadcn/ui + Tailwind |
| Tauri 版本 | 2.x |
| Node 版本 | 22 LTS |
| AI Provider | OpenAI 兼容 API |
| 默认模型 | gpt-4o |
| Markdown 渲染 | react-markdown + remark-gfm |
| 代码高亮 | 不需要（准则正文无代码块为主） |

---

## 17. 与 DESIGN.md 的关系

| 文档 | 层级 |
|------|------|
| `docs/DESIGN.md` | 产品需求、交互原型、业务规则（**不改**） |
| 本规格 | 技术架构、模块边界、接口、测试、分阶段交付 |
| `docs/superpowers/plans/` | 可执行任务（TDD 逐步） |

---

## 18. 审批记录

- [ ] 用户审阅本规格
- [ ] 用户批准进入 Phase 0 实施

---

## 变更日志

- 2026-06-18：Superpowers brainstorming 初稿
