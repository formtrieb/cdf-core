import { describe, it, expect } from 'vitest';
import { populateSetMapping } from '../analyzer/set-mapping-populator.js';

describe('set-mapping-populator', () => {
  type SetStatus = 'enabled' | 'disabled' | 'source';
  const fixtureTokens = {
    $themes: [
      {
        id: 'light',
        name: 'Light',
        group: 'Semantic',
        selectedTokenSets: {
          'Foundation/colors': 'source',
          'Semantic/light': 'enabled',
        } as Record<string, SetStatus>,
      },
      {
        id: 'dark',
        name: 'Dark',
        group: 'Semantic',
        selectedTokenSets: {
          'Foundation/colors': 'source',
          'Semantic/dark': 'enabled',
          'Components/legacy': 'disabled',
        } as Record<string, SetStatus>,
      },
      {
        id: 'desktop',
        name: 'Desktop',
        group: 'Device',
        selectedTokenSets: {
          'Device/desktop': 'enabled',
        } as Record<string, SetStatus>,
      },
    ],
  };

  it('maps "enabled" sets to {modifier, context}', () => {
    const mapping = populateSetMapping(fixtureTokens);
    expect(mapping['Semantic/light']).toEqual({ modifier: 'Semantic', context: 'Light' });
    expect(mapping['Semantic/dark']).toEqual({ modifier: 'Semantic', context: 'Dark' });
    expect(mapping['Device/desktop']).toEqual({ modifier: 'Device', context: 'Desktop' });
  });

  it('maps "source" sets to {always_enabled: true}', () => {
    const mapping = populateSetMapping(fixtureTokens);
    expect(mapping['Foundation/colors']).toEqual({ always_enabled: true });
  });

  it('omits "disabled" sets', () => {
    const mapping = populateSetMapping(fixtureTokens);
    expect(mapping['Components/legacy']).toBeUndefined();
  });

  it('returns {} when $themes is missing or empty', () => {
    expect(populateSetMapping({})).toEqual({});
    expect(populateSetMapping({ $themes: [] })).toEqual({});
  });

  it('handles a "source" set followed later by an "enabled" mapping (last-write-wins is OK)', () => {
    const tokens = {
      $themes: [
        { name: 'A', group: 'X', selectedTokenSets: { 'shared': 'source' as SetStatus } },
        { name: 'B', group: 'Y', selectedTokenSets: { 'shared': 'enabled' as SetStatus } },
      ],
    };
    const mapping = populateSetMapping(tokens);
    // 'enabled' wins over 'source' if both are claimed for the same set name
    expect(mapping['shared']).toEqual({ modifier: 'Y', context: 'B' });
  });
});
