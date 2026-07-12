import { describe, it, expect } from 'vitest';
import { formatProseMarker, formatNameMarker, formatClassificationMarker, parseMarkers } from '../marker-grammar.js';

describe('marker-grammar', () => {
  describe('formatProseMarker', () => {
    it('emits a TBD-prose marker with hint', () => {
      const out = formatProseMarker('What does this vocabulary express?');
      expect(out).toBe('<TBD-prose hint="What does this vocabulary express?">');
    });

    it('escapes embedded double-quotes in hint', () => {
      const out = formatProseMarker('Why is "Icon" different from "icon"?');
      expect(out).toBe('<TBD-prose hint="Why is &quot;Icon&quot; different from &quot;icon&quot;?">');
    });
  });

  describe('formatNameMarker', () => {
    it('emits a TBD-name marker with candidates and hint', () => {
      const out = formatNameMarker(['intent', 'state'], 'higher set_coverage wins');
      expect(out).toBe('<TBD-name candidates="[\'intent\', \'state\']" hint="higher set_coverage wins">');
    });
  });

  describe('formatClassificationMarker', () => {
    it('emits a TBD-classification marker', () => {
      const out = formatClassificationMarker(['minor', 'medium', 'major'], 'how impactful?');
      expect(out).toBe('<TBD-classification candidates="[\'minor\', \'medium\', \'major\']" hint="how impactful?">');
    });
  });

  describe('parseMarkers', () => {
    it('counts markers in a YAML string', () => {
      const yaml = `
description: <TBD-prose hint="x">
name: <TBD-name candidates="['a', 'b']" hint="y">
severity: <TBD-classification candidates="['minor']" hint="z">
plain: no marker here
`;
      expect(parseMarkers(yaml)).toEqual({ prose: 1, name: 1, classification: 1, total: 3 });
    });
  });
});
