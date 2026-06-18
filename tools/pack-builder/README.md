# pack-builder

从 [AccoutingStandards-IFRS-USGaap](https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap) 只读拉取 Vault，结合 `standards-registry.yaml` 构建 `standards-pack-*.zip`。

## CLI

```bash
# 从仓库根目录
pnpm pack:build -- --vault /path/to/vault --registry standards-registry.yaml --output build/standards-pack-2026.06.18.zip

# 校验 registry 中 130 条 vault_path
pnpm validate:registry /path/to/vault standards-registry.yaml
```

## 产出 zip 结构

```
standards-pack-YYYY.MM.DD.zip
├── pack-manifest.json
├── registry.json
├── writing-spec/
├── current/{IFRS,IAS,ASC}/
├── archive/{IFRS,IAS,ASC}/
└── index/
    ├── paragraphs.json
    └── search.sqlite
```

## 开发

```bash
pnpm --filter @asd/pack-builder test
pnpm --filter @asd/pack-builder build
```

## 状态

Phase 0 — ✅ 已实现（Vitest 12 tests passing）
