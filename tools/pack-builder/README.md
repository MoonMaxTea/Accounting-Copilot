# pack-builder

从 [AccoutingStandards-IFRS-USGaap](https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap) 只读拉取 Vault，结合 `standards-registry.yaml` 构建 `standards-pack-*.zip`。

## 规划 CLI

```bash
pnpm pack-builder \
  --vault /path/to/vault \
  --registry ./standards-registry.yaml \
  --output ./build/standards-pack-2026.06.18.zip
```

## 步骤（见 docs/DESIGN.md §七）

1. 校验 registry 中 `vault_path`
2. 复制 Markdown → `current/` / `archive/`
3. 同步 `writing-spec/`（项目编写说明 + SKILL）
4. 生成 `index/paragraphs.json`、`registry.json`、`pack-manifest.json`
5. 输出 zip + SHA256

## 状态

Phase 0 — 待实现
