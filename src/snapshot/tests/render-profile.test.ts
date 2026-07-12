import { describe, it, expect } from 'vitest';
import { renderProfile } from '../render-profile.js';
import { parseMarkers } from '../marker-grammar.js';
import type { SnapshotAnalyzerOutput } from '../types.js';
import { parse as parseYaml } from 'yaml';

describe('render-profile', () => {
  const analyzerOutput: SnapshotAnalyzerOutput = {
    vocabularies: [
      {
        name: 'intent',
        values: ['primary', 'secondary', 'success'],
        setCoverage: 3,
        isBooleanShape: false,
        hintContext: { setCoverage: 3, valueCoverage: 100 },
      },
    ],
    tokenLayers: [
      {
        name: 'Semantic',
        sets: ['Semantic/light', 'Semantic/dark'],
        hintContext: { setCoverage: 2 },
      },
    ],
    themingModifiers: [
      {
        name: 'Semantic',
        contexts: ['Light', 'Dark'],
        hintContext: { valueCoverage: 2 },
      },
    ],
    setMapping: {},
  };

  const meta = {
    dsName: 'test-ds',
    figmaFileKey: 'TEST_KEY',
    generatedAt: '2026-04-28T12:00:00Z',
    generatedBy: 'cdf-core@1.1.0-rc.1',
  };

  it('emits ds-metadata as deterministic top-level fields (D1)', () => {
    const yaml = renderProfile(analyzerOutput, meta);
    expect(yaml).toContain('name: test-ds');
    expect(yaml).toContain('figma_file_key: TEST_KEY');
    expect(yaml).toContain('generated_at: 2026-04-28T12:00:00Z');
  });

  it('uses MAP shape for vocabularies (D2)', () => {
    const yaml = renderProfile(analyzerOutput, meta);
    const parsed = parseYaml(yaml);
    expect(parsed.vocabularies.intent).toBeDefined();
    expect(Array.isArray(parsed.vocabularies)).toBe(false);
  });

  it('uses ARRAY shape for token_layers (D2)', () => {
    const yaml = renderProfile(analyzerOutput, meta);
    const parsed = parseYaml(yaml);
    expect(Array.isArray(parsed.token_layers)).toBe(true);
    expect(parsed.token_layers[0].name).toBe('Semantic');
    expect(parsed.token_layers[0].sets).toEqual(['Semantic/light', 'Semantic/dark']);
  });

  it('uses MAP shape for theming.modifiers, with contexts field, plus empty set_mapping (D2)', () => {
    const yaml = renderProfile(analyzerOutput, meta);
    const parsed = parseYaml(yaml);
    expect(parsed.theming.modifiers.Semantic).toBeDefined();
    expect(parsed.theming.modifiers.Semantic.contexts).toEqual(['Light', 'Dark']);
    expect(parsed.theming.set_mapping).toEqual({});
    expect(Array.isArray(parsed.theming.modifiers)).toBe(false);
  });

  it('emits TBD-prose for vocab descriptions, NOT TBD-name for vocab keys (D1+D2)', () => {
    const yaml = renderProfile(analyzerOutput, meta);
    expect(yaml).toContain('intent:');
    expect(yaml).toContain('description: <TBD-prose');
    expect(yaml).not.toMatch(/<TBD-name candidates="\['intent'/);
  });

  it('embeds Stage-1 context in every TBD-prose hint (D3)', () => {
    const yaml = renderProfile(analyzerOutput, meta);
    const proseHints = [...yaml.matchAll(/<TBD-prose hint="([^"]+)"/g)].map((m) => m[1]);
    expect(proseHints.length).toBeGreaterThan(0);
    for (const hint of proseHints) {
      const hasNumeric = /\d/.test(hint);
      const hasNamedToken = /component_sets|sibling vocab|Jaccard|axis|value-coverage/i.test(hint);
      expect(hasNumeric || hasNamedToken).toBe(true);
    }
  });

  it('marker count matches D1: vocab=1 prose, token_layer=1 prose, theming.modifier=1 prose, ds.description=1 prose', () => {
    const yaml = renderProfile(analyzerOutput, meta);
    const counts = parseMarkers(yaml);
    expect(counts.prose).toBe(4);
    expect(counts.name).toBe(0);
    expect(counts.classification).toBe(0);
  });

  it('produces valid parseable YAML', () => {
    const yaml = renderProfile(analyzerOutput, meta);
    expect(() => parseYaml(yaml)).not.toThrow();
  });

  it('emits populated set_mapping when analyzer output provides it', () => {
    const withMapping = {
      ...analyzerOutput,
      setMapping: {
        'Foundation/colors': { always_enabled: true },
        'Semantic/light': { modifier: 'Semantic', context: 'Light' },
      },
    };
    const yaml = renderProfile(withMapping, meta);
    const parsed = parseYaml(yaml);
    expect(parsed.theming.set_mapping['Foundation/colors']).toEqual({ always_enabled: true });
    expect(parsed.theming.set_mapping['Semantic/light']).toEqual({ modifier: 'Semantic', context: 'Light' });
  });
});
