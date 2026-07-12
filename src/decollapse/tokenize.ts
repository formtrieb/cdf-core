const COMPOUND_ATOMS: Record<string, string> = {
  'read-only': 'readonly', 'on-color': 'oncolor', 'read only': 'readonly',
};

export function splitCompositeValue(value: string): string[] {
  let v = value.trim().toLowerCase();
  for (const [compound, atom] of Object.entries(COMPOUND_ATOMS)) {
    v = v.replaceAll(compound, atom);
  }
  return v.split(/[\s/+_-]+/).filter(Boolean);
}
