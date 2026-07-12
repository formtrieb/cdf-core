import type {
  CrossValidationFinding,
  SnapshotAnalyzerOutput,
} from '../types.js';

const VOCAB_ELIGIBILITY_THRESHOLD = 3;
const FRAGMENT_SPLIT = /[\/\-_\.]/;

export function detectCrossValidations(
  analyzerOutput: SnapshotAnalyzerOutput,
): CrossValidationFinding[] {
  const findings: CrossValidationFinding[] = [];

  // Cv-A: vocab-value → token-set coverage gap.
  // GUARD: when no token-set fragments exist (no tokens loaded), the
  // underlying issue is already surfaced by blind-spot-detector's
  // tokens-source finding. Skip Cv-A to avoid duplicating that signal as
  // N noisy gap findings.
  const fragmentSet = collectFragments(analyzerOutput);
  if (fragmentSet.size > 0) {
    for (const vocab of analyzerOutput.vocabularies) {
      if (vocab.setCoverage < VOCAB_ELIGIBILITY_THRESHOLD) continue;
      if (vocab.isBooleanShape) continue;
      for (const value of vocab.values) {
        if (fragmentSet.has(value.toLowerCase())) continue;
        findings.push({
          kind: 'vocab-token-gap',
          vocab: vocab.name,
          missingValue: value,
          evidence: `vocab '${vocab.name}' value '${value}' (setCoverage ${vocab.setCoverage}) has no matching fragment in any token-set name. Tokens may not cover this state.`,
          hintContext: {
            setCoverage: vocab.setCoverage,
          },
        });
      }
    }
  }

  // Cv-B: orphan theming modifier-context.
  const referenced = new Set<string>();
  for (const entry of Object.values(analyzerOutput.setMapping)) {
    if (entry.modifier !== undefined && entry.context !== undefined) {
      referenced.add(`${entry.modifier} ${entry.context}`);
    }
  }
  for (const modifier of analyzerOutput.themingModifiers) {
    for (const context of modifier.contexts) {
      const key = `${modifier.name} ${context}`;
      if (referenced.has(key)) continue;
      findings.push({
        kind: 'orphan-modifier-context',
        modifier: modifier.name,
        orphanContext: context,
        evidence: `theming-modifier '${modifier.name}' declares context '${context}' but no token-set is mapped to it — orphan context.`,
        hintContext: {},
      });
    }
  }

  return findings;
}

function collectFragments(analyzerOutput: SnapshotAnalyzerOutput): Set<string> {
  const fragments = new Set<string>();
  for (const layer of analyzerOutput.tokenLayers) {
    for (const setName of layer.sets) {
      for (const fragment of setName.split(FRAGMENT_SPLIT)) {
        if (fragment.length > 0) fragments.add(fragment.toLowerCase());
      }
    }
  }
  return fragments;
}
