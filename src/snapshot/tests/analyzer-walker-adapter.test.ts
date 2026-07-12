import { describe, it, expect } from 'vitest';
import { adaptPhase1Output } from '../analyzer/walker-adapter.js';

describe('walker-adapter', () => {
  // NOTE: Plan 1.2 test fixture used a simplified top-level `component_sets` shape.
  // Real Phase1Output nests entries at ds_inventory.component_sets.entries.
  // This fixture matches the real type structure so the implementation is
  // production-correct (not just test-correct). The `as any` cast is retained
  // because the fixture omits non-essential Phase1Output fields.
  const phase1Fixture = {
    schema_version: 'phase-1-output-v1' as const,
    generated_at: '2026-04-28T12:00:00Z',
    generated_by: { walker: 'cdf-core@1.1.0', transformer: 'walker.ts', tier: 'rest' },
    figma_file: { file_key: 'TEST_KEY', file_name: 'TestDS' },
    ds_inventory: {
      pages: { total: 1, content: 1, separator_or_meta: 0 },
      component_sets: {
        total: 2,
        tree_unique_count: 2,
        remote_only_count: 0,
        by_page: [],
        entries: [
          {
            id: '1:1',
            name: 'Button',
            page: 'Components',
            variantCount: 4,
            propertyDefinitions: {
              intent: { type: 'VARIANT', variantOptions: ['primary', 'secondary'] },
              size:   { type: 'VARIANT', variantOptions: ['s', 'm'] },
            },
          },
          {
            id: '1:2',
            name: 'Tag',
            page: 'Components',
            variantCount: 2,
            propertyDefinitions: {
              intent: { type: 'VARIANT', variantOptions: ['primary', 'info'] },
            },
          },
        ],
      },
      standalone_components: { utility: [], documentation: [], widget: [], asset: [] },
      figma_component_descriptions: { with_description: 0, without_description: 2, ratio: 0 },
      doc_frames_info: { count: 0, samples: [] },
    },
    libraries: { linked: [], remote_components: null },
    token_regime: { detected: null, evidence: [] },
    theming_matrix: { collections: [] },
    seeded_findings: [],
    interpretation: [],
  };

  it('extracts componentSets array with name + properties shape', () => {
    const adapted = adaptPhase1Output(phase1Fixture as any);
    expect(adapted.componentSets).toHaveLength(2);
    expect(adapted.componentSets[0].name).toBe('Button');
    expect(adapted.componentSets[0].properties.intent).toEqual(['primary', 'secondary']);
    expect(adapted.componentSets[0].properties.size).toEqual(['s', 'm']);
    expect(adapted.componentSets[1].properties.intent).toEqual(['primary', 'info']);
  });

  it('skips properties with no variantOptions', () => {
    const noVariants = {
      ...phase1Fixture,
      ds_inventory: {
        ...phase1Fixture.ds_inventory,
        component_sets: {
          ...phase1Fixture.ds_inventory.component_sets,
          entries: [{
            id: '1:3',
            name: 'X',
            page: 'P',
            variantCount: 1,
            propertyDefinitions: {
              someText: { type: 'TEXT' }, // no variantOptions
              intent:   { type: 'VARIANT', variantOptions: ['a', 'b'] },
            },
          }],
        },
      },
    };
    const adapted = adaptPhase1Output(noVariants as any);
    expect(Object.keys(adapted.componentSets[0].properties)).toEqual(['intent']);
  });

  it('handles empty component_sets entries list', () => {
    const empty = {
      ...phase1Fixture,
      ds_inventory: {
        ...phase1Fixture.ds_inventory,
        component_sets: {
          ...phase1Fixture.ds_inventory.component_sets,
          entries: [],
        },
      },
    };
    expect(adaptPhase1Output(empty as any).componentSets).toEqual([]);
  });
});

describe('walker-adapter — Plan 1.3.5 normalization + rawName', () => {
  // Fixture builder: wraps a single entry name into the real Phase1Output shape.
  // Uses `as any` consistent with the existing test-suite pattern above.
  function mkFixture(entryName: string) {
    return {
      schema_version: 'phase-1-output-v1' as const,
      generated_at: '2026-04-29T00:00:00Z',
      generated_by: { walker: 'cdf-core@1.1.0', transformer: 'walker.ts', tier: 'rest' },
      figma_file: { file_key: 'TEST_KEY', file_name: 'TestDS' },
      ds_inventory: {
        pages: { total: 1, content: 1, separator_or_meta: 0 },
        component_sets: {
          total: 1,
          tree_unique_count: 1,
          remote_only_count: 0,
          by_page: [],
          entries: [
            {
              id: '1:99',
              name: entryName,
              page: 'Components',
              variantCount: 2,
              propertyDefinitions: {
                size: { type: 'VARIANT', variantOptions: ['s', 'm'] },
              },
            },
          ],
        },
        standalone_components: { utility: [], documentation: [], widget: [], asset: [] },
        figma_component_descriptions: { with_description: 0, without_description: 1, ratio: 0 },
        doc_frames_info: { count: 0, samples: [] },
      },
      libraries: { linked: [], remote_components: null },
      token_regime: { detected: null, evidence: [] },
      theming_matrix: { collections: [] },
      seeded_findings: [],
      interpretation: [],
    } as any;
  }

  it('populates rawName equal to name when input is already clean', () => {
    const adapted = adaptPhase1Output(mkFixture('Button'));
    expect(adapted.componentSets).toHaveLength(1);
    expect(adapted.componentSets[0].name).toBe('Button');
    expect(adapted.componentSets[0].rawName).toBe('Button');
  });

  it('normalizes whitespace and carries rawName separately', () => {
    const adapted = adaptPhase1Output(mkFixture('  Button   Primary  '));
    expect(adapted.componentSets[0].name).toBe('Button Primary');
    expect(adapted.componentSets[0].rawName).toBe('  Button   Primary  ');
  });

  it('preserves bracket-prefix in BOTH name and rawName (literal-keep rule)', () => {
    const adapted = adaptPhase1Output(mkFixture('[v2] Button'));
    expect(adapted.componentSets[0].name).toBe('[v2] Button');
    expect(adapted.componentSets[0].rawName).toBe('[v2] Button');
  });

  it('preserves leading underscore in BOTH name and rawName', () => {
    const adapted = adaptPhase1Output(mkFixture('_Button'));
    expect(adapted.componentSets[0].name).toBe('_Button');
    expect(adapted.componentSets[0].rawName).toBe('_Button');
  });

  it('preserves slashes (Form/TextField stays nested)', () => {
    const adapted = adaptPhase1Output(mkFixture('Form/TextField'));
    expect(adapted.componentSets[0].name).toBe('Form/TextField');
    expect(adapted.componentSets[0].rawName).toBe('Form/TextField');
  });
});
