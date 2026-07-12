import { describe, it, expect } from 'vitest';
import { crossCheckCells } from '../cross-check.js';
import type { ObservedCell } from '../types.js';

describe('crossCheckCells', () => {
  it('flags observed cells without token evidence', () => {
    const observed: ObservedCell[] = [
      { rawValue: 'hover', coord: { interaction: 'hover' } },
      { rawValue: 'sparkle', coord: { interaction: 'sparkle' } },
    ];
    const tokens = ['color-controls-primary-background-hover', 'color-controls-primary-background-idle'];
    const checked = crossCheckCells(observed, tokens);
    expect(checked[0].tokenBacked).toBe(true);
    expect(checked[1].tokenBacked).toBe(false);
  });

  it('treats a pure default-alias value as vacuously token-backed when tokens are given', () => {
    const observed: ObservedCell[] = [{ rawValue: 'default', coord: { interaction: 'default' } }];
    const tokens = ['color-controls-primary-background-idle'];
    const checked = crossCheckCells(observed, tokens);
    expect(checked[0].tokenBacked).toBe(true);
  });

  it('does not vacuously back default-alias values when no tokens are given', () => {
    const observed: ObservedCell[] = [
      { rawValue: 'default', coord: { interaction: 'default' } },
      { rawValue: 'hover', coord: { interaction: 'hover' } },
    ];
    const checked = crossCheckCells(observed, []);
    expect(checked.every((cell) => cell.tokenBacked === false)).toBe(true);
  });
});
