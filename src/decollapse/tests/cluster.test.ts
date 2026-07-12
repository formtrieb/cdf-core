import { describe, it, expect } from 'vitest';
import { axisForAtom } from '../priors.js';
import { clusterAtoms } from '../cluster.js';

describe('axisForAtom', () => {
  it('maps interaction aliases', () => {
    for (const a of ['default', 'idle', 'enabled', 'rest', 'hover', 'pressed', 'active', 'focus', 'focused', 'disabled']) {
      expect(axisForAtom(a)?.axis).toBe('interaction');
    }
  });
  it('maps validation, content, selection, readonly, disclosure', () => {
    expect(axisForAtom('error')?.axis).toBe('validation');
    expect(axisForAtom('filled')?.axis).toBe('content');
    expect(axisForAtom('selected')?.axis).toBe('selection');
    expect(axisForAtom('readonly')?.axis).toBe('readonly');
    expect(axisForAtom('expanded')?.axis).toBe('disclosure');
  });
  it('returns undefined for unknown atoms', () => {
    expect(axisForAtom('sparkly')).toBeUndefined();
  });
  it('flags which alias is the axis default', () => {
    expect(axisForAtom('default')?.isDefaultAlias).toBe(true);
    expect(axisForAtom('hover')?.isDefaultAlias).toBe(false);
  });
});

describe('clusterAtoms', () => {
  it('clusterAtoms: enum axis, boolean-presence axis, unknown atoms', () => {
    const tokenized = [['idle'], ['hover'], ['selected', 'idle'], ['selected', 'hover'], ['sparkly']];
    const { axes, unknownAtoms } = clusterAtoms(tokenized);
    const interaction = axes.find(a => a.name === 'interaction')!;
    expect(interaction.values).toEqual(['idle', 'hover']);
    expect(interaction.defaultValue).toBe('idle');
    const selection = axes.find(a => a.name === 'selection')!;
    expect(selection.source).toBe('boolean-presence');
    expect(selection.values).toEqual(['false', 'true']);
    expect(unknownAtoms).toEqual(['sparkly']);
  });
});
