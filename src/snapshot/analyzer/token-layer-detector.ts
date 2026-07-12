import type { SnapshotTokenLayer, HintContext } from '../types.js';

interface SetListLike {
  setNames: string[];
}

export function detectTokenLayers(input: SetListLike): SnapshotTokenLayer[] {
  const setsByPrefix = new Map<string, string[]>();
  for (const setName of input.setNames) {
    const slashIdx = setName.indexOf('/');
    if (slashIdx <= 0) continue;
    const prefix = setName.slice(0, slashIdx);
    if (!setsByPrefix.has(prefix)) setsByPrefix.set(prefix, []);
    setsByPrefix.get(prefix)!.push(setName);
  }

  const layers: SnapshotTokenLayer[] = [];
  for (const [name, sets] of setsByPrefix.entries()) {
    sets.sort();
    const hintContext: HintContext = { setCoverage: sets.length };
    layers.push({ name, sets, hintContext });
  }
  return layers.sort((a, b) => a.name.localeCompare(b.name));
}
