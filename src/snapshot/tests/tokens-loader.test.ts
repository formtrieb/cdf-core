import { describe, it, expect } from 'vitest';
import { loadTokensFromDir } from '../tokens-loader.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, 'fixtures/tokens-studio');

describe('tokens-loader', () => {
  it('returns empty {} when tokensDir is undefined (graceful)', async () => {
    const result = await loadTokensFromDir(undefined);
    expect(result).toEqual({});
  });

  it('reads $themes.json from a valid Tokens-Studio directory', async () => {
    const result = await loadTokensFromDir(FIXTURE_DIR);
    expect(result.$themes).toHaveLength(3);
    expect(result.$themes![0].name).toBe('Light');
    expect(result.$themes![0].group).toBe('Semantic');
  });

  it('throws when tokensDir provided but does not exist', async () => {
    await expect(loadTokensFromDir('/nonexistent/path/xyz')).rejects.toThrow(/tokensDir/);
  });

  it('throws when tokensDir provided but $themes.json missing', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cdf-tokens-empty-'));
    try {
      await expect(loadTokensFromDir(tmp)).rejects.toThrow(/\$themes\.json/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws when $themes.json is malformed JSON', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cdf-tokens-bad-'));
    try {
      writeFileSync(join(tmp, '$themes.json'), '{ this is not json', 'utf8');
      await expect(loadTokensFromDir(tmp)).rejects.toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
