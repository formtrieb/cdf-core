import type { SnapshotVocabulary, HintContext } from '../types.js';

interface WalkerLike {
  componentSets: Array<{
    name: string;
    properties: Record<string, string[]>;
  }>;
}

export function extractVocabularies(walker: WalkerLike): SnapshotVocabulary[] {
  const valuesByName = new Map<string, Set<string>>();
  const setCountsByName = new Map<string, number>();

  for (const cset of walker.componentSets) {
    for (const [propName, propValues] of Object.entries(cset.properties)) {
      if (!valuesByName.has(propName)) {
        valuesByName.set(propName, new Set());
        setCountsByName.set(propName, 0);
      }
      const valueSet = valuesByName.get(propName)!;
      for (const v of propValues) valueSet.add(v);
      setCountsByName.set(propName, setCountsByName.get(propName)! + 1);
    }
  }

  const vocabs: SnapshotVocabulary[] = [];
  for (const [name, valueSet] of valuesByName.entries()) {
    const values = [...valueSet].sort();
    const setCoverage = setCountsByName.get(name)!;
    const isBooleanShape = values.length === 2 && values.every((v) => v === 'true' || v === 'false');

    const hintContext: HintContext = {
      setCoverage,
      valueCoverage: Math.round((valueSet.size / Math.max(walker.componentSets.length, 1)) * 100),
    };

    vocabs.push({ name, values, setCoverage, isBooleanShape, hintContext });
  }

  return vocabs;
}
