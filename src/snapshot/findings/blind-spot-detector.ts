import type { BlindSpotFinding, ToolSurveyState } from '../types.js';

export function detectBlindSpots(state: ToolSurveyState): BlindSpotFinding[] {
  const findings: BlindSpotFinding[] = [];

  // Condition 1: Tokens-source absent.
  if (state.tokensSource === 'none') {
    findings.push({
      source: 'tokens-source',
      evidence:
        'No tokensDir provided to produceSnapshot. theming.modifiers, token_layers, and set_mapping are all derived from $themes and have no Figma-only fallback.',
      hintContext: { setCoverage: 0 },
    });
  }

  // Condition 2: Variables endpoint not reached (always emit — Plan 1.x's fetch.ts does not fetch the Variables endpoint).
  findings.push({
    source: 'variables-endpoint',
    evidence:
      "Figma's VARIABLE collections endpoint requires Enterprise. Plan 1.x's fetch.ts only retrieves the main file resource; theming-axis-detection from VARIABLE collections is therefore not enumerable. We can still derive theming axes from $themes-group structure.",
    hintContext: { setCoverage: 0 },
  });

  // Condition 3: Walker truncation.
  if (state.walkerReportedTotal !== state.walkerActualCount) {
    findings.push({
      source: 'walker-truncation',
      evidence: `walker.componentSets.length=${state.walkerActualCount} but Phase1Output.ds_inventory.component_sets.total=${state.walkerReportedTotal}. Some component_sets may have been truncated during traversal.`,
      hintContext: {
        setCoverage: state.walkerActualCount,
        valueCoverage: Math.round((state.walkerActualCount / Math.max(state.walkerReportedTotal, 1)) * 100),
      },
    });
  }

  // Condition 4: $themes.json present but empty.
  if (state.tokensSource === 'filesystem' && state.themesArrayEmpty) {
    findings.push({
      source: 'themes-empty',
      evidence:
        '$themes.json was provided and parsed successfully but contains an empty array. theming.modifiers and set_mapping cannot be derived from an empty $themes array.',
      hintContext: { setCoverage: 0 },
    });
  }

  return findings;
}
