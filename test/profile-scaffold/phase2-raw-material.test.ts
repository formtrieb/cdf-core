import { describe, it, expect } from "vitest";
import {
  aggregateRawMaterial,
  enrichRawMaterial,
} from "../../src/analyzer/profile-scaffold/phase2-raw-material.js";
import type { InferredGrammar } from "../../src/analyzer/profile-scaffold/token-inference.js";
import type { ScaffoldInputComponent } from "../../src/analyzer/profile-scaffold/input-parser.js";
import type { DSProfile } from "../../src/types/profile.js";

function mkGrammar(over: Partial<InferredGrammar> = {}): InferredGrammar {
  return {
    name: "controls",
    pattern: "color.controls.{hierarchy}.{element}.{state}",
    dtcg_type: "color",
    axes: [
      { placeholder: "hierarchy", position: 2, values: ["primary", "secondary"] },
      { placeholder: "element", position: 3, values: ["bg", "text"] },
      { placeholder: "state", position: 4, values: ["rest", "hover"] },
    ],
    members: [],
    ...over,
  };
}

function mkComp(
  name: string,
  token_refs?: string[],
  properties: ScaffoldInputComponent["properties"] = [],
): ScaffoldInputComponent {
  return { name, properties, token_refs };
}

describe("aggregateRawMaterial", () => {
  it("returns an empty grammars map when no grammars are provided", () => {
    const r = aggregateRawMaterial([], []);
    expect(r.grammars).toEqual({});
  });

  it("leaves axisCategoryCorrelation empty when no componentCategories are supplied", () => {
    const g = mkGrammar();
    const components = [mkComp("Button", ["color.controls.primary.bg.rest"])];
    const r = aggregateRawMaterial([g], components);
    expect(r.grammars.controls.axisCategoryCorrelation).toEqual({});
  });

  it("correlates axis values with component categories when provided", () => {
    const g = mkGrammar();
    const components = [
      mkComp("Button", [
        "color.controls.primary.bg.rest",
        "color.controls.primary.text.rest",
      ]),
      mkComp("Alert", ["color.controls.secondary.bg.rest"]),
      mkComp("Banner", ["color.controls.secondary.bg.hover"]),
    ];
    const categories = {
      Button: ["action"],
      Alert: ["status"],
      Banner: ["status"],
    };
    const r = aggregateRawMaterial([g], components, {
      componentCategories: categories,
    });
    expect(r.grammars.controls.axisCategoryCorrelation).toEqual({
      hierarchy: {
        primary: ["action"],
        secondary: ["status"],
      },
      element: {
        bg: ["action", "status"],
        text: ["action"],
      },
      state: {
        rest: ["action", "status"],
        hover: ["status"],
      },
    });
  });

  it("computes sparsity as distinct-bound-slots / cartesian-product-size", () => {
    const g = mkGrammar({
      members: [
        { path: "color.controls.primary.bg.rest", value: "#fff", type: "color" },
        { path: "color.controls.primary.bg.hover", value: "#eee", type: "color" },
        { path: "color.controls.primary.text.rest", value: "#000", type: "color" },
        { path: "color.controls.secondary.bg.rest", value: "#ccc", type: "color" },
      ],
    });
    const r = aggregateRawMaterial([g], []);
    // 2 hierarchy × 2 element × 2 state = 8 total slots; 4 bound.
    expect(r.grammars.controls.sparsity).toEqual({
      boundSlots: 4,
      totalSlots: 8,
      ratio: 0.5,
    });
  });

  it("treats a grammar with no axes as a single already-bound slot", () => {
    const g = mkGrammar({
      pattern: "color.controls.primary.bg.rest",
      axes: [],
      members: [
        { path: "color.controls.primary.bg.rest", value: "#fff", type: "color" },
      ],
    });
    const r = aggregateRawMaterial([g], []);
    expect(r.grammars.controls.sparsity).toEqual({
      boundSlots: 1,
      totalSlots: 1,
      ratio: 1,
    });
  });

  it("records each component's axis-value set, de-duplicated and sorted", () => {
    const g = mkGrammar();
    const components = [
      mkComp("Button", [
        "color.controls.primary.bg.rest",
        "color.controls.primary.bg.hover",
        "color.controls.primary.text.rest",
      ]),
      mkComp("Alert", ["color.controls.secondary.bg.rest"]),
      mkComp("Card", ["spacing.md"]),
    ];
    const r = aggregateRawMaterial([g], components);
    expect(r.grammars.controls.perComponent).toEqual([
      {
        component: "Button",
        axisValues: {
          hierarchy: ["primary"],
          element: ["bg", "text"],
          state: ["hover", "rest"],
        },
      },
      {
        component: "Alert",
        axisValues: {
          hierarchy: ["secondary"],
          element: ["bg"],
          state: ["rest"],
        },
      },
    ]);
  });

  it("counts axis-value occurrences across components' token_refs", () => {
    const g = mkGrammar();
    const components = [
      mkComp("Button", [
        "color.controls.primary.bg.rest",
        "color.controls.primary.text.rest",
      ]),
      mkComp("Alert", [
        "color.controls.secondary.bg.rest",
        "color.controls.secondary.bg.hover",
      ]),
      mkComp("Card", ["spacing.md"]), // non-matching ref ignored
    ];
    const r = aggregateRawMaterial([g], components);
    expect(r.grammars.controls.usageMatrix).toEqual({
      hierarchy: { primary: 2, secondary: 2 },
      element: { bg: 3, text: 1 },
      state: { rest: 3, hover: 1 },
    });
  });
});

// ─── enrichRawMaterial (enrich-mode entry point, v1.3.0 Session 2) ────────

function mkProfile(over: Partial<DSProfile> = {}): DSProfile {
  return {
    name: "Acme",
    version: "1.0.0",
    cdf_version: ">=1.0.0 <2.0.0",
    dtcg_version: "2025.10",
    description: "",
    vocabularies: {
      hierarchy: { description: "", values: ["primary", "secondary"] },
      element: { description: "", values: ["bg", "text"] },
    },
    token_grammar: {
      controls: {
        pattern: "color.controls.{hierarchy}.{element}.{state}",
        dtcg_type: "color",
        description: "Scaffold-described grammar.",
        axes: {
          hierarchy: { vocabulary: "hierarchy" },
          element: { vocabulary: "element" },
          state: { values: ["rest", "hover"] },
        },
      },
    },
    token_layers: [],
    interaction_patterns: {},
    theming: {
      axes: [],
      modifiers: {},
    } as unknown as DSProfile["theming"],
    naming: {
      css_prefix: "acme-",
      token_prefix: "--acme-",
      methodology: "BEM",
      pattern: "{prefix}{component}",
      casing: { component_names: "PascalCase", properties: "camelCase" },
      reserved_names: {},
    },
    categories: {},
    ...over,
  };
}

describe("enrichRawMaterial", () => {
  it("reconstructs grammar axes from a declared Profile (values branch) and aggregates usage", () => {
    const profile = mkProfile({
      vocabularies: {},
      token_grammar: {
        controls: {
          pattern: "color.controls.{hierarchy}.{element}.{state}",
          dtcg_type: "color",
          description: "",
          axes: {
            hierarchy: { values: ["primary", "secondary"] },
            element: { values: ["bg", "text"] },
            state: { values: ["rest", "hover"] },
          },
        },
      },
    });
    const tokens = [
      { path: "color.controls.primary.bg.rest", value: "#fff", type: "color" as const },
      { path: "color.controls.primary.bg.hover", value: "#eee", type: "color" as const },
      { path: "color.controls.secondary.text.rest", value: "#000", type: "color" as const },
      { path: "spacing.md", value: "16", type: "dimension" as const },
    ];
    const components: ScaffoldInputComponent[] = [
      mkComp("Button", ["color.controls.primary.bg.rest", "color.controls.primary.bg.hover"]),
    ];
    const r = enrichRawMaterial(profile, tokens, components);
    expect(Object.keys(r.grammars)).toEqual(["controls"]);
    // 3 tokens match the pattern; cartesian = 2×2×2 = 8 slots, 3 distinct bound.
    expect(r.grammars.controls.sparsity).toEqual({
      boundSlots: 3,
      totalSlots: 8,
      ratio: 3 / 8,
    });
    expect(r.grammars.controls.usageMatrix).toEqual({
      hierarchy: { primary: 2 },
      element: { bg: 2 },
      state: { rest: 1, hover: 1 },
    });
    expect(r.grammars.controls.perComponent).toEqual([
      {
        component: "Button",
        axisValues: {
          hierarchy: ["primary"],
          element: ["bg"],
          state: ["hover", "rest"],
        },
      },
    ]);
  });

  it("resolves axis values from profile.vocabularies when an axis uses `vocabulary:`", () => {
    const profile = mkProfile();
    const tokens = [
      { path: "color.controls.primary.bg.rest", value: "#fff", type: "color" as const },
      { path: "color.controls.secondary.text.hover", value: "#eee", type: "color" as const },
    ];
    const r = enrichRawMaterial(profile, tokens, []);
    // If axis values were not resolved from vocab, totalSlots would miss
    // hierarchy/element values and sparsity.totalSlots would drop below 2*2*2.
    expect(r.grammars.controls.sparsity.totalSlots).toBe(8);
  });

  it("passes componentCategories through to the correlation output", () => {
    const profile = mkProfile();
    const tokens = [
      { path: "color.controls.primary.bg.rest", value: "#fff", type: "color" as const },
    ];
    const components: ScaffoldInputComponent[] = [
      mkComp("Button", ["color.controls.primary.bg.rest"]),
    ];
    const r = enrichRawMaterial(profile, tokens, components, {
      componentCategories: { Button: ["action"] },
    });
    expect(r.grammars.controls.axisCategoryCorrelation.hierarchy).toEqual({
      primary: ["action"],
    });
  });

  it("returns an empty grammars map when the profile has no token_grammar entries", () => {
    const profile = mkProfile({ token_grammar: {} });
    const r = enrichRawMaterial(profile, [], []);
    expect(r.grammars).toEqual({});
  });
});
