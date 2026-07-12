import type { FindingsOutput, SnapshotAnalyzerOutput, ToolSurveyState } from '../types.js';
import { detectCollisions } from './collision-detector.js';
import { detectOutliers } from './outlier-detector.js';
import { detectBlindSpots } from './blind-spot-detector.js';
import { detectCrossValidations } from './cross-validator.js';  // NEW Plan 1.3.5

interface WalkerLike {
  componentSets: Array<{
    name: string;
    rawName?: string;  // NEW Plan 1.3.5 — match outlier-detector + walker-adapter shape
    properties: Record<string, string[]>;
  }>;
}

export interface FindingsInput {
  analyzerOutput: SnapshotAnalyzerOutput;
  walker: WalkerLike;
  toolSurveyState: ToolSurveyState;
}

export function detectFindings(input: FindingsInput): FindingsOutput {
  return {
    collisions: detectCollisions(input.analyzerOutput.vocabularies),
    outliers: detectOutliers(input.analyzerOutput.vocabularies, input.walker),
    blindSpots: detectBlindSpots(input.toolSurveyState),
    crossValidations: detectCrossValidations(input.analyzerOutput),  // NEW Plan 1.3.5
  };
}

export {
  detectCollisions,
  detectOutliers,
  detectBlindSpots,
  detectCrossValidations,  // NEW Plan 1.3.5
};
