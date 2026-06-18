import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, resolvePackPath } from '../src/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures/registry-minimal.yaml');

describe('loadRegistry', () => {
  it('parses valid yaml entries', () => {
    const entries = loadRegistry(FIXTURE);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe('IFRS 11');
    expect(entries[0]?.framework).toBe('IFRS');
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

describe('resolvePackPath', () => {
  it('places legacy entries in archive folder', () => {
    const entries = loadRegistry(FIXTURE);
    const legacy = entries[1];
    expect(legacy).toBeDefined();
    expect(resolvePackPath(legacy!, 'IAS 31 - Interests In Joint Ventures.md')).toBe(
      'archive/IAS/IAS 31 - Interests In Joint Ventures.md',
    );
  });
});
