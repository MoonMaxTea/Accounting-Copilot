# Phase 0: pack-builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI that reads Vault Markdown + `standards-registry.yaml` and outputs a validated `standards-pack-YYYY.MM.DD.zip` with registry.json, paragraphs index, SQLite FTS, and writing-spec.

**Architecture:** pnpm monorepo with `tools/pack-builder` as standalone CLI and `packages/shared-types` for shared interfaces. Vault is cloned read-only at build time. Staging directory → zip. All core logic unit-tested with Vitest before integration.

**Tech Stack:** TypeScript 5, Node 22, Vitest, yaml, archiver, better-sqlite3, zod, commander

**Spec:** [docs/superpowers/specs/2026-06-18-desktop-app-design.md](../specs/2026-06-18-desktop-app-design.md)

---

## File Map

| File | Responsibility |
|------|----------------|
| `package.json` | pnpm workspace root |
| `pnpm-workspace.yaml` | workspace packages |
| `packages/shared-types/src/index.ts` | RegistryEntry, ParagraphEntry, PackManifest types + zod schemas |
| `tools/pack-builder/src/types.ts` | re-export shared types |
| `tools/pack-builder/src/registry.ts` | load + validate standards-registry.yaml |
| `tools/pack-builder/src/vault-sync.ts` | copy markdown + writing-spec from vault |
| `tools/pack-builder/src/paragraph-indexer.ts` | extract paragraph anchors from markdown |
| `tools/pack-builder/src/search-indexer.ts` | build SQLite FTS5 index |
| `tools/pack-builder/src/pack-writer.ts` | assemble staging dir + zip + sha256 |
| `tools/pack-builder/src/cli.ts` | commander CLI entry |
| `tools/pack-builder/tests/fixtures/` | minimal vault + registry fixtures for tests |

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/tsconfig.json`
- Create: `tools/pack-builder/package.json`
- Create: `tools/pack-builder/tsconfig.json`
- Create: `tools/pack-builder/vitest.config.ts`

- [ ] **Step 1: Create workspace root package.json**

```json
{
  "name": "accounting-copilot",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "test": "pnpm -r test",
    "pack:build": "pnpm --filter @asd/pack-builder start"
  },
  "engines": { "node": ">=22" }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
  - 'tools/*'
  - 'app'
```

- [ ] **Step 3: Create shared-types package with zod schemas**

`packages/shared-types/src/index.ts`:

```typescript
import { z } from 'zod';

export const FrameworkSchema = z.enum(['IFRS', 'IAS', 'ASC']);
export const StatusSchema = z.enum(['current', 'legacy']);

export const RegistryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  title_zh: z.string().optional(),
  framework: FrameworkSchema,
  status: StatusSchema,
  legacy_label: z.string().optional(),
  effective_from: z.string().optional(),
  effective_until: z.string().optional(),
  superseded_by: z.string().optional(),
  supersedes: z.array(z.string()).optional(),
  official_url: z.string().url(),
  official_url_note: z.string().optional(),
  vault_path: z.string().min(1),
  pack_filename: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

export const ParagraphEntrySchema = z.object({
  standard_id: z.string(),
  paragraph: z.string(),
  paragraph_normalized: z.string(),
  pack_path: z.string(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  snippet_en: z.string(),
  status: StatusSchema,
});

export type ParagraphEntry = z.infer<typeof ParagraphEntrySchema>;
```

- [ ] **Step 4: Install dependencies**

```bash
cd /workspace
pnpm install
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml packages/
git commit -m "chore: scaffold pnpm monorepo with shared-types"
```

---

### Task 2: Registry Loader

**Files:**
- Create: `tools/pack-builder/src/registry.ts`
- Create: `tools/pack-builder/tests/registry.test.ts`
- Test: `tools/pack-builder/tests/registry.test.ts`

- [ ] **Step 1: Write failing test for registry load**

`tools/pack-builder/tests/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadRegistry } from '../src/registry.js';
import path from 'node:path';

const FIXTURE = path.join(__dirname, 'fixtures/registry-minimal.yaml');

describe('loadRegistry', () => {
  it('parses valid yaml entries', () => {
    const entries = loadRegistry(FIXTURE);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('IFRS 11');
    expect(entries[0].framework).toBe('IFRS');
  });

  it('rejects duplicate ids', () => {
    const bad = path.join(__dirname, 'fixtures/registry-duplicate.yaml');
    expect(() => loadRegistry(bad)).toThrow(/duplicate id/i);
  });

  it('rejects missing official_url', () => {
    const bad = path.join(__dirname, 'fixtures/registry-missing-url.yaml');
    expect(() => loadRegistry(bad)).toThrow(/official_url/i);
  });
});
```

Create fixtures in `tools/pack-builder/tests/fixtures/`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/tools/pack-builder
pnpm vitest run tests/registry.test.ts
```

Expected: FAIL — `loadRegistry` not defined

- [ ] **Step 3: Implement registry.ts**

```typescript
import fs from 'node:fs';
import yaml from 'yaml';
import { RegistryEntrySchema, type RegistryEntry } from '@asd/shared-types';
import path from 'node:path';

export function loadRegistry(filePath: string): RegistryEntry[] {
  const raw = yaml.parse(fs.readFileSync(filePath, 'utf8')) as unknown[];
  if (!Array.isArray(raw)) throw new Error('Registry must be a YAML array');

  const entries: RegistryEntry[] = raw.map((item, i) => {
    const result = RegistryEntrySchema.safeParse(item);
    if (!result.success) {
      throw new Error(`Registry entry ${i}: ${result.error.message}`);
    }
    return result.data;
  });

  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) throw new Error(`duplicate id: ${e.id}`);
    ids.add(e.id);
  }

  return entries;
}

export function resolvePackPath(entry: RegistryEntry, filename: string): string {
  const folder = entry.status === 'legacy' ? 'archive' : 'current';
  return path.posix.join(folder, entry.framework, filename);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/registry.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/pack-builder/src/registry.ts tools/pack-builder/tests/
git commit -m "feat(pack-builder): add registry loader with validation"
```

---

### Task 3: Vault Sync

**Files:**
- Create: `tools/pack-builder/src/vault-sync.ts`
- Create: `tools/pack-builder/tests/vault-sync.test.ts`
- Create: `tools/pack-builder/tests/fixtures/vault/` (minimal tree)

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { syncVaultFiles } from '../src/vault-sync.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('syncVaultFiles', () => {
  it('copies markdown to current/archive staging paths', () => {
    const vault = path.join(__dirname, 'fixtures/vault');
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-'));
    const entries = [
      {
        id: 'IFRS 11', title: 'Joint Arrangements', framework: 'IFRS' as const,
        status: 'current' as const, official_url: 'https://example.com',
        vault_path: '03 - 知识库/IFRS/IFRS准则/IFRS 11 - Joint Arrangements.md',
      },
    ];
    const copied = syncVaultFiles({ vaultRoot: vault, stagingRoot: staging, entries });
    expect(copied).toHaveLength(1);
    const dest = path.join(staging, 'current/IFRS/IFRS 11 - Joint Arrangements.md');
    expect(fs.existsSync(dest)).toBe(true);
  });

  it('throws when vault_path missing', () => {
    const vault = path.join(__dirname, 'fixtures/vault');
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-'));
    const entries = [
      {
        id: 'MISSING', title: 'X', framework: 'IFRS' as const,
        status: 'current' as const, official_url: 'https://example.com',
        vault_path: '03 - 知识库/nonexistent.md',
      },
    ];
    expect(() => syncVaultFiles({ vaultRoot: vault, stagingRoot: staging, entries }))
      .toThrow(/vault_path not found/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement vault-sync.ts**

Key functions:
- `syncVaultFiles({ vaultRoot, stagingRoot, entries })` — copy each vault_path
- `syncWritingSpec({ vaultRoot, stagingRoot })` — copy `02 - 项目/项目编写说明.md` and SKILL.md

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pack-builder): add vault file sync"
```

---

### Task 4: Paragraph Indexer

**Files:**
- Create: `tools/pack-builder/src/paragraph-indexer.ts`
- Create: `tools/pack-builder/tests/paragraph-indexer.test.ts`
- Create: `tools/pack-builder/tests/fixtures/markdown/ifrs11-sample.md`

- [ ] **Step 1: Write failing tests for IFRS/IAS and ASC patterns**

```typescript
describe('indexParagraphs', () => {
  it('extracts IFRS Paragraph references', () => {
    const content = 'Some text.\n\nParagraph 7\n\nJoint control is...';
    const entries = indexParagraphs({
      standardId: 'IFRS 11', packPath: 'current/IFRS/x.md',
      content, status: 'current',
    });
    expect(entries.some(e => e.paragraph_normalized === '7')).toBe(true);
  });

  it('extracts ASC codification references', () => {
    const content = 'Per 740-10-25-5, deferred tax...';
    const entries = indexParagraphs({
      standardId: 'ASC 740', packPath: 'current/ASC/x.md',
      content, status: 'current',
    });
    expect(entries.some(e => e.paragraph === '740-10-25-5')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement with regex**

```typescript
const IFRS_IAS_RE = /(?:Paragraph|§)\s*(\d+(?:[–-]\d+)?)/gi;
const ASC_RE = /\b(\d{3}-\d{2}-\d{2}-\d+)\b/g;
```

For each match: record char_start, char_end, snippet_en (120 chars from match position).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

---

### Task 5: Search Indexer (SQLite FTS5)

**Files:**
- Create: `tools/pack-builder/src/search-indexer.ts`
- Create: `tools/pack-builder/tests/search-indexer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('creates FTS index searchable by keyword', () => {
  const dbPath = path.join(os.tmpdir(), `search-${Date.now()}.sqlite`);
  buildSearchIndex(dbPath, [
    { pack_path: 'current/IFRS/a.md', standard_id: 'IFRS 11', title: 'Joint Arrangements', body: 'joint control contractually agreed' },
  ]);
  const hits = searchIndex(dbPath, 'joint control');
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0].standard_id).toBe('IFRS 11');
});
```

- [ ] **Step 2–4: Implement with better-sqlite3 FTS5 virtual table**

- [ ] **Step 5: Commit**

---

### Task 6: Pack Writer

**Files:**
- Create: `tools/pack-builder/src/pack-writer.ts`
- Create: `tools/pack-builder/tests/pack-writer.test.ts`

- [ ] **Step 1: Write failing test — zip contains required files**

```typescript
it('produces zip with pack-manifest.json and registry.json', async () => {
  const zipPath = await writePack({ stagingRoot, contentVersion: '2026.06.18', ... });
  const files = await listZipEntries(zipPath);
  expect(files).toContain('pack-manifest.json');
  expect(files).toContain('registry.json');
  expect(files).toContain('index/paragraphs.json');
  expect(files).toContain('index/search.sqlite');
});
```

- [ ] **Step 2–4: Implement using archiver, compute sha256**

- [ ] **Step 5: Commit**

---

### Task 7: CLI Integration

**Files:**
- Create: `tools/pack-builder/src/cli.ts`
- Modify: `tools/pack-builder/package.json` (bin + scripts)

- [ ] **Step 1: Implement commander CLI**

```typescript
program
  .name('pack-builder')
  .requiredOption('--vault <path>')
  .requiredOption('--registry <path>')
  .option('--output <path>', 'output zip path')
  .option('--content-version <ver>', 'default: YYYY.MM.DD today')
  .action(async (opts) => { /* orchestrate all steps */ });
```

- [ ] **Step 2: Integration test with fixture vault**

```bash
pnpm --filter @asd/pack-builder start -- \
  --vault tools/pack-builder/tests/fixtures/vault \
  --registry tools/pack-builder/tests/fixtures/registry-minimal.yaml \
  --output /tmp/test-pack.zip
```

Expected: zip created, non-zero size, exit 0

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(pack-builder): add CLI orchestration"
```

---

### Task 8: Full Registry Validation Against Vault

**Files:**
- Create: `tools/pack-builder/src/validate-registry.ts`
- Create: script `scripts/validate-registry.sh`

- [ ] **Step 1: Add validation script that checks all 130 vault_paths**

When Vault is available:

```bash
git clone --depth 1 https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap /tmp/vault
node tools/pack-builder/dist/validate-registry.js \
  --vault /tmp/vault \
  --registry standards-registry.yaml
```

Expected: report missing paths (if any) or exit 0

- [ ] **Step 2: Fix registry entries for any missing vault_paths**

- [ ] **Step 3: Commit**

---

### Task 9: CI Workflow (build-pack.yml)

**Files:**
- Modify: `.github/workflows/build-pack.yml`

- [ ] **Step 1: Implement workflow**

```yaml
name: Build Content Pack
on:
  workflow_dispatch:
    inputs:
      vault_ref:
        description: 'Vault git ref'
        default: 'main'
  schedule:
    - cron: '0 6 * * 1'  # weekly Monday

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install
      - run: pnpm test
      - name: Clone Vault
        run: git clone --depth 1 --branch ${{ inputs.vault_ref }} https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap /tmp/vault
      - name: Build pack
        run: |
          VERSION=$(date +%Y.%m.%d)
          pnpm pack:build -- --vault /tmp/vault --registry standards-registry.yaml --output build/standards-pack-$VERSION.zip
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: content-${{ steps.version.outputs.version }}
          files: build/standards-pack-*.zip
```

- [ ] **Step 2: Commit**

---

### Task 10: First Release Dry Run

- [ ] **Step 1: Run full build locally or via workflow_dispatch**

- [ ] **Step 2: Verify zip contents manually**

```bash
unzip -l build/standards-pack-*.zip | head -30
```

- [ ] **Step 3: Update updates/manifest.json with real SHA256**

- [ ] **Step 4: Commit manifest + tag**

```bash
git commit -m "chore: first content pack manifest"
```

---

## Phase 0 Done Checklist

- [ ] `pnpm test` passes in workspace
- [ ] CLI builds pack from Vault
- [ ] zip structure matches DESIGN.md §5.1
- [ ] 130 registry entries validated
- [ ] CI workflow_dispatch succeeds
- [ ] updates/manifest.json populated

---

## Next Phase

After Phase 0 approval, proceed to [2026-06-18-phase1-tauri-browser.md](./2026-06-18-phase1-tauri-browser.md).
