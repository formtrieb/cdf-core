import type { CandidateAxis, CellCoord, MissingCell, ObservedCell } from './types.js';
import { axisForAtom } from './priors.js';

/**
 * Cartesian-product size guard. `findMissingCells` returns `[]` defensively
 * if the product would exceed this; the facade (Task 6) is expected to check
 * `productSize(axes) > MAX_PRODUCT` itself before calling, so it can report
 * a `truncated` signal to the caller.
 */
export const MAX_PRODUCT = 512;

/** Product of `axes[*].values.length` — the size of the full coordinate grid. */
export function productSize(axes: CandidateAxis[]): number {
  return axes.reduce((size, axis) => size * axis.values.length, 1);
}

/**
 * Maps each raw composite value to a full coordinate across all axes.
 *
 * Every axis starts at its `defaultValue`. For each atom in the value's
 * tokenization, `axisForAtom` routes it to a prior axis name; if that axis
 * is present in `axes`, the coordinate is updated:
 * - boolean-presence axis: the atom's presence sets the value to 'true'
 *   (there is exactly one triggering atom per such axis by construction).
 * - enum axis (source 'prior' or 'residue'): the coordinate takes the atom
 *   itself as the value.
 *
 * Atoms whose axis isn't in `axes` are ignored (the facade is expected to
 * filter residue/unclassified atoms before calling this).
 *
 * Duplicate coords across raw values are NOT deduplicated — each raw value
 * produces its own ObservedCell.
 */
export function mapCells(
  rawValues: string[],
  tokenized: string[][],
  axes: CandidateAxis[]
): ObservedCell[] {
  const axisByName = new Map(axes.map((axis) => [axis.name, axis]));

  return rawValues.map((rawValue, i): ObservedCell => {
    const coord: CellCoord = {};
    for (const axis of axes) {
      coord[axis.name] = axis.defaultValue;
    }

    for (const atom of tokenized[i] ?? []) {
      const match = axisForAtom(atom);
      if (!match) continue;
      const axis = axisByName.get(match.axis);
      if (!axis) continue;
      coord[axis.name] = axis.source === 'boolean-presence' ? 'true' : atom;
    }

    return { coord, rawValue };
  });
}

function coordsEqual(a: CellCoord, b: CellCoord, axes: CandidateAxis[]): boolean {
  return axes.every((axis) => a[axis.name] === b[axis.name]);
}

/** Cartesian product over `axes[*].values`, axes array order outermost-first. */
function cartesianProduct(axes: CandidateAxis[]): CellCoord[] {
  let combos: CellCoord[] = [{}];
  for (const axis of axes) {
    const next: CellCoord[] = [];
    for (const combo of combos) {
      for (const value of axis.values) {
        next.push({ ...combo, [axis.name]: value });
      }
    }
    combos = next;
  }
  return combos;
}

/**
 * Renders a human-readable label for a coord, joining only the non-default
 * parts with ' × '. Boolean-presence axes render as their axis name (the
 * triggering atom itself isn't tracked on CandidateAxis); enum axes render
 * as their value. An all-default coord renders as '(default)'.
 */
function coordLabel(coord: CellCoord, axes: CandidateAxis[]): string {
  const parts: string[] = [];
  for (const axis of axes) {
    const value = coord[axis.name];
    if (value === axis.defaultValue) continue;
    parts.push(axis.source === 'boolean-presence' ? axis.name : value);
  }
  return parts.length > 0 ? parts.join(' × ') : '(default)';
}

/**
 * Cartesian product over `axes[*].values` minus observed coords. Returns one
 * MissingCell per unobserved grid coordinate, with a question prompting the
 * author to confirm whether the gap is intentional.
 *
 * Defensively returns `[]` if the product size exceeds MAX_PRODUCT (the
 * facade is expected to guard this before calling, and report `truncated`).
 */
export function findMissingCells(
  axes: CandidateAxis[],
  observed: ObservedCell[]
): MissingCell[] {
  // No axes means there's nothing to cross — cartesianProduct([]) would
  // otherwise yield the single empty-coord combo `[{}]`, producing a
  // nonsense '(default)' missing cell on empty/all-residue input.
  if (axes.length === 0) return [];
  if (productSize(axes) > MAX_PRODUCT) return [];

  const missing: MissingCell[] = [];
  for (const coord of cartesianProduct(axes)) {
    const isObserved = observed.some((cell) => coordsEqual(cell.coord, coord, axes));
    if (!isObserved) {
      missing.push({ coord, question: `${coordLabel(coord, axes)}: intentional or forgotten?` });
    }
  }
  return missing;
}

/**
 * A3 sibling-gate: only worth asking about a missing cell if every
 * non-default part of its coordinate has independent token evidence —
 * some *other* token-backed observed cell shares that axis value. If no
 * token anywhere backs a given axis value, a missing cell touching that
 * value isn't a forgotten token cell (nothing evidences the value exists
 * as a real concern); don't ask about it.
 *
 * No-op filter (returns `missing` unchanged) when `axes` is empty — callers
 * only invoke this when tokenNames were provided at all.
 */
export function gateMissingCells(
  missing: MissingCell[],
  observed: ObservedCell[],
  axes: CandidateAxis[]
): MissingCell[] {
  return missing.filter((cell) =>
    axes.every((axis) => {
      const value = cell.coord[axis.name];
      if (value === axis.defaultValue) return true;
      return observed.some((o) => o.tokenBacked && o.coord[axis.name] === value);
    })
  );
}
