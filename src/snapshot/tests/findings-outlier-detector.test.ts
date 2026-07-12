import { describe, it, expect } from 'vitest';
import { detectOutliers } from '../findings/outlier-detector.js';
import type { SnapshotVocabulary } from '../types.js';

const mkVocab = (name: string, values: string[], setCoverage: number): SnapshotVocabulary => ({
  name,
  values,
  setCoverage,
  isBooleanShape: false,
  hintContext: { setCoverage, valueCoverage: values.length },
});

const mkWalker = (sets: Array<{ name: string; props: Record<string, string[]> }>) => ({
  componentSets: sets.map((s) => ({ name: s.name, properties: s.props })),
});

describe('outlier-detector', () => {
  it('detects an outlier value (Tag adds info that no other component carries)', () => {
    const walker = mkWalker([
      { name: 'Button', props: { intent: ['primary', 'secondary'] } },
      { name: 'Card',   props: { intent: ['primary', 'secondary'] } },
      { name: 'Tag',    props: { intent: ['primary', 'info'] } },
    ]);
    // primary: 3 sets (modal); secondary: 2 sets (modal); info: 1 set (outlier in Tag)
    const vocabs = [mkVocab('intent', ['primary', 'secondary', 'info'], 3)];

    const findings = detectOutliers(vocabs, walker);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('outlier');
    expect(findings[0].vocab).toBe('intent');
    expect(findings[0].outlierValue).toBe('info');
    expect(findings[0].set).toBe('Tag');
  });

  it('skips vocabs with setCoverage < 3', () => {
    const walker = mkWalker([
      { name: 'Button', props: { kind: ['x'] } },
      { name: 'Tag',    props: { kind: ['y'] } },
    ]);
    const vocabs = [mkVocab('kind', ['x', 'y'], 2)];
    expect(detectOutliers(vocabs, walker)).toEqual([]);
  });

  it('does not flag values when ALL values appear in exactly 1 set (long-tail)', () => {
    const walker = mkWalker([
      { name: 'A', props: { x: ['v1'] } },
      { name: 'B', props: { x: ['v2'] } },
      { name: 'C', props: { x: ['v3'] } },
    ]);
    const vocabs = [mkVocab('x', ['v1', 'v2', 'v3'], 3)];
    expect(detectOutliers(vocabs, walker)).toEqual([]);
  });

  it('reports multiple outliers per vocab as separate findings', () => {
    const walker = mkWalker([
      { name: 'A', props: { x: ['common', 'rareA'] } },
      { name: 'B', props: { x: ['common', 'rareB'] } },
      { name: 'C', props: { x: ['common'] } },
    ]);
    // common: 3 sets; rareA: 1 set; rareB: 1 set
    const vocabs = [mkVocab('x', ['common', 'rareA', 'rareB'], 3)];
    const findings = detectOutliers(vocabs, walker);
    expect(findings).toHaveLength(2);
    const outlierVals = findings.map((f) => f.outlierValue).sort();
    expect(outlierVals).toEqual(['rareA', 'rareB']);
  });

  it('populates evidence with the modal value-set and outlier comparison', () => {
    const walker = mkWalker([
      { name: 'Button', props: { intent: ['a', 'b'] } },
      { name: 'Tag',    props: { intent: ['a', 'c'] } },
      { name: 'Chip',   props: { intent: ['a', 'b'] } },
    ]);
    // a: 3 sets; b: 2 sets; c: 1 set (outlier in Tag)
    const vocabs = [mkVocab('intent', ['a', 'b', 'c'], 3)];
    const findings = detectOutliers(vocabs, walker);
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toMatch(/modal|outlier|c/);
  });

  it('populates hintContext with modalValueSet and outlierValue', () => {
    const walker = mkWalker([
      { name: 'A', props: { x: ['common', 'rare'] } },
      { name: 'B', props: { x: ['common'] } },
      { name: 'C', props: { x: ['common'] } },
    ]);
    const vocabs = [mkVocab('x', ['common', 'rare'], 3)];
    const findings = detectOutliers(vocabs, walker);
    expect(findings[0].hintContext.outlierValue).toBe('rare');
    expect(findings[0].hintContext.modalValueSet).toContain('common');
  });
});

describe('outlier-detector — Plan 1.3.5 rawName evidence enrichment', () => {
  it('appends "(Figma raw: ...)" to evidence when rawName differs from name', () => {
    // primary+secondary appear in all 3 sets (modal); info appears only in Tag (outlier).
    // Tag's rawName differs from its normalized name → evidence must cite it.
    const walker = {
      componentSets: [
        { name: 'Button',     rawName: 'Button',          properties: { intent: ['primary', 'secondary'] } },
        { name: 'StatusChip', rawName: 'StatusChip',      properties: { intent: ['primary', 'secondary'] } },
        { name: 'Tag',        rawName: '  Tag  /  Old ',  properties: { intent: ['primary', 'info'] } },
      ],
    };
    const vocabs = [
      {
        name: 'intent',
        values: ['primary', 'secondary', 'info'],
        setCoverage: 3,
        isBooleanShape: false,
        hintContext: { setCoverage: 3, valueCoverage: 3 },
      },
    ];
    const findings = detectOutliers(vocabs, walker);
    expect(findings).toHaveLength(1);
    expect(findings[0].outlierValue).toBe('info');
    // The Tag's normalized name is 'Tag'; rawName is '  Tag  /  Old ' → cite required.
    expect(findings[0].evidence).toMatch(/Figma raw/);
    expect(findings[0].evidence).toContain("Tag  /  Old"); // raw substring present
  });

  it('does NOT append "(Figma raw: ...)" when rawName equals name', () => {
    const walker = {
      componentSets: [
        { name: 'Button', rawName: 'Button', properties: { intent: ['primary', 'secondary'] } },
        { name: 'Card',   rawName: 'Card',   properties: { intent: ['primary', 'secondary'] } },
        { name: 'Tag',    rawName: 'Tag',    properties: { intent: ['primary', 'info'] } },
      ],
    };
    const vocabs = [
      {
        name: 'intent',
        values: ['primary', 'secondary', 'info'],
        setCoverage: 3,
        isBooleanShape: false,
        hintContext: { setCoverage: 3, valueCoverage: 3 },
      },
    ];
    const findings = detectOutliers(vocabs, walker);
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).not.toMatch(/Figma raw/);
  });
});
