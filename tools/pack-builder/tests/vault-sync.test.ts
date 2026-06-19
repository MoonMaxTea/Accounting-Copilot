import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { syncVaultFiles, syncWritingSpec } from '../src/vault-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('syncVaultFiles', () => {
  it('copies markdown to current/archive staging paths', () => {
    const vault = path.join(__dirname, 'fixtures/vault');
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-'));
    const entries = [
      {
        id: 'IFRS 11',
        title: 'Joint Arrangements',
        framework: 'IFRS' as const,
        status: 'current' as const,
        official_url: 'https://example.com',
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
        id: 'MISSING',
        title: 'X',
        framework: 'IFRS' as const,
        status: 'current' as const,
        official_url: 'https://example.com',
        vault_path: '03 - 知识库/nonexistent.md',
      },
    ];
    expect(() => syncVaultFiles({ vaultRoot: vault, stagingRoot: staging, entries })).toThrow(
      /vault_path not found/i,
    );
  });
});

describe('syncWritingSpec', () => {
  it('copies writing spec files when present', () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-'));

    const guideDir = path.join(vault, '02 - 项目');
    fs.mkdirSync(guideDir, { recursive: true });
    fs.writeFileSync(path.join(guideDir, '项目编写说明.md'), '# guide');

    const skillDir = path.join(vault, '.cursor/skills/writing-accounting-standards-notes');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');

    const result = syncWritingSpec(vault, staging);
    expect(result.copied).toContain('writing-spec/项目编写说明.md');
    expect(result.copied).toContain('writing-spec/SKILL.md');
  });
});
