import type { SnapshotThemingModifier, HintContext } from '../types.js';

interface ThemeEntry {
  group?: string;
  name: string;
}

interface TokenSourceLike {
  $themes?: ThemeEntry[];
}

export function extractThemingModifiers(tokens: TokenSourceLike): SnapshotThemingModifier[] {
  if (!tokens.$themes || tokens.$themes.length === 0) return [];

  const contextsByGroup = new Map<string, Set<string>>();
  for (const t of tokens.$themes) {
    const group = t.group ?? '_ungrouped';
    if (!contextsByGroup.has(group)) contextsByGroup.set(group, new Set());
    contextsByGroup.get(group)!.add(t.name);
  }

  const mods: SnapshotThemingModifier[] = [];
  for (const [name, contextSet] of contextsByGroup.entries()) {
    if (name === '_ungrouped') continue;
    const contexts = [...contextSet].sort();
    const hintContext: HintContext = { valueCoverage: contexts.length };
    mods.push({ name, contexts, hintContext });
  }
  return mods;
}
