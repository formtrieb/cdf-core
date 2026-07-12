import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produceSnapshot } from '../index.js';
import { parseMarkers } from '../marker-grammar.js';
import { parse as parseYaml } from 'yaml';
import walker from './fixtures/small-ds-walker.json';
import tokens from './fixtures/small-ds-tokens.json';
import figmaRestFixture from './fixtures/small-ds-figma-rest.json';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('produceSnapshot — end-to-end golden fixture', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cdf-snapshot-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('produces both files with correct MCP-first marker counts', async () => {
    const result = await produceSnapshot(
      { figmaUrl: 'https://figma.com/design/SMALL_DS_KEY/SmallDS', outDir: tmp },
      {
        fetchAndWalk: async () => ({
          componentSets: walker.componentSets as Array<{ name: string; properties: Record<string, string[]> }>,
          fetchSource: 'rest' as const,
          reportedTotal: walker.componentSets.length,
          actualCount: walker.componentSets.length,
        }),
        loadTokens: async () => ({
          $themes: tokens.$themes as unknown as Array<{ group?: string; name: string; selectedTokenSets?: Record<string, 'source' | 'disabled' | 'enabled'> }>,
          tokensSource: 'filesystem' as const,
          themesArrayEmpty: tokens.$themes !== undefined && tokens.$themes.length === 0,
        }),
        extractSetNames: () => ['Semantic/light', 'Semantic/dark', 'Device/desktop'],
      },
    );

    const profile = readFileSync(result.profilePath, 'utf8');
    const findings = readFileSync(result.findingsPath, 'utf8');

    const profileMarkers = parseMarkers(profile);
    const findingsMarkers = parseMarkers(findings);

    // Profile has prose markers from analyzed inventory; D1 invariant: no TBD-name in profile
    expect(profileMarkers.prose).toBeGreaterThan(0);
    expect(profileMarkers.name).toBe(0);            // D1: no TBD-name in profile
    expect(profileMarkers.classification).toBe(0);  // D1: no TBD-classification in profile

    // Plan 1.3: tokensSource='filesystem' → no tokens-source blind-spot
    // variables-endpoint always emits (1 blind-spot prose marker)
    // intent outliers: secondary(Button), info(Tag), success/warning/danger(StatusChip) = 5 prose markers
    // Total = 6 TBD-prose markers in findings
    expect(findingsMarkers.total).toBe(6);

    expect(() => parseYaml(profile)).not.toThrow();
  });

  it('reports stats and toolSurvey in result', async () => {
    const result = await produceSnapshot(
      { figmaUrl: 'https://figma.com/design/SMALL_DS_KEY/SmallDS', outDir: tmp },
      {
        fetchAndWalk: async () => ({
          componentSets: walker.componentSets as Array<{ name: string; properties: Record<string, string[]> }>,
          fetchSource: 'rest' as const,
          reportedTotal: walker.componentSets.length,
          actualCount: walker.componentSets.length,
        }),
        loadTokens: async () => ({
          $themes: tokens.$themes as unknown as Array<{ group?: string; name: string; selectedTokenSets?: Record<string, 'source' | 'disabled' | 'enabled'> }>,
          tokensSource: 'filesystem' as const,
          themesArrayEmpty: tokens.$themes !== undefined && tokens.$themes.length === 0,
        }),
        extractSetNames: () => ['Semantic/light', 'Semantic/dark', 'Device/desktop'],
      },
    );

    expect(result.stats.componentSetsCount).toBe(3);
    expect(result.stats.vocabulariesCount).toBe(2);
    expect(result.stats.tbdMarkersCount).toBeGreaterThan(0);
    expect(result.walltimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('produceSnapshot — Plan 1.2 real-stage-A paths', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cdf-snapshot-real-'));
    process.env.FIGMA_PAT = 'test-pat';
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    delete process.env.FIGMA_PAT;
    vi.restoreAllMocks();
  });

  it('graceful no-tokens path: snapshot produced with tokens-source blind-spot finding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => figmaRestFixture,
    }));

    const result = await produceSnapshot({
      figmaUrl: 'https://figma.com/design/SMALL/Test',
      outDir: tmp,
    });

    expect(result.toolSurvey.tokensSource).toBe('none');
    // Plan 1.3: tokens-source + variables-endpoint always emit => >= 2 blind-spots
    expect(result.stats.blindSpotsCount).toBeGreaterThanOrEqual(2);

    const findings = readFileSync(result.findingsPath, 'utf8');
    expect(findings).toContain('## Blind Spots');
    expect(findings).toContain('tokens-source');
  });

  it('with-tokens path: snapshot uses filesystem tokens source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => figmaRestFixture,
    }));

    const fixtureTokensDir = join(__dirname, 'fixtures/tokens-studio');
    const result = await produceSnapshot({
      figmaUrl: 'https://figma.com/design/SMALL/Test',
      outDir: tmp,
      tokensDir: fixtureTokensDir,
    });

    expect(result.toolSurvey.tokensSource).toBe('filesystem');
    // Plan 1.3: variables-endpoint always emits => >= 1 blind-spot even with tokens
    expect(result.stats.blindSpotsCount).toBeGreaterThanOrEqual(1);

    const profile = readFileSync(result.profilePath, 'utf8');
    expect(profile).toContain('Semantic:');
    expect(profile).toContain('Foundation/colors');
  });
});

describe('produceSnapshot — Plan 1.3 findings integration', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cdf-snapshot-findings-'));
    process.env.FIGMA_PAT = 'test-pat';
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    delete process.env.FIGMA_PAT;
    vi.restoreAllMocks();
  });

  it('emits collision + outlier + blind-spot findings end-to-end', async () => {
    // Walker designed to trigger BOTH a collision (state and interaction with same value-set)
    // AND an outlier (Tag adds 'info' that no other component carries).
    const richWalker: { componentSets: Array<{ name: string; properties: Record<string, string[]> }> } = {
      componentSets: [
        { name: 'Button',     properties: { intent: ['primary', 'secondary'], state: ['hover', 'focus'], interaction: ['hover', 'focus'] } },
        { name: 'StatusChip', properties: { intent: ['success', 'warning'], state: ['hover', 'focus'], interaction: ['hover', 'focus'] } },
        { name: 'Tag',        properties: { intent: ['primary', 'info'] } },
      ],
    };

    const result = await produceSnapshot(
      { figmaUrl: 'https://figma.com/design/X/Test', outDir: tmp },
      {
        fetchAndWalk: async () => ({
          componentSets: richWalker.componentSets,
          fetchSource: 'rest' as const,
          reportedTotal: 3,
          actualCount: 3,
        }),
        loadTokens: async () => ({
          tokensSource: 'none' as const,
          themesArrayEmpty: false,
        }),
        extractSetNames: () => [],
      },
    );

    const findings = readFileSync(result.findingsPath, 'utf8');

    // Collision: state vs interaction (Jaccard 1.0 on [hover, focus])
    expect(findings).toContain('## Collisions');
    expect(findings).toMatch(/state.*interaction|interaction.*state/);

    // Outlier: Tag.intent.info (plus others — secondary, success, warning are also outliers)
    expect(findings).toContain('## Outliers');
    expect(findings).toContain('Tag');
    expect(findings).toContain('info');

    // Blind spots: tokens-source (because tokensSource='none') + variables-endpoint (always)
    expect(findings).toContain('## Blind Spots');
    expect(findings).toContain('tokens-source');
    expect(findings).toContain('variables-endpoint');

    // Stats reflect the findings
    expect(result.stats.findingsCount).toBeGreaterThan(0);
    expect(result.stats.blindSpotsCount).toBeGreaterThanOrEqual(2);
  });

  it('emits walker-truncation blind-spot when reportedTotal != actualCount', async () => {
    const result = await produceSnapshot(
      { figmaUrl: 'https://figma.com/design/X/Test', outDir: tmp },
      {
        fetchAndWalk: async () => ({
          componentSets: [{ name: 'A', properties: { x: ['1'] } }],
          fetchSource: 'cache' as const,
          reportedTotal: 5,
          actualCount: 1,
        }),
        loadTokens: async () => ({
          tokensSource: 'none' as const,
          themesArrayEmpty: false,
        }),
        extractSetNames: () => [],
      },
    );

    const findings = readFileSync(result.findingsPath, 'utf8');
    expect(findings).toContain('walker-truncation');
  });
});

describe('produceSnapshot — Plan 1.3.5 integration: all 4 finding types + rawName evidence', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cdf-snapshot-1.3.5-'));
    process.env.FIGMA_PAT = 'test-pat';
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    delete process.env.FIGMA_PAT;
    vi.restoreAllMocks();
  });

  it('emits collision + outlier + blind-spot + cross-validation findings + cites rawName', async () => {
    // Walker fixture deliberately includes:
    //  - whitespace-cruft name on Tag → walker normalizes; rawName carries the original
    //  - state vs interaction with same value-set (collision)
    //  - intent.info as an outlier on Tag
    //  - intent.success has no matching token-set fragment (cross-validation gap)
    const walker: { componentSets: Array<{ name: string; rawName?: string; properties: Record<string, string[]> }> } = {
      componentSets: [
        { name: 'Button',     rawName: 'Button',     properties: { intent: ['primary', 'secondary', 'success'], state: ['hover', 'focus'], interaction: ['hover', 'focus'] } },
        { name: 'StatusChip', rawName: 'StatusChip', properties: { intent: ['success', 'warning'],              state: ['hover', 'focus'], interaction: ['hover', 'focus'] } },
        { name: 'Tag',        rawName: '  Tag   X ', properties: { intent: ['primary', 'info'] } },
      ],
    };

    const result = await produceSnapshot(
      { figmaUrl: 'https://figma.com/design/X/Test', outDir: tmp },
      {
        fetchAndWalk: async () => ({
          componentSets: walker.componentSets,
          fetchSource: 'rest' as const,
          reportedTotal: 3,
          actualCount: 3,
        }),
        loadTokens: async () => ({
          // tokens 'present' so the cross-validator's empty-fragmentSet guard
          // does NOT skip Cv-A. We mock token-set names below via extractSetNames.
          $themes: [{ group: 'mode', name: 'Light', selectedTokenSets: { 'light/semantic': 'enabled' } }],
          tokensSource: 'filesystem' as const,
          themesArrayEmpty: false,
        }),
        extractSetNames: () => ['light/semantic', 'dark/semantic'],
        // → analyzer/token-layer-detector groups into a 'Semantic' layer with sets ['light/semantic', 'dark/semantic']
        // → fragmentSet = ['light', 'semantic', 'dark']
        // → vocab 'intent' values [primary, secondary, success, warning, info] — none match → Cv-A fires per missing value
      },
    );

    const findings = readFileSync(result.findingsPath, 'utf8');

    // Section 1: Collisions (state ↔ interaction Jaccard 1.0).
    expect(findings).toContain('## Collisions');
    expect(findings).toMatch(/state.*interaction|interaction.*state/);

    // Section 2: Outliers — Tag.intent.info — AND evidence cites rawName because '  Tag   X ' normalizes to 'Tag X'.
    expect(findings).toContain('## Outliers');
    expect(findings).toMatch(/Tag/);
    expect(findings).toContain('info');
    expect(findings).toMatch(/Figma raw/);
    expect(findings).toContain("Tag   X"); // raw substring with original whitespace

    // Section 3: Cross-Validations — Cv-A fires per missing intent value (none of {primary, secondary, success, warning, info} matches token-set fragments {light, semantic, dark}).
    expect(findings).toContain('## Cross-Validations');
    expect(findings).toContain('vocab-token-gap');
    expect(findings).toMatch(/intent\.(?:primary|secondary|success|warning|info)/);

    // Section 4: Blind Spots — variables-endpoint always-emit (no tokens-source because tokensSource='filesystem').
    expect(findings).toContain('## Blind Spots');
    expect(findings).toContain('variables-endpoint');
    // tokens-source NOT expected here — tokens are loaded via filesystem path.
    expect(findings).not.toContain('tokens-source');

    // Stats counters.
    expect(result.stats.findingsCount).toBeGreaterThan(0);
    expect(result.stats.blindSpotsCount).toBeGreaterThanOrEqual(1);
  });
});
