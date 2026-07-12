import type { Phase1Output } from '../../extractor/types.js';
import { normalizeFigmaName } from './figma-name-normalizer.js';

/**
 * Minimal shape consumed by the snapshot analyzer's extractVocabularies().
 * Lossy by design — discards id, page, variantCount, seeded findings, etc.
 */
export interface AdapterOutput {
  componentSets: Array<{
    name: string;          // normalized via figma-name-normalizer (Task 2)
    rawName?: string;      // NEW Plan 1.3.5 — original Figma name; populated by Task 2
    properties: Record<string, string[]>;
  }>;
}

/**
 * Adapts the rich Phase1Output produced by walkFigmaFile() into the minimal
 * AdapterOutput shape required by the snapshot analyzer.
 *
 * NOTE on structure: Phase1Output stores component set entries at
 * `ds_inventory.component_sets.entries`, not at a top-level `component_sets`
 * field. This was a plan-vs-reality drift caught during Task 1 implementation.
 *
 * Plan 1.3.5: normalizes cset.name via figma-name-normalizer; carries original
 * Figma name as rawName for downstream evidence-string enrichment
 * (outlier-detector D1.3.5-D).
 */
export function adaptPhase1Output(phase1: Phase1Output): AdapterOutput {
  const entries = phase1.ds_inventory.component_sets.entries ?? [];
  const componentSets = entries.map((cset) => {
    const properties: Record<string, string[]> = {};
    for (const [propName, propDef] of Object.entries(cset.propertyDefinitions ?? {})) {
      if (propDef.variantOptions && propDef.variantOptions.length > 0) {
        properties[propName] = propDef.variantOptions;
      }
    }
    const rawName = cset.name;
    const name = normalizeFigmaName(rawName);
    return { name, rawName, properties };
  });
  return { componentSets };
}
