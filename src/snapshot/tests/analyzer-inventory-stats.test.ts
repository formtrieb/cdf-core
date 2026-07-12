import { describe, it, expect } from 'vitest';
import { computeInventoryStats } from '../analyzer/inventory-stats.js';
import type { SnapshotVocabulary, SnapshotTokenLayer, SnapshotThemingModifier } from '../types.js';

const mkVocab = (
  name: string,
  values: string[],
  setCoverage: number,
): SnapshotVocabulary => ({
  name,
  values,
  setCoverage,
  isBooleanShape: false,
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

describe('inventory-stats', () => {
  it('counts top-level totals correctly', () => {
    const stats = computeInventoryStats(
      {
        componentSets: [
          { name: 'A', rawName: 'A', properties: {} },
          { name: 'B', rawName: 'B', properties: {} },
        ],
      },
      {
        vocabularies: [mkVocab('intent', ['primary', 'secondary'], 2)],
        tokenLayers: [mkLayer('Semantic', ['light/semantic'])],
        themingModifiers: [mkModifier('mode', ['Light', 'Dark'])],
        setMapping: {},
      },
    );
    expect(stats.componentSetsTotal).toBe(2);
    expect(stats.vocabulariesTotal).toBe(1);
    expect(stats.tokenLayersTotal).toBe(1);
    expect(stats.themingModifiersTotal).toBe(1);
  });

  it('partitions vocabDistribution by setCoverage tier', () => {
    const stats = computeInventoryStats(
      { componentSets: [] },
      {
        vocabularies: [
          mkVocab('a', ['x'], 1),
          mkVocab('b', ['x'], 2),
          mkVocab('c', ['x'], 3),
          mkVocab('d', ['x'], 5),
        ],
        tokenLayers: [],
        themingModifiers: [],
        setMapping: {},
      },
    );
    expect(stats.vocabDistribution.lowCoverage).toBe(1);   // setCoverage === 1
    expect(stats.vocabDistribution.midCoverage).toBe(1);   // setCoverage === 2
    expect(stats.vocabDistribution.highCoverage).toBe(2);  // setCoverage >= 3
  });

  it('rounds means to 1 decimal', () => {
    const stats = computeInventoryStats(
      { componentSets: [] },
      {
        vocabularies: [
          mkVocab('a', ['x'], 1),
          mkVocab('b', ['x', 'y'], 2),
          mkVocab('c', ['x', 'y', 'z'], 3),
        ],
        tokenLayers: [],
        themingModifiers: [],
        setMapping: {},
      },
    );
    // values: 1, 2, 3 → mean 2.0
    expect(stats.meanValuesPerVocab).toBe(2);
    // setCoverage: 1, 2, 3 → mean 2.0
    expect(stats.meanSetCoverage).toBe(2);
  });

  it('rounds means with non-integer values', () => {
    const stats = computeInventoryStats(
      { componentSets: [] },
      {
        vocabularies: [
          mkVocab('a', ['x'], 1),
          mkVocab('b', ['x', 'y'], 2),
        ],
        tokenLayers: [],
        themingModifiers: [],
        setMapping: {},
      },
    );
    // values: 1, 2 → mean 1.5
    expect(stats.meanValuesPerVocab).toBe(1.5);
    // setCoverage: 1, 2 → mean 1.5
    expect(stats.meanSetCoverage).toBe(1.5);
  });

  it('returns zero means and empty distribution for empty vocabs', () => {
    const stats = computeInventoryStats(
      { componentSets: [] },
      { vocabularies: [], tokenLayers: [], themingModifiers: [], setMapping: {} },
    );
    expect(stats.meanValuesPerVocab).toBe(0);
    expect(stats.meanSetCoverage).toBe(0);
    expect(stats.vocabDistribution).toEqual({ highCoverage: 0, midCoverage: 0, lowCoverage: 0 });
  });

  it('derives componentSetCategories from rawName (split first slash)', () => {
    const stats = computeInventoryStats(
      {
        componentSets: [
          { name: 'Form/TextField', rawName: 'Form/TextField', properties: {} },
          { name: 'Form/Select',    rawName: 'Form/Select',    properties: {} },
          { name: 'Display/Card',   rawName: 'Display/Card',   properties: {} },
          { name: 'Button',         rawName: 'Button',         properties: {} },
        ],
      },
      { vocabularies: [], tokenLayers: [], themingModifiers: [], setMapping: {} },
    );
    expect(stats.componentSetCategories).toEqual({
      Form: 2,
      Display: 1,
      '(uncategorized)': 1,
    });
  });

  it('falls back to (uncategorized) when rawName is undefined', () => {
    const stats = computeInventoryStats(
      {
        componentSets: [
          { name: 'X', properties: {} } as any, // no rawName
        ],
      },
      { vocabularies: [], tokenLayers: [], themingModifiers: [], setMapping: {} },
    );
    expect(stats.componentSetCategories).toEqual({ '(uncategorized)': 1 });
  });
});
