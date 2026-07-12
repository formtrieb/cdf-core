import { describe, it, expect } from 'vitest';
import { mapCells, findMissingCells, gateMissingCells } from '../cells.js';
import type { CandidateAxis, MissingCell, ObservedCell } from '../types.js';

const axes: CandidateAxis[] = [
  { name: 'content', values: ['false', 'true'], source: 'boolean-presence', defaultValue: 'false' },
  { name: 'interaction', values: ['default', 'hover', 'pressed'], source: 'prior', defaultValue: 'default' },
];

it('maps composites and fills implicit defaults', () => {
  const raw = ['default', 'hover', 'pressed', 'filled', 'filled-hover'];
  const tokenized = [['default'], ['hover'], ['pressed'], ['filled'], ['filled', 'hover']];
  const cells = mapCells(raw, tokenized, axes);
  expect(cells[3].coord).toEqual({ content: 'true', interaction: 'default' });
  expect(cells[4].coord).toEqual({ content: 'true', interaction: 'hover' });
});

it('finds the forgotten cell', () => {
  const raw = ['default', 'hover', 'pressed', 'filled', 'filled-hover'];
  const tokenized = [['default'], ['hover'], ['pressed'], ['filled'], ['filled', 'hover']];
  const missing = findMissingCells(axes, mapCells(raw, tokenized, axes));
  expect(missing).toHaveLength(1);
  expect(missing[0].coord).toEqual({ content: 'true', interaction: 'pressed' });
  expect(missing[0].question).toContain('intentional or forgotten');
});

it('returns no missing cells for an empty axis set (F1 — no spurious "(default)" cell)', () => {
  expect(findMissingCells([], [])).toEqual([]);
});

describe('gateMissingCells', () => {
  const gateAxes: CandidateAxis[] = [
    { name: 'interaction', values: ['idle', 'hover'], source: 'prior', defaultValue: 'idle' },
    { name: 'selection', values: ['false', 'true'], source: 'boolean-presence', defaultValue: 'false' },
  ];

  it('keeps a missing cell whose non-default parts each have a token-backed sibling', () => {
    const missing: MissingCell[] = [
      { coord: { interaction: 'hover', selection: 'true' }, question: 'hover × selection: intentional or forgotten?' },
    ];
    const observed: ObservedCell[] = [
      { rawValue: 'hover', coord: { interaction: 'hover', selection: 'false' }, tokenBacked: true },
      { rawValue: 'selected-idle', coord: { interaction: 'idle', selection: 'true' }, tokenBacked: true },
    ];
    expect(gateMissingCells(missing, observed, gateAxes)).toEqual(missing);
  });

  it('drops a missing cell with a non-default part that has zero token-backed evidence', () => {
    const missing: MissingCell[] = [
      { coord: { interaction: 'hover', selection: 'true' }, question: 'hover × selection: intentional or forgotten?' },
    ];
    const observed: ObservedCell[] = [
      { rawValue: 'hover', coord: { interaction: 'hover', selection: 'false' }, tokenBacked: false },
      { rawValue: 'selected-idle', coord: { interaction: 'idle', selection: 'true' }, tokenBacked: true },
    ];
    expect(gateMissingCells(missing, observed, gateAxes)).toEqual([]);
  });
});
