import { describe, it, expect } from 'vitest';
import { detectTokenLayers } from '../analyzer/token-layer-detector.js';

describe('token-layer-detector', () => {
  const fixture = {
    setNames: [
      'Foundation/colors',
      'Foundation/spacing',
      'Semantic/light',
      'Semantic/dark',
      'Components/Button',
      'Components/TextField',
      'Components/Tag',
    ],
  };

  it('groups sets by namespace prefix (before first slash)', () => {
    const layers = detectTokenLayers(fixture);
    const names = layers.map((l) => l.name).sort();
    expect(names).toEqual(['Components', 'Foundation', 'Semantic']);
  });

  it('attaches the full set list to each layer', () => {
    const layers = detectTokenLayers(fixture);
    const sem = layers.find((l) => l.name === 'Semantic')!;
    expect(sem.sets.sort()).toEqual(['Semantic/dark', 'Semantic/light']);
  });

  it('populates HintContext with set-count per layer', () => {
    const layers = detectTokenLayers(fixture);
    const components = layers.find((l) => l.name === 'Components')!;
    expect(components.hintContext.setCoverage).toBe(3);
  });

  it('skips sets without a slash (top-level singletons)', () => {
    const fx = { setNames: ['Foundation/colors', 'global'] };
    const layers = detectTokenLayers(fx);
    expect(layers.map((l) => l.name)).toEqual(['Foundation']);
  });
});
