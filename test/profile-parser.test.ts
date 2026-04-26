import { describe, it, expect } from "vitest";
import { parseProfile } from "../src/parser/profile-parser.js";

const MINIMAL_PROFILE = `
name: TestSystem
version: "1.0.0"
cdf_version: ">=0.3.0"
dtcg_version: "2025.10"
description: "Test profile"

vocabularies:
  hierarchy:
    description: "Visual emphasis"
    values: [brand, primary, secondary]

token_grammar:
  color.controls:
    pattern: "color.controls.{hierarchy}.{element}.{state}"
    dtcg_type: color
    description: "Controls"
    axes:
      hierarchy:
        vocabulary: hierarchy
      element:
        values: [stroke, background, text]
      state:
        values: [enabled, hover, disabled]

token_layers:
  - name: Foundation
    description: "Raw primitives"
    grammars: []
  - name: Controls
    description: "Component-ready"
    grammars: [color.controls]
    references: [Foundation]

interaction_patterns:
  pressable:
    description: "Click targets"
    states: [enabled, hover, pressed, disabled]
    token_layer: Controls
    token_mapping:
      enabled: enabled
      hover: hover
      pressed: pressed
      disabled: disabled

theming:
  modifiers:
    semantic:
      description: "Color mood"
      contexts: [Light, Dark]
      required: true
  set_mapping:
    "Semantic/Light": { modifier: semantic, context: Light }
    "Semantic/Dark": { modifier: semantic, context: Dark }

accessibility_defaults:
  focus_ring:
    description: "Double ring"
    pattern: double-ring
    token_group: focus
  min_target_size:
    token: controls.minTarget
    wcag_level: AA
    description: "Min target"
  contrast_requirements:
    description: "Contrast rules"
    controls_internal:
      description: "Inside controls"
      pairs: []
    text_on_surfaces:
      description: "Text on surfaces"
      pairs: []
    state_self_consistency:
      description: "States are self-consistent"
  keyboard_defaults:
    pressable:
      Enter: activate
      Space: activate
  category_defaults:
    Actions:
      focus_visible: true
      element: button
      keyboard: pressable

naming:
  css_prefix: "ts-"
  token_prefix: "--ts-"
  methodology: BEM
  pattern: "{prefix}{component}--{modifier}__{child}"
  casing:
    properties: camelCase
    component_names: PascalCase
    css_selectors: kebab-case
  reserved_names:
    interaction: "Interaction state axis"

categories:
  Actions:
    description: "Click targets"
    interaction: pressable
    token_grammar: color.controls
    examples: [Button]
`;

describe("parseProfile", () => {
  it("parses a minimal profile YAML", () => {
    const profile = parseProfile(MINIMAL_PROFILE);
    expect(profile.name).toBe("TestSystem");
    expect(profile.version).toBe("1.0.0");
    expect(profile.vocabularies.hierarchy.values).toEqual(["brand", "primary", "secondary"]);
  });

  it("resolves vocabulary references in grammar axes", () => {
    const profile = parseProfile(MINIMAL_PROFILE);
    const axis = profile.token_grammar["color.controls"].axes!.hierarchy;
    expect(axis.vocabulary).toBe("hierarchy");
    expect(axis.values).toEqual(["brand", "primary", "secondary"]);
  });

  it("preserves token layers order", () => {
    const profile = parseProfile(MINIMAL_PROFILE);
    expect(profile.token_layers[0].name).toBe("Foundation");
    expect(profile.token_layers[1].name).toBe("Controls");
  });

  it("throws on missing required fields", () => {
    expect(() => parseProfile("version: '1.0.0'")).toThrow();
  });
});

// CDF-PROFILE-SPEC §3: token_layers, interaction_patterns,
// accessibility_defaults, categories are OPTIONAL. A Headless DS
// (e.g. Radix) may omit them without triggering the parser.
describe("parseProfile — §3 optional fields (Headless shape)", () => {
  const HEADLESS_BASE = `
name: Headless
version: "1.0.0"
cdf_version: ">=1.0.0-draft"
dtcg_version: "2025.10"
description: "Headless DS with no visual contract"

vocabularies: {}
token_grammar: {}
theming:
  modifiers: {}
  set_mapping: {}
naming:
  css_prefix: "hd-"
  token_prefix: "--hd-"
  methodology: BEM
  pattern: "{prefix}{component}"
  casing:
    properties: camelCase
    component_names: PascalCase
    css_selectors: kebab-case
  reserved_names: {}
`;

  it("accepts a profile with no token_layers", () => {
    const profile = parseProfile(HEADLESS_BASE);
    expect(profile.token_layers).toEqual([]);
  });

  it("accepts a profile with no interaction_patterns", () => {
    const profile = parseProfile(HEADLESS_BASE);
    expect(profile.interaction_patterns).toEqual({});
  });

  it("accepts a profile with no categories", () => {
    const profile = parseProfile(HEADLESS_BASE);
    expect(profile.categories).toEqual({});
  });

  it("accepts a profile with no accessibility_defaults", () => {
    const profile = parseProfile(HEADLESS_BASE);
    expect(profile.accessibility_defaults).toBeUndefined();
  });

  it("accepts an empty token_grammar map (F-Radix-8)", () => {
    const profile = parseProfile(HEADLESS_BASE);
    expect(profile.token_grammar).toEqual({});
  });
});

// CDF-PROFILE-SPEC §15.1: when a Profile `extends:` another, merge is
// per-key REPLACE at the smallest documented unit. A child that
// doesn't diverge on vocabularies / token_grammar / theming / naming
// omits them entirely — they flow in from the parent. parseProfile
// accepts this shape without throwing "missing required field".
describe("parseProfile — §15 extends-child shape", () => {
  const MINIMAL_EXTENDS_CHILD = `
name: ChildDS
version: "1.0.0"
cdf_version: ">=1.0.0 <2.0.0"
extends: ../parent.profile.yaml
description: "Child DS that inherits everything from parent."
`;

  const PARTIAL_OVERRIDE_CHILD = `
name: ChildDS
version: "1.0.0"
cdf_version: ">=1.0.0 <2.0.0"
extends: ../parent.profile.yaml
description: "Child DS with naming + theming overrides only."
naming:
  identifier: "cd"
theming:
  modifiers:
    semantic:
      description: "Child-specific light/dark"
      contexts: [Light, Dark]
      required: true
      data_attribute: data-semantic
  set_mapping:
    "Foundation/Foundation": { always_enabled: true }
`;

  it("accepts an extends-child with only identity fields", () => {
    const profile = parseProfile(MINIMAL_EXTENDS_CHILD);
    expect(profile.name).toBe("ChildDS");
    expect(profile.extends).toBe("../parent.profile.yaml");
    expect(profile.vocabularies).toBeUndefined();
    expect(profile.token_grammar).toBeUndefined();
    expect(profile.theming).toBeUndefined();
    expect(profile.naming).toBeUndefined();
  });

  it("accepts an extends-child with partial overrides", () => {
    const profile = parseProfile(PARTIAL_OVERRIDE_CHILD);
    expect(profile.naming?.identifier).toBe("cd");
    expect(profile.theming?.modifiers.semantic?.contexts).toEqual(["Light", "Dark"]);
    expect(profile.vocabularies).toBeUndefined();
    expect(profile.token_grammar).toBeUndefined();
  });

  it("still requires name + version on an extends-child", () => {
    const MISSING_NAME = `
version: "1.0.0"
extends: ../parent.profile.yaml
description: "broken — no name"
`;
    expect(() => parseProfile(MISSING_NAME)).toThrow(/missing required field: 'name'/);
  });

  it("rejects a standalone (non-extends) Profile missing vocabularies", () => {
    // Regression: extends-aware loosening must NOT leak to standalone.
    const STANDALONE_NO_VOCAB = `
name: Standalone
version: "1.0.0"
description: "no extends, no vocabularies — should fail"
token_grammar: {}
theming: { modifiers: {}, set_mapping: {} }
naming: { identifier: "st" }
`;
    expect(() => parseProfile(STANDALONE_NO_VOCAB)).toThrow(/missing required field: 'vocabularies'/);
  });

  it("treats `extends: null` and empty-string as standalone (no loosening)", () => {
    const EMPTY_EXTENDS = `
name: Weird
version: "1.0.0"
extends: ""
description: "extends field present but empty"
`;
    expect(() => parseProfile(EMPTY_EXTENDS)).toThrow(/missing required field: 'vocabularies'/);
  });
});
