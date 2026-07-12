import { describe, it, expect } from 'vitest';
import { decollapse } from '../index.js';

describe('decollapse — golden fixtures (A1/A2)', () => {
  // Golden 1 — the direction-doc crammed enum (A1)
  it('de-collapses the crammed State enum into 3 axes with 5 missing cells', () => {
    const r = decollapse({
      axisName: 'State',
      values: ['default', 'hover', 'pressed', 'filled', 'filled-hover', 'error', 'filled-error'],
    });
    expect(r.axes.map(a => a.name).sort()).toEqual(['content', 'interaction', 'validation']);
    expect(r.missingCells).toHaveLength(5);
    expect(r.missingCells.map(m => m.coord)).toContainEqual(
      { content: 'true', interaction: 'pressed', validation: 'false' });
    expect(r.residue).toEqual([]);
  });

  // Golden 2 — control-token-suffix shape, reproduces the 2026-06-17 code-entry probe (A2)
  it('recovers interaction × selection × readonly from token suffixes', () => {
    const suffixes = ['idle', 'hover', 'pressed', 'disabled'];
    const values = [
      ...suffixes,
      ...suffixes.map(s => `selected-${s}`),
      ...suffixes.map(s => `readonly-${s}`),
    ];
    const r = decollapse({ axisName: 'state', values });
    expect(r.axes.map(a => a.name).sort()).toEqual(['interaction', 'readonly', 'selection']);
    expect(r.missingCells).toHaveLength(4);   // the selected×readonly block
    expect(r.missingCells.map(m => m.coord)).toContainEqual(
      { interaction: 'idle', selection: 'true', readonly: 'true' });
  });
});

describe('decollapse — empty/all-residue input (F1)', () => {
  it('produces no axes and no spurious "(default)" missing cell', () => {
    const r = decollapse({ axisName: 'x', values: ['sparkle', 'glitter'] });
    expect(r.axes).toEqual([]);
    expect(r.missingCells).toEqual([]);
    expect(r.residue).toEqual(['sparkle', 'glitter']);
  });
});

describe('decollapse — A3 sibling-gate (F3)', () => {
  it('drops missing cells with an unevidenced non-default part, keeps fully-evidenced ones', () => {
    // 2 axes: interaction (idle/hover/pressed) x selection (boolean via
    // 'selected'). No 'pressed' token exists anywhere, so any missing cell
    // touching interaction:'pressed' has zero token-backed evidence for
    // that part and must be dropped; both 'hover' and 'selected' have a
    // token-backed sibling (bg-hover, bg-selected-idle), so the
    // hover×selected gap survives.
    const r = decollapse({
      axisName: 'state',
      values: ['idle', 'hover', 'pressed', 'selected-idle'],
      tokenNames: ['bg-idle', 'bg-hover', 'bg-selected-idle'],
    });

    expect(r.missingCells.map(m => m.coord)).toContainEqual(
      { interaction: 'hover', selection: 'true' });
    expect(r.missingCells.map(m => m.coord)).not.toContainEqual(
      { interaction: 'pressed', selection: 'true' });
  });
});
