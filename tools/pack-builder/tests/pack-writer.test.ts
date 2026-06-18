import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../src/registry.js';
import { syncVaultFiles, syncWritingSpec } from '../src/vault-sync.js';
import { indexCopiedFiles } from '../src/paragraph-indexer.js';
import { listZipEntries, writePack } from '../src/pack-writer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('writePack', () => {
  it('produces zip with pack-manifest.json and registry.json', async () => {
    const vault = path.join(__dirname, 'fixtures/vault');
    const registry = path.join(__dirname, 'fixtures/registry-minimal.yaml');
    const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-staging-'));
    const outputPath = path.join(os.tmpdir(), `standards-pack-${Date.now()}.zip`);

    const entries = loadRegistry(registry);
    const copiedFiles = syncVaultFiles({ vaultRoot: vault, stagingRoot, entries });
    const writingSpec = syncWritingSpec(vault, stagingRoot);
    const paragraphEntries = indexCopiedFiles(copiedFiles);

    const result = await writePack({
      stagingRoot,
      outputPath,
      contentVersion: '2026.06.18',
      vaultRepo: 'https://example.com/vault',
      vaultCommit: 'abc1234',
      entries,
      copiedFiles,
      paragraphEntries,
      writingSpecCopied: writingSpec.copied,
      writingSpecMissing: writingSpec.missing,
    });

    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sizeBytes).toBeGreaterThan(0);

    const files = await listZipEntries(outputPath);
    expect(files).toContain('pack-manifest.json');
    expect(files).toContain('registry.json');
    expect(files).toContain('index/paragraphs.json');
    expect(files).toContain('index/search.sqlite');
  });
});
