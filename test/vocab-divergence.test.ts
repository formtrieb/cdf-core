import { describe, it, expect } from "vitest";
import { detectVocabDivergences } from "../src/analyzer/vocab-divergence.js";
import type { CDFComponent } from "../src/types/cdf.js";
import type { DSProfile } from "../src/types/profile.js";

const BASE_PROFILE: DSProfile = {
  name: "Test",
  version: "1.0.0",
  cdf_version: ">=1.0.0",
  dtcg_version: "2025.10",
  description: "Test profile",
  vocabularies: {
    hierarchy: { description: "emphasis", values: ["brand", "primary", "secondary"] },
  },
  token_grammar: {},
  token_layers: [],
  interaction_patterns: {
    pressable: {
      description: "Click targets",
      states: ["default", "hover", "pressed", "disabled"],
      token_layer: "Controls",
      token_mapping: {},
    },
  },
  theming: { modifiers: {}, set_mapping: {} },
  naming: {
    css_prefix: "ts-",
    token_prefix: "--ts-",
    methodology: "BEM",
    pattern: "{prefix}{component}",
    casing: { properties: "camelCase", component_names: "PascalCase", css_selectors: "kebab-case" },
    reserved_names: {},
  },
  categories: {},
};

function makeComponent(overrides: Partial<CDFComponent>): CDFComponent {
  return {
    name: "TestComponent",
    category: "Actions",
    description: "Test",
    anatomy: { root: { element: "div", description: "Root" } },
    tokens: { root: {} },
    accessibility: { element: "div", "focus-visible": false, keyboard: {}, aria: [] },
    ...overrides,
  } as CDFComponent;
}

describe("detectVocabDivergences — case (a) Profile vocab drift", () => {
  it("detects a property value that's a near-miss of a declared vocab value", () => {
    // Profile declares hierarchy: [brand, primary, secondary]
    // Button uses `primary`; Link uses `primery` (typo — distance 1 from `primary`)
    const components = [
      makeComponent({
        name: "Button",
        properties: {
          variant: { type: "hierarchy", values: ["brand", "primary"], description: "emphasis" },
        },
      }),
      makeComponent({
        name: "Link",
        properties: {
          variant: { type: "hierarchy", values: ["brand", "primery"], description: "emphasis" },
        },
      }),
    ];

    const divergences = detectVocabDivergences(BASE_PROFILE, components);

    expect(divergences).toHaveLength(1);
    const d = divergences[0];
    expect(d.concept).toBe("vocabularies.hierarchy");
    expect(d.values.map(v => v.value).sort()).toEqual(["primary", "primery"]);
    expect(d.recommendation.action).toBe("rename");
    expect(d.recommendation.canonical).toBe("primary");
    expect(d.recommendation.rename).toEqual(["primery"]);
    expect(d.recommendation.evidence.profile_declared).toBe("primary");
  });

  it("returns no divergence when all values match the declared vocab", () => {
    const components = [
      makeComponent({
        name: "Button",
        properties: {
          variant: { type: "hierarchy", values: ["brand", "primary"], description: "" },
        },
      }),
      makeComponent({
        name: "Link",
        properties: {
          variant: { type: "hierarchy", values: ["primary", "secondary"], description: "" },
        },
      }),
    ];
    expect(detectVocabDivergences(BASE_PROFILE, components)).toEqual([]);
  });

  it("does NOT flag a value with no near-miss match (synonyms are out of A2 scope)", () => {
    // `coreline` is far from every declared value — a synonym, not a typo.
    // A2 scope: only flag near-miss typos. Synonyms would require A4 synonym table.
    const components = [
      makeComponent({
        name: "Card",
        properties: {
          variant: { type: "hierarchy", values: ["coreline"], description: "" },
        },
      }),
    ];
    expect(detectVocabDivergences(BASE_PROFILE, components)).toEqual([]);
  });

  it("aggregates used_in paths across multiple components using the same outlier", () => {
    // Two components both misspell `primary` as `primery`.
    // Expect one divergence; its ValueUsage for `primery` lists both components.
    const components = [
      makeComponent({
        name: "Alert",
        properties: { variant: { type: "hierarchy", values: ["primery"], description: "" } },
      }),
      makeComponent({
        name: "Toast",
        properties: { variant: { type: "hierarchy", values: ["primery"], description: "" } },
      }),
      makeComponent({
        name: "Button",
        properties: { variant: { type: "hierarchy", values: ["primary"], description: "" } },
      }),
    ];

    const divergences = detectVocabDivergences(BASE_PROFILE, components);
    expect(divergences).toHaveLength(1);

    const outlierUsage = divergences[0].values.find(v => v.value === "primery")!;
    expect(outlierUsage.count).toBe(2);
    expect(outlierUsage.used_in.map(u => u.component).sort()).toEqual(["Alert", "Toast"]);

    const canonicalUsage = divergences[0].values.find(v => v.value === "primary")!;
    expect(canonicalUsage.count).toBe(1);
    expect(canonicalUsage.used_in[0].component).toBe("Button");
  });

  it("produces a stable divergence id regardless of value order", () => {
    const components = [
      makeComponent({
        name: "A",
        properties: { variant: { type: "hierarchy", values: ["primary"], description: "" } },
      }),
      makeComponent({
        name: "B",
        properties: { variant: { type: "hierarchy", values: ["primery"], description: "" } },
      }),
    ];
    const id1 = detectVocabDivergences(BASE_PROFILE, components)[0].id;

    // Swap component order — id should be identical.
    const id2 = detectVocabDivergences(BASE_PROFILE, [...components].reverse())[0].id;
    expect(id1).toBe(id2);
  });

  it("honors conceptFilter to narrow scan", () => {
    const profile: DSProfile = {
      ...BASE_PROFILE,
      vocabularies: {
        hierarchy: { description: "", values: ["brand", "primary"] },
        size: { description: "", values: ["small", "medium", "large"] },
      },
    };
    const components = [
      makeComponent({
        name: "A",
        properties: {
          variant: { type: "hierarchy", values: ["primery"], description: "" },  // hierarchy drift
          scale: { type: "size", values: ["meduim"], description: "" },          // size drift
        },
      }),
    ];

    const filtered = detectVocabDivergences(profile, components, { conceptFilter: "vocabularies.hierarchy" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].concept).toBe("vocabularies.hierarchy");

    const all = detectVocabDivergences(profile, components);
    expect(all.map(d => d.concept).sort()).toEqual(["vocabularies.hierarchy", "vocabularies.size"]);
  });
});

describe("detectVocabDivergences — case (b) interaction-pattern states drift", () => {
  it("detects a component state key that's a near-miss of a pattern's declared state", () => {
    // Profile's pressable pattern declares [default, hover, pressed, disabled]
    // Button uses `hover`; MenuItem uses `over` (distance 1 from `hover`)
    const components = [
      makeComponent({
        name: "Button",
        states: { hover: { values: ["on", "off"], description: "" } },
      }),
      makeComponent({
        name: "MenuItem",
        states: { over: { values: ["on", "off"], description: "" } },
      }),
    ];

    const divergences = detectVocabDivergences(BASE_PROFILE, components);

    expect(divergences).toHaveLength(1);
    const d = divergences[0];
    expect(d.concept).toBe("interaction_patterns.pressable.states");
    expect(d.values.map(v => v.value).sort()).toEqual(["hover", "over"]);
    expect(d.recommendation.action).toBe("rename");
    expect(d.recommendation.canonical).toBe("hover");
    expect(d.recommendation.rename).toEqual(["over"]);
    expect(d.recommendation.evidence.profile_declared).toBe("hover");
  });

  it("records used_in paths pointing to the state key", () => {
    const components = [
      makeComponent({
        name: "MenuItem",
        states: { over: { values: [], description: "" } },
      }),
      makeComponent({
        name: "Button",
        states: { hover: { values: [], description: "" } },
      }),
    ];
    const d = detectVocabDivergences(BASE_PROFILE, components)[0];
    const overUsage = d.values.find(v => v.value === "over")!;
    expect(overUsage.used_in).toEqual([{ component: "MenuItem", path: "states.over" }]);
  });

  it("returns no divergence when all component state keys are declared", () => {
    const components = [
      makeComponent({
        name: "Button",
        states: { hover: { values: [], description: "" }, pressed: { values: [], description: "" } },
      }),
    ];
    expect(detectVocabDivergences(BASE_PROFILE, components)).toEqual([]);
  });

  it("does NOT flag a state key that has no near-miss (e.g. component-specific state)", () => {
    // `loading` is a legitimate component-specific state, not a typo of anything
    // in `pressable`. A2 only flags near-miss typos.
    const components = [
      makeComponent({
        name: "Button",
        states: { loading: { values: [], description: "" } },
      }),
    ];
    expect(detectVocabDivergences(BASE_PROFILE, components)).toEqual([]);
  });

  it("attributes drift to the interaction_pattern whose states are closest", () => {
    // Two patterns in the profile. `focusable` has [default, focus, disabled].
    // A spec uses `focs` — should attribute to `focusable`, not `pressable`.
    const profile: DSProfile = {
      ...BASE_PROFILE,
      interaction_patterns: {
        pressable: {
          description: "",
          states: ["default", "hover", "pressed", "disabled"],
          token_layer: "Controls",
          token_mapping: {},
        },
        focusable: {
          description: "",
          states: ["default", "focus", "disabled"],
          token_layer: "Controls",
          token_mapping: {},
        },
      },
    };
    const components = [
      makeComponent({
        name: "TextField",
        states: { focs: { values: [], description: "" } },
      }),
    ];

    const divergences = detectVocabDivergences(profile, components);
    expect(divergences).toHaveLength(1);
    expect(divergences[0].concept).toBe("interaction_patterns.focusable.states");
    expect(divergences[0].recommendation.canonical).toBe("focus");
  });
});

describe("detectVocabDivergences — evidence enrichment", () => {
  it("includes self_usage_majority when canonical is also in use", () => {
    // 3 specs use `primary`, 1 uses `primery`. Evidence should state 3/4 majority on canonical.
    const components = [
      makeComponent({ name: "A", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "B", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "C", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "D", properties: { v: { type: "hierarchy", values: ["primery"], description: "" } } }),
    ];
    const d = detectVocabDivergences(BASE_PROFILE, components)[0];
    expect(d.recommendation.evidence.self_usage_majority).toEqual({
      value: "primary",
      ratio: "3/4",
    });
  });

  it("omits self_usage_majority when canonical has no usages (outlier is sole occupant)", () => {
    // Only `primery` is used; the canonical `primary` has zero usages.
    // No majority to report — evidence just names the Profile-declared value.
    const components = [
      makeComponent({ name: "A", properties: { v: { type: "hierarchy", values: ["primery"], description: "" } } }),
    ];
    const d = detectVocabDivergences(BASE_PROFILE, components)[0];
    expect(d.recommendation.evidence.self_usage_majority).toBeUndefined();
    expect(d.recommendation.evidence.profile_declared).toBe("primary");
  });
});

describe("detectVocabDivergences — severity grading", () => {
  it("high: outlier is a lone dissenter (count 1) with canonical agreed elsewhere", () => {
    // 3 components use canonical `primary`, 1 uses `primery` — textbook "high".
    const components = [
      makeComponent({ name: "A", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "B", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "C", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "D", properties: { v: { type: "hierarchy", values: ["primery"], description: "" } } }),
    ];
    expect(detectVocabDivergences(BASE_PROFILE, components)[0].severity).toBe("high");
  });

  it("medium: strong majority (ratio ≥ 80%) but more than one outlier occurrence", () => {
    // 8 canonical, 2 outlier → ratio 0.8, outlier.count > 1 → medium.
    const agree = Array.from({ length: 8 }, (_, i) =>
      makeComponent({
        name: `Agree${i}`,
        properties: { v: { type: "hierarchy", values: ["primary"], description: "" } },
      }),
    );
    const dissent = Array.from({ length: 2 }, (_, i) =>
      makeComponent({
        name: `Dissent${i}`,
        properties: { v: { type: "hierarchy", values: ["primery"], description: "" } },
      }),
    );
    expect(detectVocabDivergences(BASE_PROFILE, [...agree, ...dissent])[0].severity).toBe("medium");
  });

  it("low: contested (ratio < 80%)", () => {
    // 3 canonical, 2 outlier → ratio 0.6 → low.
    const components = [
      makeComponent({ name: "A", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "B", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "C", properties: { v: { type: "hierarchy", values: ["primary"], description: "" } } }),
      makeComponent({ name: "D", properties: { v: { type: "hierarchy", values: ["primery"], description: "" } } }),
      makeComponent({ name: "E", properties: { v: { type: "hierarchy", values: ["primery"], description: "" } } }),
    ];
    expect(detectVocabDivergences(BASE_PROFILE, components)[0].severity).toBe("low");
  });

  it("low: canonical has no self-usage (Profile declares but nobody agrees yet)", () => {
    // 0 canonical, 1 outlier → Profile-declared only, no peer evidence → low.
    const components = [
      makeComponent({ name: "A", properties: { v: { type: "hierarchy", values: ["primery"], description: "" } } }),
    ];
    expect(detectVocabDivergences(BASE_PROFILE, components)[0].severity).toBe("low");
  });
});
