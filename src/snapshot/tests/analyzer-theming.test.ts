import { describe, it, expect } from 'vitest';
import { extractThemingModifiers } from '../analyzer/theming-analyzer.js';

describe('theming-analyzer', () => {
  const fixtureTokens = {
    $themes: [
      { group: 'Semantic', name: 'Light', selectedTokenSets: { 'Semantic/light': 'enabled' } },
      { group: 'Semantic', name: 'Dark',  selectedTokenSets: { 'Semantic/dark': 'enabled' } },
      { group: 'Device',   name: 'Desktop', selectedTokenSets: { 'Device/desktop': 'enabled' } },
      { group: 'Device',   name: 'Tablet',  selectedTokenSets: { 'Device/tablet': 'enabled' } },
      { group: 'Device',   name: 'Mobile',  selectedTokenSets: { 'Device/mobile': 'enabled' } },
    ],
  };

  it('extracts one SnapshotThemingModifier per $themes group', () => {
    const mods = extractThemingModifiers(fixtureTokens);
    expect(mods.map((m) => m.name).sort()).toEqual(['Device', 'Semantic']);
  });

  it('collects contexts from group-member names', () => {
    const mods = extractThemingModifiers(fixtureTokens);
    const sem = mods.find((m) => m.name === 'Semantic')!;
    expect(sem.contexts.sort()).toEqual(['Dark', 'Light']);
    const dev = mods.find((m) => m.name === 'Device')!;
    expect(dev.contexts.sort()).toEqual(['Desktop', 'Mobile', 'Tablet']);
  });

  it('populates HintContext with context-count', () => {
    const mods = extractThemingModifiers(fixtureTokens);
    const sem = mods.find((m) => m.name === 'Semantic')!;
    expect(sem.hintContext.valueCoverage).toBe(2);
  });

  it('returns [] when $themes missing or empty', () => {
    expect(extractThemingModifiers({})).toEqual([]);
    expect(extractThemingModifiers({ $themes: [] })).toEqual([]);
  });
});
