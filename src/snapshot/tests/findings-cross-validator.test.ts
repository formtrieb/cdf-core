import { describe, it, expect } from 'vitest';
import { detectCrossValidations } from '../findings/cross-validator.js';
import type {
  SnapshotAnalyzerOutput,
  SnapshotVocabulary,
  SnapshotTokenLayer,
  SnapshotThemingModifier,
  SetMappingEntry,
} from '../types.js';

const mkVocab = (
  name: string,
  values: string[],
  setCoverage: number,
  isBooleanShape = false,
): SnapshotVocabulary => ({
  name,
  values,
  setCoverage,
  isBooleanShape,
  hintContext: { setCoverage, valueCoverage: values.length },
});

const mkLayer = (name: string, sets: string[]): SnapshotTokenLayer => ({
  name,
  sets,
  hintContext: {},
});

const mkModifier = (name: string, contexts: string[]): SnapshotThemingModifier => ({
  name,
  contexts,
  hintContext: {},
});

const mkAnalyzer = (overrides: Partial<SnapshotAnalyzerOutput> = {}): SnapshotAnalyzerOutput => ({
  vocabularies: [],
  tokenLayers: [],
  themingModifiers: [],
  setMapping: {},
  ...overrides,
});

describe('cross-validator — Cv-A vocab-token-gap', () => {
  it('emits a finding for each vocab value not present in token-set fragments', () => {
    const out = detectCrossValidations(
      mkAnalyzer({
        vocabularies: [mkVocab('intent', ['primary', 'secondary', 'success'], 4)],
        tokenLayers: [
          mkLayer('Semantic', ['light/controls/button-primary', 'light/controls/button-secondary']),
        ],
      }),
    );
    // 'primary' fragment is matched in 'button-primary' → no finding
    // 'secondary' fragment is matched in 'button-secondary' → no finding
    // 'success' has no token-set fragment match → finding
    const gaps = out.filter((f) => f.kind === 'vocab-token-gap');
    expect(gaps).toHaveLength(1);
    if (gaps[0].kind !== 'vocab-token-gap') throw new Error('shape');
    expect(gaps[0].vocab).toBe('intent');
    expect(gaps[0].missingValue).toBe('success');
    expect(gaps[0].evidence).toMatch(/success/);
  });

  it('skips vocabs with setCoverage < 3', () => {
    const out = detectCrossValidations(
      mkAnalyzer({
        vocabularies: [mkVocab('intent', ['primary', 'success'], 2)],
        tokenLayers: [mkLayer('Semantic', ['light/semantic'])],
      }),
    );
    expect(out.filter((f) => f.kind === 'vocab-token-gap')).toEqual([]);
  });

  it('skips vocabs with isBooleanShape === true', () => {
    const out = detectCrossValidations(
      mkAnalyzer({
        vocabularies: [mkVocab('expanded', ['true', 'false'], 5, true)],
        tokenLayers: [mkLayer('Semantic', ['light/semantic'])],
      }),
    );
    expect(out.filter((f) => f.kind === 'vocab-token-gap')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const out = detectCrossValidations(
      mkAnalyzer({
        vocabularies: [mkVocab('intent', ['Primary'], 4)],
        tokenLayers: [mkLayer('Semantic', ['light/controls/button-primary'])],
      }),
    );
    expect(out.filter((f) => f.kind === 'vocab-token-gap')).toEqual([]);
  });

  it('splits on /, -, _, . when collecting fragments', () => {
    const out = detectCrossValidations(
      mkAnalyzer({
        // 'foo' should be matched in any of these set names
        vocabularies: [mkVocab('intent', ['foo', 'bar'], 4)],
        tokenLayers: [mkLayer('Semantic', ['light_foo.bar', 'a/b-c'])],
      }),
    );
    // 'foo' matches via underscore split; 'bar' matches via dot split
    expect(out.filter((f) => f.kind === 'vocab-token-gap')).toEqual([]);
  });

  it('skips Cv-A entirely when no token-set fragments are available (no tokens loaded)', () => {
    // When tokenLayers is empty, the underlying issue is already surfaced
    // by blind-spot-detector's tokens-source finding. Cv-A would otherwise
    // emit one finding per vocab value — pure noise duplicating that signal.
    const out = detectCrossValidations(
      mkAnalyzer({
        vocabularies: [
          mkVocab('intent', ['primary', 'secondary', 'success'], 4),
        ],
        tokenLayers: [],
      }),
    );
    expect(out.filter((f) => f.kind === 'vocab-token-gap')).toEqual([]);
  });
});

describe('cross-validator — Cv-B orphan-modifier-context', () => {
  it('emits a finding for each themingModifier context with no setMapping reference', () => {
    const out = detectCrossValidations(
      mkAnalyzer({
        themingModifiers: [mkModifier('mode', ['Light', 'Dark', 'Print'])],
        setMapping: {
          'light/semantic': { modifier: 'mode', context: 'Light' } satisfies SetMappingEntry,
          'dark/semantic':  { modifier: 'mode', context: 'Dark' } satisfies SetMappingEntry,
          // 'Print' is orphan
        },
      }),
    );
    const orphans = out.filter((f) => f.kind === 'orphan-modifier-context');
    expect(orphans).toHaveLength(1);
    if (orphans[0].kind !== 'orphan-modifier-context') throw new Error('shape');
    expect(orphans[0].modifier).toBe('mode');
    expect(orphans[0].orphanContext).toBe('Print');
    expect(orphans[0].evidence).toMatch(/Print/);
  });

  it('emits zero orphan findings when every context is referenced', () => {
    const out = detectCrossValidations(
      mkAnalyzer({
        themingModifiers: [mkModifier('mode', ['Light', 'Dark'])],
        setMapping: {
          'light/semantic': { modifier: 'mode', context: 'Light' },
          'dark/semantic':  { modifier: 'mode', context: 'Dark' },
        },
      }),
    );
    expect(out.filter((f) => f.kind === 'orphan-modifier-context')).toEqual([]);
  });

  it('treats every modifier-context with no setMapping entry as orphan (multiple modifiers)', () => {
    const out = detectCrossValidations(
      mkAnalyzer({
        themingModifiers: [
          mkModifier('mode', ['Light', 'Dark']),
          mkModifier('density', ['Comfortable', 'Compact']),
        ],
        setMapping: {
          'light/semantic': { modifier: 'mode', context: 'Light' },
          // 'Dark' orphan
          // both 'Comfortable' and 'Compact' orphan
        },
      }),
    );
    const orphans = out.filter((f) => f.kind === 'orphan-modifier-context');
    expect(orphans).toHaveLength(3);
    const orphanIds = orphans.map((f) =>
      f.kind === 'orphan-modifier-context' ? `${f.modifier}/${f.orphanContext}` : '',
    );
    expect(orphanIds.sort()).toEqual([
      'density/Comfortable',
      'density/Compact',
      'mode/Dark',
    ]);
  });
});
