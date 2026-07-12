import { describe, it, expect } from 'vitest';
import { extractVocabularies } from '../analyzer/vocab-extractor.js';

describe('vocab-extractor', () => {
  const fixtureWalker: { componentSets: Array<{ name: string; properties: Record<string, string[]> }> } = {
    componentSets: [
      { name: 'Button', properties: { intent: ['primary', 'secondary'], size: ['s', 'm'] } },
      { name: 'Tag',    properties: { intent: ['primary', 'success', 'info'], size: ['s', 'm', 'l'] } },
      { name: 'StatusChip', properties: { intent: ['success', 'warning'] } },
    ],
  };

  it('extracts one Vocabulary per distinct property name', () => {
    const vocabs = extractVocabularies(fixtureWalker);
    const names = vocabs.map((v) => v.name).sort();
    expect(names).toEqual(['intent', 'size']);
  });

  it('unions value-sets across component_sets', () => {
    const vocabs = extractVocabularies(fixtureWalker);
    const intent = vocabs.find((v) => v.name === 'intent')!;
    expect(intent.values.sort()).toEqual(['info', 'primary', 'secondary', 'success', 'warning']);
  });

  it('counts setCoverage as number of component_sets using the property', () => {
    const vocabs = extractVocabularies(fixtureWalker);
    expect(vocabs.find((v) => v.name === 'intent')!.setCoverage).toBe(3);
    expect(vocabs.find((v) => v.name === 'size')!.setCoverage).toBe(2);
  });

  it('detects isBooleanShape when values are exactly [true, false] (any order)', () => {
    const fixture = {
      componentSets: [{ name: 'Button', properties: { disabled: ['true', 'false'] } }],
    };
    const [vocab] = extractVocabularies(fixture);
    expect(vocab.isBooleanShape).toBe(true);
  });

  it('populates HintContext with setCoverage and valueCoverage', () => {
    const vocabs = extractVocabularies(fixtureWalker);
    const intent = vocabs.find((v) => v.name === 'intent')!;
    expect(intent.hintContext.setCoverage).toBe(3);
    expect(intent.hintContext.valueCoverage).toBeGreaterThan(0);
  });
});
