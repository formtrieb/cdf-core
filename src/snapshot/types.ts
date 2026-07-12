// import type { WalkerOutput } from '../extractor/types.js'; // WalkerOutput not yet in extractor/types.ts — add back in Task 9

export interface SnapshotInput {
  figmaUrl: string;
  outDir: string;
  pat?: string;
  tokensDir?: string;
  options?: {
    dsName?: string;
    parentProfile?: string;
    cacheDir?: string;
  };
}

export interface SnapshotResult {
  profilePath: string;
  findingsPath: string;
  stats: {
    componentSetsCount: number;
    vocabulariesCount: number;
    findingsCount: number;
    blindSpotsCount: number;
    tbdMarkersCount: number;
  };
  toolSurvey: {
    figmaFetchSource: 'rest' | 'cache' | 'variables-restricted';
    tokensSource: 'tokens-mcp' | 'filesystem' | 'none';
  };
  walltimeMs: number;
}

export interface HintContext {
  setCoverage?: number;
  valueCoverage?: number;
  siblingVocabs?: string[];
  modalValueSet?: string[];
  outlierValue?: string;
  jaccardSimilarity?: number;
  collisionMembers?: [string, string];
}

/**
 * A vocabulary entry as produced by the snapshot analyzer.
 * Named `SnapshotVocabulary` to avoid collision with the profile-level
 * `Vocabulary` type already exported from `./types/profile.js`.
 */
export interface SnapshotVocabulary {
  name: string;
  values: string[];
  setCoverage: number;
  isBooleanShape: boolean;
  hintContext: HintContext;
}

/**
 * A token-layer entry as produced by the snapshot analyzer.
 * Named `SnapshotTokenLayer` to avoid collision with the profile-level
 * `TokenLayer` type already exported from `./types/profile.js`.
 */
export interface SnapshotTokenLayer {
  name: string;
  sets: string[];
  hintContext: HintContext;
}

/**
 * A theming modifier entry as produced by the snapshot analyzer.
 * Matches the canonical `ThemeModifier` shape from
 * `packages/cdf-core/src/types/profile.ts` (used as
 * `theming.modifiers: Record<string, ThemeModifier>`):
 * - `name` is redundant with the map-key but kept for renderer convenience
 * - `contexts` are the axis values (e.g., ['Light', 'Dark'])
 * - `data_attribute` (canonical, optional) is OMITTED in Plan 1.1 minimal
 *   scope; LLM may add during fill or Plan 1.2 derives it from a convention.
 */
export interface SnapshotThemingModifier {
  name: string;
  contexts: string[];
  hintContext: HintContext;
}

/**
 * Full output shape of the snapshot analyzer pass.
 */
export interface SnapshotAnalyzerOutput {
  vocabularies: SnapshotVocabulary[];
  tokenLayers: SnapshotTokenLayer[];
  themingModifiers: SnapshotThemingModifier[];
  setMapping: Record<string, SetMappingEntry>;
  stats?: SnapshotInventoryStats;  // NEW Plan 1.3.5 — populated by Task 5
}

export interface SetMappingEntry {
  always_enabled?: boolean;
  modifier?: string;
  context?: string;
}

export interface CollisionFinding {
  type: 'collision' | 'casing-collision';
  members: [string, string];
  evidence: string;
  hintContext: HintContext;
  classificationCandidates: string[]; // ['minor', 'medium', 'major']
  suggestCanonical: boolean; // true → emit TBD-name
}

export interface OutlierFinding {
  type: 'outlier';
  vocab: string;
  set: string;
  outlierValue: string;
  evidence: string;
  hintContext: HintContext;
}

export interface BlindSpotFinding {
  source: string;
  evidence: string;
  hintContext: HintContext;
}

export interface FindingsOutput {
  collisions: CollisionFinding[];
  outliers: OutlierFinding[];
  blindSpots: BlindSpotFinding[];
  crossValidations?: CrossValidationFinding[];  // NEW Plan 1.3.5 — populated by Task 7
}

/**
 * Internal-only diagnostic state collected by produceSnapshot during pipeline execution.
 * Consumed by blind-spot-detector. Distinct from the user-facing SnapshotResult.toolSurvey
 * (which is a summarized projection of this state).
 */
export interface ToolSurveyState {
  figmaFetchSource: 'rest' | 'cache';
  tokensSource: 'tokens-mcp' | 'filesystem' | 'none';
  themesArrayEmpty: boolean;
  walkerReportedTotal: number;
  walkerActualCount: number;
}

/**
 * Cross-validation finding — emitted by findings/cross-validator.ts.
 * Discriminated union by `kind`. Two kinds in v1.0:
 *   - 'vocab-token-gap'         (Cv-A: vocab value not covered by any token-set fragment)
 *   - 'orphan-modifier-context' (Cv-B: themingModifier context with no setMapping reference)
 */
export type CrossValidationFinding =
  | {
      kind: 'vocab-token-gap';
      vocab: string;
      missingValue: string;
      evidence: string;
      hintContext: HintContext;
    }
  | {
      kind: 'orphan-modifier-context';
      modifier: string;
      orphanContext: string;
      evidence: string;
      hintContext: HintContext;
    };

/**
 * Descriptive statistics about the inventory — produced by analyzer/inventory-stats.ts.
 * Plan 1.3.5 attaches this to SnapshotAnalyzerOutput.stats; Plan 1.5 wires it
 * into <TBD-prose hint=...> for ds.description in the profile renderer.
 */
export interface SnapshotInventoryStats {
  componentSetsTotal: number;
  vocabulariesTotal: number;
  tokenLayersTotal: number;
  themingModifiersTotal: number;
  vocabDistribution: {
    highCoverage: number;
    midCoverage: number;
    lowCoverage: number;
  };
  meanValuesPerVocab: number;       // rounded to 1 decimal
  meanSetCoverage: number;           // rounded to 1 decimal
  componentSetCategories: Record<string, number>;
}
