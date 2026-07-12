import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { produceSnapshot } from '../index.js';
import walker from './fixtures/small-ds-walker.json';
import tokens from './fixtures/small-ds-tokens.json';

describe('produceSnapshot — wall-time D4 acceptance', () => {
  it('skeleton-write phase completes in <5s on small DS', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cdf-walltime-'));
    try {
      const result = await produceSnapshot(
        { figmaUrl: 'https://figma.com/design/X/Small', outDir: tmp },
        {
          fetchAndWalk: async () => walker as any,
          loadTokens: async () => tokens as any,
          extractSetNames: () => ['Semantic/light', 'Semantic/dark'],
        },
      );
      expect(result.walltimeMs).toBeLessThan(5_000);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
