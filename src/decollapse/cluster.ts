import type { CandidateAxis } from './types.js';
import { axisForAtom } from './priors.js';

interface AxisAccumulator {
  atoms: string[]; // observed atoms for this axis, first-seen order, deduped
  defaultAliasAtoms: Set<string>; // subset of `atoms` that are default aliases
}

/**
 * Clusters tokenized composite values into candidate axes using the prior
 * vocabulary (Task 2's `axisForAtom`).
 *
 * Rules:
 * 1. An atom matching a prior is bucketed under that prior's axis.
 * 2. A prior axis with exactly one observed atom, and that atom is NOT a
 *    default alias -> boolean-presence axis (values: ['false','true']).
 * 3. A prior axis with >=2 observed atoms -> enum axis; defaultValue is the
 *    observed default-alias atom if present, else the synthetic '(default)'.
 *    (Degenerate edge: exactly one observed atom that IS a default alias ->
 *    also an enum axis, with that single atom as both value and default.)
 * 4. Atoms with no prior match are collected into `unknownAtoms` (deduped,
 *    first-seen order). No residue/unclassified axes are created here.
 */
export function clusterAtoms(
  tokenized: string[][]
): { axes: CandidateAxis[]; unknownAtoms: string[] } {
  const axisOrder: string[] = [];
  const axisAccumulators = new Map<string, AxisAccumulator>();
  const unknownAtoms: string[] = [];
  const seenUnknownAtoms = new Set<string>();

  for (const composite of tokenized) {
    for (const atom of composite) {
      const match = axisForAtom(atom);

      if (!match) {
        if (!seenUnknownAtoms.has(atom)) {
          seenUnknownAtoms.add(atom);
          unknownAtoms.push(atom);
        }
        continue;
      }

      const { axis, isDefaultAlias } = match;
      let acc = axisAccumulators.get(axis);
      if (!acc) {
        acc = { atoms: [], defaultAliasAtoms: new Set() };
        axisAccumulators.set(axis, acc);
        axisOrder.push(axis);
      }
      if (!acc.atoms.includes(atom)) {
        acc.atoms.push(atom);
      }
      if (isDefaultAlias) {
        acc.defaultAliasAtoms.add(atom);
      }
    }
  }

  const axes: CandidateAxis[] = axisOrder.map((axisName): CandidateAxis => {
    const acc = axisAccumulators.get(axisName)!;

    if (acc.atoms.length === 1) {
      const [atom] = acc.atoms;
      if (acc.defaultAliasAtoms.has(atom)) {
        // Degenerate enum axis: single observed value, which is the default.
        return { name: axisName, values: [atom], source: 'prior', defaultValue: atom };
      }
      // Rule 2: single non-default atom observed -> boolean-presence axis.
      return {
        name: axisName,
        values: ['false', 'true'],
        source: 'boolean-presence',
        defaultValue: 'false',
      };
    }

    // Rule 3: >=2 observed atoms -> enum axis.
    const observedDefault = acc.atoms.find((atom) => acc.defaultAliasAtoms.has(atom));
    return {
      name: axisName,
      values: [...acc.atoms],
      source: 'prior',
      defaultValue: observedDefault ?? '(default)',
    };
  });

  return { axes, unknownAtoms };
}
