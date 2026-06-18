# AccoutingStandards Desktop App

Phase 1 桌面 App：导入准则库 zip 后，可离线浏览、搜索 IFRS / IAS / ASC 准则，并跳转官网原文。

## 开发

```bash
# 仓库根目录
pnpm install
pnpm app:dev
```

## 构建安装包

```bash
pnpm app:build
```

Linux 产出位于 `app/src-tauri/target/release/bundle/`。

## 首次使用

1. 启动 App
2. 点击「选择 zip 文件并导入」
3. 选择 `standards-pack-*.zip`（由 pack-builder 生成）
4. 进入「准则库」浏览与搜索

## 功能

- 准则列表 + IFRS / IAS / ASC 筛选
- 「显示旧准则」开关
- 全文搜索
- 准则 Markdown 正文渲染
- 「在官网查看原文 ↗」
- 设置页：版本信息、重新导入 zip
