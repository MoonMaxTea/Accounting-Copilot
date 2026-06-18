import { Command } from 'commander';
import { loadRegistry, validateVaultPaths } from './registry.js';

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('validate-registry')
    .description('Validate standards-registry.yaml vault_path entries against a Vault clone')
    .requiredOption('--vault <path>', 'Path to cloned Vault repository')
    .requiredOption('--registry <path>', 'Path to standards-registry.yaml')
    .action((opts) => {
      const entries = loadRegistry(opts.registry);
      const missing = validateVaultPaths(opts.vault, entries);

      if (missing.length > 0) {
        console.error(`Missing ${missing.length} vault_path entries:`);
        for (const item of missing) {
          console.error(`- ${item}`);
        }
        process.exit(1);
      }

      console.log(`Validated ${entries.length} registry entries against ${opts.vault}`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
