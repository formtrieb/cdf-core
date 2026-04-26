import { describe, it, expect } from "vitest";
import { checkConvention } from "../src/validator/rules/convention.js";
import type { CDFComponent, CDFConfig } from "../src/types/cdf.js";
import type { DSProfile } from "../src/types/profile.js";

const TEST_PROFILE: DSProfile = {
  name: "Test",
  version: "1.0.0",
  cdf_version: ">=0.3.0",
  dtcg_version: "2025.10",
  description: "Test profile",
  vocabularies: {
    hierarchy: { description: "emphasis", values: ["brand", "primary", "secondary", "tertiary"] },
    element: { description: "visual parts", values: ["stroke", "background", "text", "icon"] },
    size: { description: "scale", values: ["xsmall", "small", "base", "medium", "large", "xlarge"], casing: "lowercase" },
    intent: { description: "meaning", values: ["positive", "negative", "caution", "informative", "neutral"] },
  },
  token_grammar: {
    "color.controls": {
      pattern: "color.controls.{hierarchy}.{element}.{state}",
      dtcg_type: "color",
      description: "Controls",
      axes: {
        hierarchy: { vocabulary: "hierarchy", values: ["brand", "primary", "secondary", "tertiary"] },
        element: { vocabulary: "element", values: ["stroke", "background", "text", "icon"] },
        state: { values: ["enabled", "hover", "pressed", "active", "disabled", "error"] },
      },
    },
    "color.system-status": {
      pattern: "color.system-status.{intent}.{element}.{hierarchy}",
      dtcg_type: "color",
      description: "Status",
      axes: {
        intent: { vocabulary: "intent", values: ["positive", "negative", "caution", "informative", "neutral"] },
        element: { vocabulary: "element", values: ["stroke", "background", "text", "icon"] },
        hierarchy: { values: ["primary", "secondary"] },
      },
    },
  },
  token_layers: [
    { name: "Foundation", description: "Raw", grammars: [] },
    { name: "Controls", description: "Ready", grammars: ["color.controls"], references: ["Foundation"] },
  ],
  interaction_patterns: {
    pressable: {
      description: "Click targets",
      states: ["enabled", "hover", "pressed", "disabled"],
      token_layer: "Controls",
      token_mapping: { enabled: "enabled", hover: "hover", pressed: "pressed", disabled: "disabled" },
    },
  },
  theming: {
    modifiers: {
      semantic: { description: "Color mood", contexts: ["Light", "Dark"], required: true },
      device: { description: "Viewport", contexts: ["Desktop", "Tablet", "Mobile"] },
      shape: { description: "Radius", contexts: ["Round", "Sharp"] },
    },
    set_mapping: {},
  },
  accessibility_defaults: {
    focus_ring: { description: "Double ring", pattern: "double-ring", token_group: "focus" },
    min_target_size: { token: "controls.minTarget", wcag_level: "AA", description: "Min target" },
    contrast_requirements: {
      description: "Contrast",
      controls_internal: { description: "Inside", pairs: [] },
      text_on_surfaces: { description: "Surfaces", pairs: [] },
      state_self_consistency: { description: "States" },
    },
    keyboard_defaults: { pressable: { Enter: "activate", Space: "activate" } },
    category_defaults: {
      Actions: { focus_visible: true, element: "button", keyboard: "pressable" },
      Inputs: { focus_visible: true, element: "input", keyboard: "focusable" },
    },
  },
  naming: {
    css_prefix: "ts-",
    token_prefix: "--ts-",
    methodology: "BEM",
    pattern: "{prefix}{component}--{modifier}__{child}",
    casing: { properties: "camelCase", component_names: "PascalCase", css_selectors: "kebab-case" },
    reserved_names: { interaction: "Interaction axis", hierarchy: "Emphasis axis" },
  },
  categories: {
    Primitives: { description: "Atomic", interaction: "none" },
    Actions: { description: "Clickable", interaction: "pressable", token_grammar: "color.controls" },
    Inputs: { description: "Data entry", interaction: "focusable", token_grammar: "color.controls" },
    Status: { description: "Indicators", interaction: "none", token_grammar: "color.system-status" },
    Layout: { description: "Structure", interaction: "none" },
  },
};

function makeConfig(profile: DSProfile): CDFConfig {
  return { spec_directories: [], token_sources: [], ds_profile: profile };
}

function makeComponent(overrides: Partial<CDFComponent>): CDFComponent {
  return {
    name: "TestButton", category: "Actions", description: "Test",
    anatomy: { root: { element: "button", description: "Root" } },
    tokens: { root: {} },
    accessibility: { element: "button", "focus-visible": true, keyboard: { Enter: "activate" }, aria: [] },
    ...overrides,
  } as CDFComponent;
}

describe("Profile-driven convention rules", () => {
  it("category-known: accepts Profile-defined category", () => {
    const issues = checkConvention(makeComponent({ category: "Actions" }), makeConfig(TEST_PROFILE));
    expect(issues.filter(i => i.rule === "category-known")).toHaveLength(0);
  });

  it("category-known: flags unknown category", () => {
    const issues = checkConvention(makeComponent({ category: "Widgets" }), makeConfig(TEST_PROFILE));
    expect(issues).toContainEqual(expect.objectContaining({ rule: "category-known", severity: "info" }));
  });

  it("theme-axes-match: flags value not in Profile", () => {
    const comp = makeComponent({
      theme_axes: { semantic: { values: ["Light", "ExtraDark"], data_attribute: "data-semantic", affects: "" } },
    });
    const issues = checkConvention(comp, makeConfig(TEST_PROFILE));
    expect(issues).toContainEqual(expect.objectContaining({
      rule: "theme-axes-match",
      message: expect.stringContaining("ExtraDark"),
    }));
  });

  it("naming-convention: flags property named 'state' (reserved for 'interaction')", () => {
    const comp = makeComponent({
      properties: { state: { type: "enum", values: ["a", "b"], default: "a", description: "State" } },
    });
    const issues = checkConvention(comp, makeConfig(TEST_PROFILE));
    expect(issues).toContainEqual(expect.objectContaining({ rule: "naming-convention" }));
  });

  it("prefix-consistent: flags wrong prefix", () => {
    const comp = makeComponent({
      css: { prefix: "wrong-", class_pattern: ".wrong-button" },
    });
    const issues = checkConvention(comp, makeConfig(TEST_PROFILE));
    expect(issues).toContainEqual(expect.objectContaining({ rule: "prefix-consistent" }));
  });

  it("returns no issues when no Profile is loaded", () => {
    const config: CDFConfig = { spec_directories: [], token_sources: [] };
    const issues = checkConvention(makeComponent({}), config);
    expect(issues).toHaveLength(0);
  });
});
