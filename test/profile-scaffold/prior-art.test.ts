import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPriorArtIndex,
  loadPriorArtIndex,
} from "../../src/analyzer/profile-scaffold/prior-art.js";
import type { DSProfile } from "../../src/types/profile.js";

function baseProfile(overrides: Partial<DSProfile> = {}): DSProfile {
  return {
    name: "Fixture",
    version: "1.0.0",
    cdf_version: ">=1.0.0",
    dtcg_version: "2025.10",
    description: "fx",
    vocabularies: {},
    token_grammar: {},
    token_layers: [],
    interaction_patterns: {},
    theming: { modifiers: {}, set_mapping: {} },
    naming: {
      css_prefix: "fx-",
      token_prefix: "--fx-",
      methodology: "BEM",
      pattern: "{prefix}{component}",
      casing: { properties: "camelCase", component_names: "PascalCase" },
      reserved_names: {},
    },
    categories: {},
    ...overrides,
  };
}

describe("buildPriorArtIndex", () => {
  it("returns an empty index for no inputs", () => {
    const idx = buildPriorArtIndex([]);
    expect(idx.vocabularies.size).toBe(0);
    expect(idx.interactionStates.size).toBe(0);
    expect(idx.themingModifiers.size).toBe(0);
    expect(idx.grammarPatterns).toHaveLength(0);
  });

  it("indexes vocabularies from a single profile with DS attribution", () => {
    const profile = baseProfile({
      vocabularies: {
        hierarchy: { description: "emphasis", values: ["primary", "secondary"] },
      },
    });
    const idx = buildPriorArtIndex([{ ds: "test-ds", profile }]);
    const entry = idx.vocabularies.get("hierarchy");
    expect(entry).toBeDefined();
    expect(entry!.usedInDSes).toEqual(["test-ds"]);
    expect(entry!.commonValues.has("primary")).toBe(true);
    expect(entry!.commonValues.has("secondary")).toBe(true);
  });

  it("merges usedInDSes across profiles sharing a vocabulary name", () => {
    const a = baseProfile({
      vocabularies: { hierarchy: { description: "a", values: ["primary"] } },
    });
    const b = baseProfile({
      vocabularies: { hierarchy: { description: "b", values: ["brand"] } },
    });
    const idx = buildPriorArtIndex([
      { ds: "alpha", profile: a },
      { ds: "beta", profile: b },
    ]);
    const entry = idx.vocabularies.get("hierarchy");
    expect(entry!.usedInDSes.sort()).toEqual(["alpha", "beta"]);
    expect(entry!.commonValues.has("primary")).toBe(true);
    expect(entry!.commonValues.has("brand")).toBe(true);
  });

  it("indexes interaction-pattern state names", () => {
    const profile = baseProfile({
      interaction_patterns: {
        pressable: {
          description: "press",
          states: ["default", "hover", "pressed", "disabled"],
        },
      },
    });
    const idx = buildPriorArtIndex([{ ds: "x", profile }]);
    expect(idx.interactionStates.get("default")?.usedInDSes).toEqual(["x"]);
    expect(idx.interactionStates.get("hover")?.usedInDSes).toEqual(["x"]);
    expect(idx.interactionStates.has("pressed")).toBe(true);
  });

  it("indexes theming modifiers with their contexts", () => {
    const profile = baseProfile({
      theming: {
        modifiers: {
          semantic: {
            description: "light/dark",
            contexts: ["Light", "Dark"],
          },
        },
        set_mapping: {},
      },
    });
    const idx = buildPriorArtIndex([{ ds: "y", profile }]);
    const entry = idx.themingModifiers.get("semantic");
    expect(entry).toBeDefined();
    expect(entry!.usedInDSes).toEqual(["y"]);
    expect(entry!.contexts.sort()).toEqual(["Dark", "Light"]);
  });

  it("indexes grammar patterns with DS attribution", () => {
    const profile = baseProfile({
      token_grammar: {
        controls: {
          pattern: "color.controls.{hierarchy}.{element}.{state}",
          dtcg_type: "color",
          description: "interactive controls",
        },
      },
    });
    const idx = buildPriorArtIndex([{ ds: "z", profile }]);
    expect(idx.grammarPatterns).toHaveLength(1);
    expect(idx.grammarPatterns[0].pattern).toBe(
      "color.controls.{hierarchy}.{element}.{state}",
    );
    expect(idx.grammarPatterns[0].usedInDSes).toEqual(["z"]);
  });

  it("groups identical grammar patterns across DSes", () => {
    const a = baseProfile({
      token_grammar: {
        controls: { pattern: "color.{role}.{slot}", dtcg_type: "color", description: "a" },
      },
    });
    const b = baseProfile({
      token_grammar: {
        controls: { pattern: "color.{role}.{slot}", dtcg_type: "color", description: "b" },
      },
    });
    const idx = buildPriorArtIndex([
      { ds: "alpha", profile: a },
      { ds: "beta", profile: b },
    ]);
    expect(idx.grammarPatterns).toHaveLength(1);
    expect(idx.grammarPatterns[0].usedInDSes.sort()).toEqual(["alpha", "beta"]);
  });
});

// The 5 example profiles live in the monorepo's cdf/examples/ directory;
// when this package is consumed standalone, that directory is not present
// and the integration check is skipped.
const EXAMPLES_DIR = resolve(import.meta.dirname, "../../../../cdf/examples");

describe.skipIf(!existsSync(EXAMPLES_DIR))("loadPriorArtIndex (filesystem)", () => {
  it("loads all 5 profiles from the explicit cdf/examples/ directory", () => {
    const examplesDir = EXAMPLES_DIR;
    const idx = loadPriorArtIndex(examplesDir);
    // Sanity check: there are 5 example profiles (radix, shadcn, primer,
    // material3, uswds). Each is a DS in some index entry — impossible to
    // assert more without pinning values, but at least one vocabulary or
    // interaction-pattern should be attributed to multiple DSes.
    const dsNames = new Set<string>();
    for (const entry of idx.vocabularies.values()) {
      for (const ds of entry.usedInDSes) dsNames.add(ds);
    }
    for (const entry of idx.interactionStates.values()) {
      for (const ds of entry.usedInDSes) dsNames.add(ds);
    }
    expect(dsNames.size).toBe(5);
    expect([...dsNames].sort()).toEqual([
      "material3",
      "primer",
      "radix",
      "shadcn",
      "uswds",
    ]);
  });
});
