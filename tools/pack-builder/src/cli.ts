import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { indexCopiedFiles } from './paragraph-indexer.js';
import { writePack } from './pack-writer.js';
import { loadRegistry, validateVaultPaths } from './registry.js';
import { syncVaultFiles, syncWritingSpec } from './vault-sync.js';

const VAULT_REPO = 'https://github.com/MoonMaxTea/AccoutingStandards-IFRS-USGaap';

function todayContentVersion(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function resolveVaultCommit(vaultRoot: string): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: vaultRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

export interface BuildPackOptions {
  vault: string;
  registry: string;
  output?: string;
  contentVersion?: string;
  stagingRoot?: string;
}

export async function buildPack(options: BuildPackOptions): Promise<{
  zipPath: string;
  sha256: string;
  sizeBytes: number;
  contentVersion: string;
  missingWritingSpec: string[];
}> {
  const contentVersion = options.contentVersion ?? todayContentVersion();
  const outputPath =
    options.output ??
    path.join(process.cwd(), 'build', `standards-pack-${contentVersion}.zip`);
  const stagingRoot =
    options.stagingRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'asd-pack-'));

  const entries = loadRegistry(options.registry);
  const missingPaths = validateVaultPaths(options.vault, entries);
  if (missingPaths.length > 0) {
    throw new Error(
      `Missing ${missingPaths.length} vault_path entries:\n${missingPaths.slice(0, 10).join('\n')}${
        missingPaths.length > 10 ? `\n...and ${missingPaths.length - 10} more` : ''
      }`,
    );
  }

  const copiedFiles = syncVaultFiles({
    vaultRoot: options.vault,
    stagingRoot,
    entries,
  });
  const writingSpec = syncWritingSpec(options.vault, stagingRoot);
  const paragraphEntries = indexCopiedFiles(copiedFiles);
  const vaultCommit = resolveVaultCommit(options.vault);

  const result = await writePack({
    stagingRoot,
    outputPath,
    contentVersion,
    vaultRepo: VAULT_REPO,
    vaultCommit,
    entries,
    copiedFiles,
    paragraphEntries,
    writingSpecCopied: writingSpec.copied,
    writingSpecMissing: writingSpec.missing,
  });

  return {
    zipPath: result.zipPath,
    sha256: result.sha256,
    sizeBytes: result.sizeBytes,
    contentVersion,
    missingWritingSpec: writingSpec.missing,
  };
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('pack-builder')
    .description('Build standards content pack from Vault + registry')
    .requiredOption('--vault <path>', 'Path to cloned Vault repository')
    .requiredOption('--registry <path>', 'Path to standards-registry.yaml')
    .option('--output <path>', 'Output zip path')
    .option('--content-version <version>', 'Content version, default YYYY.MM.DD')
    .action(async (opts) => {
      const result = await buildPack({
        vault: opts.vault,
        registry: opts.registry,
        output: opts.output,
        contentVersion: opts.contentVersion,
      });

      console.log(`Built ${result.zipPath}`);
      console.log(`SHA256: ${result.sha256}`);
      console.log(`Size: ${result.sizeBytes} bytes`);
      if (result.missingWritingSpec.length > 0) {
        console.warn(
          `Warning: missing writing-spec sources:\n${result.missingWritingSpec.join('\n')}`,
        );
      }
    });

  await program.parseAsync(process.argv);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
