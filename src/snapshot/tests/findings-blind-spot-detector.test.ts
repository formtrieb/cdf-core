import { describe, it, expect } from 'vitest';
import { detectBlindSpots } from '../findings/blind-spot-detector.js';
import type { ToolSurveyState } from '../types.js';

const baseState: ToolSurveyState = {
  figmaFetchSource: 'rest',
  tokensSource: 'filesystem',
  themesArrayEmpty: false,
  walkerReportedTotal: 5,
  walkerActualCount: 5,
};

describe('blind-spot-detector', () => {
  it('emits tokens-source blind-spot when tokensSource === "none"', () => {
    const findings = detectBlindSpots({ ...baseState, tokensSource: 'none' });
    const tokensFinding = findings.find((f) => f.source === 'tokens-source');
    expect(tokensFinding).toBeDefined();
    expect(tokensFinding!.evidence).toMatch(/tokens/i);
  });

  it('always emits Variables-endpoint blind-spot (Plan 1.x does not fetch Variables)', () => {
    const findings = detectBlindSpots(baseState);
    const variablesFinding = findings.find((f) => f.source === 'variables-endpoint');
    expect(variablesFinding).toBeDefined();
    expect(variablesFinding!.evidence).toMatch(/Variables|VARIABLE/i);
  });

  it('emits walker-truncation blind-spot when reported !== actual', () => {
    const findings = detectBlindSpots({
      ...baseState,
      walkerReportedTotal: 10,
      walkerActualCount: 7,
    });
    const truncationFinding = findings.find((f) => f.source === 'walker-truncation');
    expect(truncationFinding).toBeDefined();
    expect(truncationFinding!.evidence).toMatch(/10|7|truncat/i);
  });

  it('does NOT emit walker-truncation when counts match', () => {
    const findings = detectBlindSpots({
      ...baseState,
      walkerReportedTotal: 5,
      walkerActualCount: 5,
    });
    expect(findings.find((f) => f.source === 'walker-truncation')).toBeUndefined();
  });

  it('emits themes-empty blind-spot when filesystem AND themesArrayEmpty=true', () => {
    const findings = detectBlindSpots({
      ...baseState,
      tokensSource: 'filesystem',
      themesArrayEmpty: true,
    });
    const emptyFinding = findings.find((f) => f.source === 'themes-empty');
    expect(emptyFinding).toBeDefined();
    expect(emptyFinding!.evidence).toMatch(/\$themes/);
  });

  it('does NOT emit themes-empty when tokensSource is "none" (covered by tokens-source instead)', () => {
    const findings = detectBlindSpots({
      ...baseState,
      tokensSource: 'none',
      themesArrayEmpty: true,
    });
    expect(findings.find((f) => f.source === 'themes-empty')).toBeUndefined();
  });

  it('all findings carry non-empty hintContext (D3 contract)', () => {
    const findings = detectBlindSpots({
      ...baseState,
      tokensSource: 'none',
      walkerReportedTotal: 10,
      walkerActualCount: 7,
    });
    for (const f of findings) {
      const hasField = Object.values(f.hintContext).some((v) => v !== undefined);
      expect(hasField).toBe(true);
    }
  });
});
