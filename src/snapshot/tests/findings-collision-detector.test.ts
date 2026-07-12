import { describe, it, expect } from 'vitest';
import { detectCollisions } from '../findings/collision-detector.js';
import type { SnapshotVocabulary } from '../types.js';

const mkVocab = (
  name: string,
  values: string[],
  setCoverage = 1,
): SnapshotVocabulary => ({
  name,
  values,
  setCoverage,
  isBooleanShape: false,
  hintContext: { setCoverage, valueCoverage: values.length },
});

describe('collision-detector', () => {
  it('detects identical value-sets as Jaccard 1.0 collision', () => {
    const findings = detectCollisions([
      mkVocab('interaction', ['hover', 'focus', 'active', 'disabled'], 5),
      mkVocab('state', ['hover', 'focus', 'active', 'disabled'], 3),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('collision');
    expect(findings[0].members.sort()).toEqual(['interaction', 'state']);
    expect(findings[0].hintContext.jaccardSimilarity).toBeCloseTo(1.0);
  });

  it('detects partial overlap >= 0.7 as Jaccard collision', () => {
    // {a,b,c,d} vs {a,b,c,e}: intersection 3, union 5, Jaccard 0.6 → BELOW threshold
    const below = detectCollisions([
      mkVocab('x', ['a', 'b', 'c', 'd']),
      mkVocab('y', ['a', 'b', 'c', 'e']),
    ]);
    expect(below).toHaveLength(0);

    // {a,b,c,d} vs {a,b,c,d,e}: intersection 4, union 5, Jaccard 0.8 → AT threshold
    const above = detectCollisions([
      mkVocab('x', ['a', 'b', 'c', 'd']),
      mkVocab('y', ['a', 'b', 'c', 'd', 'e']),
    ]);
    expect(above).toHaveLength(1);
    expect(above[0].hintContext.jaccardSimilarity).toBeCloseTo(0.8);
  });

  it('detects casing-collision when names match case-insensitively', () => {
    const findings = detectCollisions([
      mkVocab('Icon', ['true', 'false']),
      mkVocab('icon', ['large', 'small']),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('casing-collision');
    expect(findings[0].members.sort()).toEqual(['Icon', 'icon']);
  });

  it('reports 3-way collisions as N pairwise findings', () => {
    const findings = detectCollisions([
      mkVocab('a', ['x', 'y', 'z']),
      mkVocab('b', ['x', 'y', 'z']),
      mkVocab('c', ['x', 'y', 'z']),
    ]);
    expect(findings).toHaveLength(3); // a-b, a-c, b-c
    const memberPairs = findings.map((f) => f.members.sort().join('-'));
    expect(memberPairs.sort()).toEqual(['a-b', 'a-c', 'b-c']);
  });

  it('sets suggestCanonical=true when set-coverages differ', () => {
    const findings = detectCollisions([
      mkVocab('a', ['x', 'y', 'z'], 5),
      mkVocab('b', ['x', 'y', 'z'], 3),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].suggestCanonical).toBe(true);
  });

  it('sets suggestCanonical=false when set-coverages are equal', () => {
    const findings = detectCollisions([
      mkVocab('a', ['x', 'y', 'z'], 4),
      mkVocab('b', ['x', 'y', 'z'], 4),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].suggestCanonical).toBe(false);
  });

  it('populates classificationCandidates with [minor, medium, major]', () => {
    const findings = detectCollisions([
      mkVocab('a', ['x', 'y']),
      mkVocab('b', ['x', 'y']),
    ]);
    expect(findings[0].classificationCandidates).toEqual(['minor', 'medium', 'major']);
  });

  it('populates evidence with Jaccard score and value-set overlap', () => {
    const findings = detectCollisions([
      mkVocab('a', ['x', 'y']),
      mkVocab('b', ['x', 'y']),
    ]);
    expect(findings[0].evidence).toMatch(/Jaccard/);
  });

  it('returns empty array for unrelated vocabs', () => {
    expect(
      detectCollisions([
        mkVocab('intent', ['primary', 'secondary']),
        mkVocab('size', ['s', 'm', 'l']),
      ]),
    ).toEqual([]);
  });
});
