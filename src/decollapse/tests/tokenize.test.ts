import { describe, it, expect } from 'vitest';
import { splitCompositeValue } from '../tokenize.js';

describe('splitCompositeValue', () => {
  it('splits on -, /, +, _ and whitespace, lowercased', () => {
    expect(splitCompositeValue('Filled-Hover')).toEqual(['filled', 'hover']);
    expect(splitCompositeValue('filled+error')).toEqual(['filled', 'error']);
    expect(splitCompositeValue('Selected / Disabled')).toEqual(['selected', 'disabled']);
  });
  it('keeps atomic values whole', () => {
    expect(splitCompositeValue('default')).toEqual(['default']);
  });
  it('re-joins segments listed in the compound-atom map', () => {
    // 'read-only' and 'on-color' are single concepts, not two atoms
    expect(splitCompositeValue('read-only')).toEqual(['readonly']);
    expect(splitCompositeValue('read-only-hover')).toEqual(['readonly', 'hover']);
  });
});
