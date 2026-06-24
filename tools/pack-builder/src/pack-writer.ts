import archiver from 'archiver';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CopiedStandardFile,
  PackBuildResult,
  ParagraphEntry,
  RegistryEntry,
} from '@asd/shared-types';
import { resolvePackFilename, resolvePackPath } from './registry.js';
import { buildSearchIndex } from './search-indexer.js';

export interface WritePackOptions {
  stagingRoot: string;
  outputPath: string;
  contentVersion: string;
  vaultRepo: string;
  vaultCommit: string;
  entries: RegistryEntry[];
  copiedFiles: CopiedStandardFile[];
  paragraphEntries: ParagraphEntry[];
  writingSpecCopied: string[];
  writingSpecMissing: string[];
  packBuilderVersion?: string;
}

function countByCategory(
  files: CopiedStandardFile[],
): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const file of files) {
    const category = file.entry.category ?? 'accounting-standards';
    counts[category] ??= {};
    counts[category][file.entry.framework] = (counts[category][file.entry.framework] ?? 0) + 1;
  }
  return counts;
}

function buildRegistryJson(
  entries: RegistryEntry[],
  copiedFiles: CopiedStandardFile[],
  contentVersion: string,
  vaultRepo: string,
  vaultCommit: string,
): Record<string, unknown> {
  const packPathById = new Map(copiedFiles.map((file) => [file.entry.id, file.packPath]));

  const standards = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    title_zh: entry.title_zh ?? null,
    category: entry.category ?? null,
    framework: entry.framework,
    status: entry.status,
    legacy_label: entry.legacy_label ?? null,
    effective_from: entry.effective_from ?? null,
    effective_until: entry.effective_until ?? null,
    superseded_by: entry.superseded_by ?? null,
    supersedes: entry.supersedes ?? [],
    official_url: entry.official_url,
    official_url_note: entry.official_url_note ?? null,
    pack_path:
      packPathById.get(entry.id) ??
      resolvePackPath(entry, resolvePackFilename(entry)),
    tags: entry.tags ?? [],
  }));

  const currentFiles = copiedFiles.filter((file) => file.entry.status === 'current');
  const legacyFiles = copiedFiles.filter((file) => file.entry.status === 'legacy');

  return {
    schema_version: 1,
    content_version: contentVersion,
    vault_repo: vaultRepo,
    vault_commit: vaultCommit,
    built_at: new Date().toISOString(),
    standards,
    counts: {
      current: countByCategory(currentFiles),
      legacy: countByCategory(legacyFiles),
    },
  };
}

async function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

export async function listZipEntries(zipPath: string): Promise<string[]> {
  const output = execSync(`unzip -Z1 ${JSON.stringify(zipPath)}`, { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

export async function writePack(options: WritePackOptions): Promise<PackBuildResult> {
  const {
    stagingRoot,
    outputPath,
    contentVersion,
    vaultRepo,
    vaultCommit,
    entries,
    copiedFiles,
    paragraphEntries,
    writingSpecCopied,
    writingSpecMissing,
    packBuilderVersion = '0.1.0',
  } = options;

  const registryJson = buildRegistryJson(
    entries,
    copiedFiles,
    contentVersion,
    vaultRepo,
    vaultCommit,
  );
  fs.writeFileSync(
    path.join(stagingRoot, 'registry.json'),
    `${JSON.stringify(registryJson, null, 2)}\n`,
    'utf8',
  );

  const paragraphsPath = path.join(stagingRoot, 'index', 'paragraphs.json');
  fs.mkdirSync(path.dirname(paragraphsPath), { recursive: true });
  fs.writeFileSync(
    paragraphsPath,
    `${JSON.stringify({ entries: paragraphEntries }, null, 2)}\n`,
    'utf8',
  );

  buildSearchIndex(
    path.join(stagingRoot, 'index', 'search.sqlite'),
    copiedFiles.map((file) => ({
      pack_path: file.packPath,
      standard_id: file.entry.id,
      title: file.entry.title,
      body: file.content,
    })),
  );

  const currentFiles = copiedFiles.filter((file) => file.entry.status === 'current');
  const legacyFiles = copiedFiles.filter((file) => file.entry.status === 'legacy');

  const manifest = {
    content_version: contentVersion,
    vault_repo: vaultRepo,
    vault_commit: vaultCommit,
    built_at: new Date().toISOString(),
    pack_builder_version: packBuilderVersion,
    counts: {
      current: countByCategory(currentFiles),
      legacy: countByCategory(legacyFiles),
      total_files: copiedFiles.length,
      paragraph_index_entries: paragraphEntries.length,
    },
    writing_spec: {
      files: writingSpecCopied,
      vault_sources: writingSpecCopied.map((file) =>
        file.replace(/^writing-spec\//, ''),
      ),
      missing: writingSpecMissing,
    },
    integrity: {
      algorithm: 'sha256',
      registry_sha256: createHash('sha256')
        .update(fs.readFileSync(path.join(stagingRoot, 'registry.json')))
        .digest('hex'),
      index_paragraphs_sha256: createHash('sha256')
        .update(fs.readFileSync(paragraphsPath))
        .digest('hex'),
    },
  };

  fs.writeFileSync(
    path.join(stagingRoot, 'pack-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  await zipDirectory(stagingRoot, outputPath);

  const fileBuffer = fs.readFileSync(outputPath);
  return {
    zipPath: outputPath,
    sha256: createHash('sha256').update(fileBuffer).digest('hex'),
    sizeBytes: fileBuffer.length,
    contentVersion,
  };
}

export function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
