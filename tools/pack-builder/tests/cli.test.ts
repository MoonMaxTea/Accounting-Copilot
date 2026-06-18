import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildPack } from '../src/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('buildPack integration', () => {
  it('builds a zip from fixture vault and registry', async () => {
    const outputPath = path.join(os.tmpdir(), `integration-pack-${Date.now()}.zip`);
    const result = await buildPack({
      vault: path.join(__dirname, 'fixtures/vault'),
      registry: path.join(__dirname, 'fixtures/registry-minimal.yaml'),
      output: outputPath,
      contentVersion: '2026.06.18',
    });

    expect(fs.existsSync(result.zipPath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
