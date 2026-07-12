import type { DecollapseResult } from './types.js';
import { splitCompositeValue } from './tokenize.js';
import { axisForAtom } from './priors.js';
import { clusterAtoms } from './cluster.js';
import { mapCells, findMissingCells, gateMissingCells, productSize, MAX_PRODUCT } from './cells.js';
import { crossCheckCells } from './cross-check.js';

export type {
  CandidateAxis,
  CellCoord,
  ObservedCell,
  MissingCell,
  DecollapseResult,
} from './types.js';

/**
 * De-collapse facade: turns a crammed enum's flat value list into candidate
 * axes + a coordinate matrix (observed + missing cells).
 *
 * Pipeline: tokenize -> residue split -> clusterAtoms -> mapCells ->
 * (truncation guard ->) findMissingCells -> (tokenNames ->) crossCheckCells.
 *
 * Residue rule: a value goes to `residue` (and is fully excluded from
 * clustering/the matrix) iff ANY of its atoms is unknown to `axisForAtom`.
 * Partially-understood values would otherwise produce silently-wrong coords.
 */
export function decollapse(input: {
  axisName: string;
  values: string[];
  tokenNames?: string[];
}): DecollapseResult {
  const { axisName, values, tokenNames } = input;

  const tokenized = values.map(splitCompositeValue);

  const residue: string[] = [];
  const knownValues: string[] = [];
  const knownTokenized: string[][] = [];

  values.forEach((value, i) => {
    const atoms = tokenized[i];
    const allKnown = atoms.every((atom) => axisForAtom(atom) !== undefined);
    if (allKnown) {
      knownValues.push(value);
      knownTokenized.push(atoms);
    } else {
      residue.push(value);
    }
  });

  const { axes } = clusterAtoms(knownTokenized);

  let observedCells = mapCells(knownValues, knownTokenized, axes);

  const truncated = productSize(axes) > MAX_PRODUCT;
  let missingCells = truncated ? [] : findMissingCells(axes, observedCells);

  if (tokenNames) {
    observedCells = crossCheckCells(observedCells, tokenNames);
    // A3 sibling-gate: only ask about a missing cell when every non-default
    // part of its coord has an independent token-backed sibling. Never ship
    // a heuristic-only finding — no gate is possible without real tokens,
    // so this only runs when tokenNames were provided.
    missingCells = gateMissingCells(missingCells, observedCells, axes);
  }

  return {
    input: { axisName, values },
    axes,
    observedCells,
    missingCells,
    residue,
    ...(truncated ? { truncated: true } : {}),
  };
}
