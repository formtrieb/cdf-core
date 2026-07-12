import type {
  SnapshotAnalyzerOutput,
  SnapshotInventoryStats,
} from '../types.js';

interface WalkerLike {
  componentSets: Array<{
    name: string;
    rawName?: string;
    properties: Record<string, string[]>;
  }>;
}

const UNCATEGORIZED = '(uncategorized)';

/**
 * Computes descriptive statistics about the snapshot's inventory.
 *
 * Plan 1.3.5 produces this struct; Plan 1.5 wires it into <TBD-prose hint=...>
 * for ds.description in render-profile.
 *
 * Means rounded to 1 decimal. componentSetCategories uses rawName for
 * category derivation (rawName is stable; normalized name might lose
 * category info if future normalizer rules touch slashes).
 */
export function computeInventoryStats(
  walker: WalkerLike,
  analyzerOutput: Pick<
    SnapshotAnalyzerOutput,
    'vocabularies' | 'tokenLayers' | 'themingModifiers' | 'setMapping'
  >,
): SnapshotInventoryStats {
  const { vocabularies, tokenLayers, themingModifiers } = analyzerOutput;

  const vocabDistribution = { highCoverage: 0, midCoverage: 0, lowCoverage: 0 };
  let valuesSum = 0;
  let setCoverageSum = 0;
  for (const v of vocabularies) {
    valuesSum += v.values.length;
    setCoverageSum += v.setCoverage;
    if (v.setCoverage >= 3) vocabDistribution.highCoverage++;
    else if (v.setCoverage === 2) vocabDistribution.midCoverage++;
    else if (v.setCoverage === 1) vocabDistribution.lowCoverage++;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const meanValuesPerVocab = vocabularies.length === 0 ? 0 : round1(valuesSum / vocabularies.length);
  const meanSetCoverage = vocabularies.length === 0 ? 0 : round1(setCoverageSum / vocabularies.length);

  const componentSetCategories: Record<string, number> = {};
  for (const cset of walker.componentSets) {
    const sourceName = cset.rawName ?? cset.name;
    const slashIdx = sourceName.indexOf('/');
    const category =
      slashIdx > 0 ? sourceName.substring(0, slashIdx).trim() : UNCATEGORIZED;
    const key = category.length > 0 ? category : UNCATEGORIZED;
    componentSetCategories[key] = (componentSetCategories[key] ?? 0) + 1;
  }

  return {
    componentSetsTotal: walker.componentSets.length,
    vocabulariesTotal: vocabularies.length,
    tokenLayersTotal: tokenLayers.length,
    themingModifiersTotal: themingModifiers.length,
    vocabDistribution,
    meanValuesPerVocab,
    meanSetCoverage,
    componentSetCategories,
  };
}
