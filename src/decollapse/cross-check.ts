import { splitCompositeValue } from './tokenize.js';
import { axisForAtom } from './priors.js';
import type { ObservedCell } from './types.js';

/**
 * Marks each observed cell `tokenBacked: true` when a real token's name
 * covers the cell's non-default atoms — surfaces enum values that exist
 * but have no backing token.
 *
 * Default-alias atoms (e.g. 'default', 'idle') aren't cross-checked: they
 * carry no independent meaning, so a cell composed entirely of them (a
 * pure default value) is vacuously token-backed as long as some tokens
 * were actually given — otherwise (no tokens) it stays unbacked like any
 * other cell.
 */
export function crossCheckCells(observed: ObservedCell[], tokenNames: string[]): ObservedCell[] {
  // Precompute token atoms to avoid re-tokenizing for each cell
  const tokenAtomSets: string[][] = tokenNames.map(splitCompositeValue);

  return observed.map(cell => {
    const cellAtoms = splitCompositeValue(cell.rawValue);
    const nonDefaultAtoms = cellAtoms.filter(atom => axisForAtom(atom)?.isDefaultAlias !== true);

    const tokenBacked =
      nonDefaultAtoms.length === 0
        ? tokenNames.length > 0
        : tokenAtomSets.some(atoms => nonDefaultAtoms.every(atom => atoms.includes(atom)));

    return {
      ...cell,
      tokenBacked,
    };
  });
}
