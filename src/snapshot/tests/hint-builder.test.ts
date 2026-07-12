import { describe, it, expect } from 'vitest';
import { buildHint, hasStage1Context } from '../hint-builder.js';
import type { HintContext } from '../types.js';

describe('hint-builder', () => {
  it('embeds setCoverage and valueCoverage', () => {
    const ctx: HintContext = { setCoverage: 7, valueCoverage: 92 };
    const hint = buildHint('What does this vocabulary express?', ctx);
    expect(hint).toContain('What does this vocabulary express?');
    expect(hint).toContain('7 component_sets');
    expect(hint).toContain('92%');
  });

  it('embeds siblingVocabs when present', () => {
    const ctx: HintContext = { setCoverage: 4, siblingVocabs: ['state'] };
    const hint = buildHint('Why this vocab?', ctx);
    expect(hint).toContain("sibling vocab 'state'");
  });

  it('embeds modalValueSet for outlier hints', () => {
    const ctx: HintContext = { modalValueSet: ['primary', 'secondary'], outlierValue: 'info' };
    const hint = buildHint('Why outlier?', ctx);
    expect(hint).toContain('[primary, secondary]');
    expect(hint).toContain("'info'");
  });

  it('embeds Jaccard for collision hints', () => {
    const ctx: HintContext = { jaccardSimilarity: 0.85, collisionMembers: ['interaction', 'state'] };
    const hint = buildHint('Why collision?', ctx);
    expect(hint).toContain('Jaccard 0.85');
    expect(hint).toContain('interaction');
    expect(hint).toContain('state');
  });

  it('hasStage1Context returns true when at least one field set', () => {
    expect(hasStage1Context({ setCoverage: 1 })).toBe(true);
    expect(hasStage1Context({})).toBe(false);
  });

  it('throws if context is empty (D3: never emit context-less hints)', () => {
    expect(() => buildHint('whatever', {})).toThrow(/HintContext is empty/);
  });
});
