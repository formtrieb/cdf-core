import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFigmaFile } from '../fetch.js';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIGMA_OK_RESPONSE = {
  name: 'TestDS',
  document: { children: [] },
  componentSets: {},
};

describe('fetch', () => {
  let cacheDir: string;
  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'cdf-fetch-cache-'));
    delete process.env.FIGMA_PAT;
  });
  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.FIGMA_PAT;
  });

  it('throws when no PAT is provided (neither arg nor env)', async () => {
    await expect(
      fetchFigmaFile({ figmaUrl: 'https://figma.com/design/ABC/test', cacheDir }),
    ).rejects.toThrow(/FIGMA_PAT/);
  });

  it('uses pat arg over env var', async () => {
    process.env.FIGMA_PAT = 'env-pat';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIGMA_OK_RESPONSE,
    });
    await fetchFigmaFile(
      { figmaUrl: 'https://figma.com/design/ABC/test', pat: 'arg-pat', cacheDir },
      { fetchImpl: fetchSpy as any },
    );
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers['X-Figma-Token']).toBe('arg-pat');
  });

  it('parses file_key from a /design/ URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIGMA_OK_RESPONSE,
    });
    await fetchFigmaFile(
      { figmaUrl: 'https://figma.com/design/ABCKEY/MyDS', pat: 'p', cacheDir },
      { fetchImpl: fetchSpy as any },
    );
    expect(fetchSpy.mock.calls[0][0]).toContain('/files/ABCKEY');
  });

  it('returns parsed JSON on 200', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIGMA_OK_RESPONSE,
    });
    const result = await fetchFigmaFile(
      { figmaUrl: 'https://figma.com/design/X/y', pat: 'p', cacheDir },
      { fetchImpl: fetchSpy as any },
    );
    expect(result.json).toEqual(FIGMA_OK_RESPONSE);
    expect(result.source).toBe('rest');
  });

  it('throws on 403 with PAT/access hint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });
    await expect(
      fetchFigmaFile(
        { figmaUrl: 'https://figma.com/design/X/y', pat: 'p', cacheDir },
        { fetchImpl: fetchSpy as any },
      ),
    ).rejects.toThrow(/403|PAT|access/);
  });

  it('reads from cache on second call within TTL (no fetch invocation)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIGMA_OK_RESPONSE,
    });
    const args = { figmaUrl: 'https://figma.com/design/CACHE/x', pat: 'p', cacheDir };
    const r1 = await fetchFigmaFile(args, { fetchImpl: fetchSpy as any });
    expect(r1.source).toBe('rest');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const r2 = await fetchFigmaFile(args, { fetchImpl: fetchSpy as any });
    expect(r2.source).toBe('cache');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(existsSync(join(cacheDir, 'CACHE.json'))).toBe(true);
  });
});
