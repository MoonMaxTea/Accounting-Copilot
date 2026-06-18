import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { RegistryEntrySchema, type RegistryEntry } from '@asd/shared-types';

export function loadRegistry(filePath: string): RegistryEntry[] {
  const raw = yaml.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error('Registry must be a YAML array');
  }

  const entries: RegistryEntry[] = raw.map((item, index) => {
    const result = RegistryEntrySchema.safeParse(item);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new Error(`Registry entry ${index}: ${message}`);
    }
    return result.data;
  });

  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`duplicate id: ${entry.id}`);
    }
    ids.add(entry.id);
  }

  return entries;
}

export function resolvePackPath(entry: RegistryEntry, filename: string): string {
  const folder = entry.status === 'legacy' ? 'archive' : 'current';
  return path.posix.join(folder, entry.framework, filename);
}

export function resolvePackFilename(entry: RegistryEntry): string {
  if (entry.pack_filename) {
    return entry.pack_filename;
  }
  return path.basename(entry.vault_path);
}

export function validateVaultPaths(
  vaultRoot: string,
  entries: RegistryEntry[],
): string[] {
  const missing: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(vaultRoot, entry.vault_path);
    if (!fs.existsSync(absolutePath)) {
      missing.push(entry.vault_path);
    }
  }
  return missing;
}
