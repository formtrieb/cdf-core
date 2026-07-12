import type { SnapshotAnalyzerOutput } from '../types.js';
import { extractVocabularies } from './vocab-extractor.js';
import { extractThemingModifiers } from './theming-analyzer.js';
import { detectTokenLayers } from './token-layer-detector.js';
import { populateSetMapping } from './set-mapping-populator.js';
import { computeInventoryStats } from './inventory-stats.js';

interface AnalyzerInput {
  walker: Parameters<typeof extractVocabularies>[0];
  tokens: Parameters<typeof extractThemingModifiers>[0];
  setNames: Parameters<typeof detectTokenLayers>[0];
}

export function analyzeInventory(input: AnalyzerInput): SnapshotAnalyzerOutput {
  const vocabularies = extractVocabularies(input.walker);
  const tokenLayers = detectTokenLayers(input.setNames);
  const themingModifiers = extractThemingModifiers(input.tokens);
  const setMapping = populateSetMapping(input.tokens);

  const stats = computeInventoryStats(input.walker, {
    vocabularies,
    tokenLayers,
    themingModifiers,
    setMapping,
  });

  return {
    vocabularies,
    tokenLayers,
    themingModifiers,
    setMapping,
    stats,
  };
}

export {
  extractVocabularies,
  extractThemingModifiers,
  detectTokenLayers,
  populateSetMapping,
  computeInventoryStats,
};
