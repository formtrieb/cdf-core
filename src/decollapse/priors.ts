interface PriorAxis {
  axis: string;
  defaultAliases: string[];
  atoms: string[];
}

export const AXIS_PRIORS: PriorAxis[] = [
  {
    axis: 'interaction',
    defaultAliases: ['default', 'idle', 'enabled', 'rest'],
    atoms: [
      'default',
      'idle',
      'enabled',
      'rest',
      'hover',
      'hovered',
      'pressed',
      'press',
      'active',
      'focus',
      'focused',
      'disabled',
    ],
  },
  {
    axis: 'validation',
    defaultAliases: ['none', 'valid'],
    atoms: ['none', 'valid', 'error', 'invalid', 'success', 'warning', 'caution'],
  },
  {
    axis: 'content',
    defaultAliases: ['empty'],
    atoms: ['empty', 'filled', 'populated', 'placeholder'],
  },
  {
    axis: 'selection',
    defaultAliases: ['unselected'],
    atoms: ['unselected', 'selected', 'checked', 'unchecked', 'indeterminate'],
  },
  { axis: 'readonly', defaultAliases: [], atoms: ['readonly'] },
  {
    axis: 'disclosure',
    defaultAliases: ['collapsed'],
    atoms: ['collapsed', 'expanded', 'open', 'closed'],
  },
];

export function axisForAtom(
  atom: string
): { axis: string; isDefaultAlias: boolean } | undefined {
  for (const p of AXIS_PRIORS) {
    if (p.atoms.includes(atom)) {
      return { axis: p.axis, isDefaultAlias: p.defaultAliases.includes(atom) };
    }
  }
  return undefined;
}
