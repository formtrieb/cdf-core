import { describe, it, expect } from 'vitest';
import { normalizeFigmaName } from '../analyzer/figma-name-normalizer.js';

describe('figma-name-normalizer', () => {
  it('R1: trims leading and trailing whitespace', () => {
    expect(normalizeFigmaName('  Button  ')).toBe('Button');
    expect(normalizeFigmaName('\t Button \n')).toBe('Button');
  });

  it('R2: collapses internal multiple whitespace to single space', () => {
    expect(normalizeFigmaName('Big   Button')).toBe('Big Button');
    expect(normalizeFigmaName('Big\tButton')).toBe('Big Button');
    expect(normalizeFigmaName('Big\nButton')).toBe('Big Button');
    expect(normalizeFigmaName('A  B  C')).toBe('A B C');
  });

  it('KEEP: bracket/paren prefix (drift signal)', () => {
    expect(normalizeFigmaName('[v2] Button')).toBe('[v2] Button');
    expect(normalizeFigmaName('(deprecated) Button')).toBe('(deprecated) Button');
  });

  it('KEEP: leading underscore (Figma helper-component semantic)', () => {
    expect(normalizeFigmaName('_Button')).toBe('_Button');
    expect(normalizeFigmaName('_Icon')).toBe('_Icon');
  });

  it('KEEP: trailing duplication marker', () => {
    expect(normalizeFigmaName('Button (Copy)')).toBe('Button (Copy)');
    expect(normalizeFigmaName('Button (1)')).toBe('Button (1)');
  });

  it('KEEP: slashes (preserves category info)', () => {
    expect(normalizeFigmaName('Form/TextField')).toBe('Form/TextField');
    expect(normalizeFigmaName('  Form / TextField  ')).toBe('Form / TextField');
  });

  it('KEEP: casing (casing-collision-detector relies on raw signal)', () => {
    expect(normalizeFigmaName('icon')).toBe('icon');
    expect(normalizeFigmaName('Icon')).toBe('Icon');
    expect(normalizeFigmaName('ICON')).toBe('ICON');
  });

  it('idempotency — already-clean name returns identical string', () => {
    expect(normalizeFigmaName('Button')).toBe('Button');
    expect(normalizeFigmaName('Form/TextField')).toBe('Form/TextField');
  });

  it('edge case: empty string returns empty string', () => {
    expect(normalizeFigmaName('')).toBe('');
    expect(normalizeFigmaName('   ')).toBe('');
  });
});
