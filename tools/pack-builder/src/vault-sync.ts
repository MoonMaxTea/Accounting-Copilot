import fs from 'node:fs';
import path from 'node:path';
import type { CopiedStandardFile, RegistryEntry } from '@asd/shared-types';
import { resolvePackFilename, resolvePackPath } from './registry.js';

export interface SyncVaultFilesOptions {
  vaultRoot: string;
  stagingRoot: string;
  entries: RegistryEntry[];
}

export interface SyncWritingSpecResult {
  copied: string[];
  missing: string[];
}

const WRITING_SPEC_SOURCES = [
  {
    vaultRelativePath: '02 - 项目/项目编写说明.md',
    packRelativePath: 'writing-spec/项目编写说明.md',
  },
  {
    vaultRelativePath: '.cursor/skills/writing-accounting-standards-notes/SKILL.md',
    packRelativePath: 'writing-spec/SKILL.md',
  },
] as const;

export function syncVaultFiles(options: SyncVaultFilesOptions): CopiedStandardFile[] {
  const { vaultRoot, stagingRoot, entries } = options;
  const copied: CopiedStandardFile[] = [];

  for (const entry of entries) {
    const sourcePath = path.join(vaultRoot, entry.vault_path);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`vault_path not found: ${entry.vault_path}`);
    }

    const filename = resolvePackFilename(entry);
    const packPath = resolvePackPath(entry, filename);
    const destinationPath = path.join(stagingRoot, packPath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);

    copied.push({
      entry,
      packPath,
      absolutePath: destinationPath,
      content: fs.readFileSync(destinationPath, 'utf8'),
    });
  }

  return copied;
}

export function syncWritingSpec(
  vaultRoot: string,
  stagingRoot: string,
): SyncWritingSpecResult {
  const copied: string[] = [];
  const missing: string[] = [];

  for (const source of WRITING_SPEC_SOURCES) {
    const sourcePath = path.join(vaultRoot, source.vaultRelativePath);
    const destinationPath = path.join(stagingRoot, source.packRelativePath);

    if (!fs.existsSync(sourcePath)) {
      missing.push(source.vaultRelativePath);
      continue;
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    copied.push(source.packRelativePath);
  }

  return { copied, missing };
}
