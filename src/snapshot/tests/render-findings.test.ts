import { describe, it, expect } from 'vitest';
import { renderFindings } from '../render-findings.js';
import { parseMarkers } from '../marker-grammar.js';
import type { FindingsOutput } from '../types.js';

describe('render-findings', () => {
  const fixture: FindingsOutput = {
    collisions: [
      {
        type: 'collision',
        members: ['interaction', 'state'],
        evidence: 'Both vocabs carry [hover, focus, active, disabled]; Jaccard 0.85',
        hintContext: { jaccardSimilarity: 0.85, collisionMembers: ['interaction', 'state'] },
        classificationCandidates: ['minor', 'medium', 'major'],
        suggestCanonical: true,
      },
    ],
    outliers: [
      {
        type: 'outlier',
        vocab: 'intent',
        set: 'Tag',
        outlierValue: 'info',
        evidence: 'Tag adds "info"; modal value-set is [primary, secondary, success, warning]',
        hintContext: { modalValueSet: ['primary', 'secondary', 'success', 'warning'], outlierValue: 'info' },
      },
    ],
    blindSpots: [
      {
        source: 'Variables endpoint',
        evidence: 'Figma Variables REST is Enterprise-gated',
        hintContext: { setCoverage: 0 },
      },
    ],
  };

  it('emits a heading per finding section', () => {
    const md = renderFindings(fixture);
    expect(md).toMatch(/^# /m);
    expect(md).toContain('## Collisions');
    expect(md).toContain('## Outliers');
    expect(md).toContain('## Blind Spots');
  });

  it('emits TBD-prose for plain_language and TBD-classification for severity (D1)', () => {
    const md = renderFindings(fixture);
    expect(md).toContain('Plain language:** <TBD-prose');
    expect(md).toContain('Severity:** <TBD-classification');
  });

  it('emits TBD-name for suggested_canonical only when suggestCanonical=true', () => {
    const md = renderFindings(fixture);
    expect(md).toContain('Suggested canonical:** <TBD-name');
    const noSuggest: FindingsOutput = { ...fixture, collisions: [{ ...fixture.collisions[0], suggestCanonical: false }] };
    expect(renderFindings(noSuggest)).not.toContain('Suggested canonical:');
  });

  it('embeds Stage-1 context in every hint (D3)', () => {
    const md = renderFindings(fixture);
    const proseHints = [...md.matchAll(/<TBD-prose hint="([^"]+)"/g)].map((m) => m[1]);
    for (const h of proseHints) {
      expect(/Jaccard|component_sets|modal value-set|outlier|sibling/i.test(h)).toBe(true);
    }
  });

  it('marker count matches D1: 3 prose + 1 classification + 1 name', () => {
    const md = renderFindings(fixture);
    const counts = parseMarkers(md);
    expect(counts.prose).toBe(3);
    expect(counts.classification).toBe(1);
    expect(counts.name).toBe(1);
  });
});

describe('renderFindings — Plan 1.3.5 Cross-Validations section', () => {
  it('renders ## Cross-Validations section when crossValidations is non-empty', () => {
    const md = renderFindings({
      collisions: [],
      outliers: [],
      blindSpots: [],
      crossValidations: [
        {
          kind: 'vocab-token-gap',
          vocab: 'intent',
          missingValue: 'success',
          evidence: "vocab 'intent' value 'success' (setCoverage 4) has no matching fragment.",
          hintContext: { setCoverage: 4 },
        },
        {
          kind: 'orphan-modifier-context',
          modifier: 'mode',
          orphanContext: 'Print',
          evidence: "theming-modifier 'mode' declares context 'Print' but no token-set is mapped to it.",
          hintContext: {},
        },
      ],
    });
    expect(md).toContain('## Cross-Validations');
    expect(md).toContain('vocab-token-gap');
    expect(md).toContain('orphan-modifier-context');
    expect(md).toContain("'intent.success'");
    expect(md).toContain("'mode/Print'");
  });

  it('omits ## Cross-Validations when crossValidations is empty or undefined', () => {
    const md = renderFindings({
      collisions: [],
      outliers: [],
      blindSpots: [],
      crossValidations: [],
    });
    expect(md).not.toContain('## Cross-Validations');

    const md2 = renderFindings({
      collisions: [],
      outliers: [],
      blindSpots: [],
      // crossValidations omitted entirely (legacy shape from Plan 1.3)
    });
    expect(md2).not.toContain('## Cross-Validations');
  });
});
