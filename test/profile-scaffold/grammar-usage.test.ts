import { describe, it, expect } from "vitest";
import { annotateGrammarUsage } from "../../src/analyzer/profile-scaffold/grammar-usage.js";
import type { InferredGrammar } from "../../src/analyzer/profile-scaffold/token-inference.js";
import type { ScaffoldInputComponent } from "../../src/analyzer/profile-scaffold/input-parser.js";
import { buildPriorArtIndex } from "../../src/analyzer/profile-scaffold/prior-art.js";
import type { DSProfile } from "../../src/types/profile.js";

function mkGrammar(over: Partial<InferredGrammar> = {}): InferredGrammar {
  return {
    name: "color",
    pattern: "color.{axis0}.{axis1}.{axis2}",
    dtcg_type: "color",
    axes: [
      { placeholder: "axis0", position: 1, values: ["button", "alert"] },
      { placeholder: "axis1", position: 2, values: ["bg", "text"] },
      { placeholder: "axis2", position: 3, values: ["rest", "hover"] },
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

const EMPTY_PRIOR_ART = buildPriorArtIndex([]);

describe("annotateGrammarUsage", () => {
  it("returns one annotation per grammar", () => {
    const g = mkGrammar();
    const r = annotateGrammarUsage([g], [], EMPTY_PRIOR_ART);
    expect(r.annotations).toHaveLength(1);
    expect(r.annotations[0].grammarName).toBe("color");
  });

  it("populates used_by with components whose token_refs match the pattern", () => {
    const g = mkGrammar();
    const components = [
      mkComp("Button", ["color.button.bg.rest", "color.button.text.rest"]),
      mkComp("Alert", ["color.alert.bg.hover"]),
      mkComp("Card", ["spacing.md"]), // no color.* refs
    ];
    const r = annotateGrammarUsage([g], components, EMPTY_PRIOR_ART);
    expect(r.annotations[0].used_by.sort()).toEqual(["Alert", "Button"]);
  });

  it("skips components with no token_refs and warns when no component has refs", () => {
    const g = mkGrammar();
    const components = [mkComp("Button"), mkComp("Alert")];
    const r = annotateGrammarUsage([g], components, EMPTY_PRIOR_ART);
    expect(r.annotations[0].used_by).toEqual([]);
    expect(
      r.warnings.some((w) => /token_refs|usage annotation/.test(w)),
    ).toBe(true);
  });

  it("does NOT warn when at least one component supplies token_refs", () => {
    const g = mkGrammar();
    const components = [
      mkComp("Button", ["color.button.bg.rest"]),
      mkComp("Alert"), // no refs — but we have Button
    ];
    const r = annotateGrammarUsage([g], components, EMPTY_PRIOR_ART);
    expect(r.warnings.filter((w) => /token_refs/.test(w))).toEqual([]);
  });

  it("matches a ref against a pattern (literal segments must match; axes match any)", () => {
    const g = mkGrammar({
      pattern: "color.controls.{axis0}.{axis1}.{axis2}",
      axes: [
        { placeholder: "axis0", position: 2, values: ["primary"] },
        { placeholder: "axis1", position: 3, values: ["bg"] },
        { placeholder: "axis2", position: 4, values: ["rest"] },
      ],
    });
    const components = [
      mkComp("Button", ["color.controls.primary.bg.rest"]),
      mkComp("Other", ["color.status.info.bg.rest"]), // literal `controls` mismatch
    ];
    const r = annotateGrammarUsage([g], components, EMPTY_PRIOR_ART);
    expect(r.annotations[0].used_by).toEqual(["Button"]);
  });

  it("emits a generic description when no prior-art pattern matches", () => {
    const g = mkGrammar();
    const r = annotateGrammarUsage([g], [], EMPTY_PRIOR_ART);
    expect(r.annotations[0].description).toMatch(/scaffold|inferred/i);
  });

  it("seeds the description from prior-art when a structurally-matching grammar exists", () => {
    // Formtrieb-style Interactive Controls pattern in prior-art
    const priorProfile: DSProfile = {
      name: "Formtrieb",
      version: "1.0",
      cdf_version: ">=1",
      dtcg_version: "2025.10",
      description: "",
      vocabularies: {},
      token_grammar: {
        controls: {
          pattern: "color.controls.{hierarchy}.{element}.{state}",
          dtcg_type: "color",
          description:
            "Interactive Controls pattern — background, border, text, icon of clickable surfaces across hierarchy (brand/primary/secondary) and state (rest/hover/pressed/disabled).",
        },
      },
      token_layers: [],
      interaction_patterns: {},
      theming: { modifiers: {}, set_mapping: {} },
      naming: {
        css_prefix: "ft-",
        token_prefix: "--ft-",
        methodology: "BEM",
        pattern: "x",
        casing: {},
        reserved_names: {},
      },
      categories: {},
    };
    const priorArt = buildPriorArtIndex([
      { ds: "formtrieb", profile: priorProfile },
    ]);
    const g = mkGrammar({
      pattern: "color.controls.{axis0}.{axis1}.{axis2}",
      axes: [
        { placeholder: "axis0", position: 2, values: ["primary", "secondary"] },
        { placeholder: "axis1", position: 3, values: ["bg", "text"] },
        { placeholder: "axis2", position: 4, values: ["rest", "hover"] },
      ],
    });
    const r = annotateGrammarUsage([g], [], priorArt);
    // Description should cite the prior-art source
    expect(r.annotations[0].description.toLowerCase()).toContain("formtrieb");
  });

  it("attributes used_by across multiple components, sorted, deduped", () => {
    const g = mkGrammar();
    const components = [
      mkComp("Button", ["color.button.bg.rest", "color.button.text.rest"]),
      mkComp("Button", ["color.button.border.rest"]), // duplicate name — should still count once
      mkComp("Alert", ["color.alert.bg.rest"]),
    ];
    const r = annotateGrammarUsage([g], components, EMPTY_PRIOR_ART);
    expect(r.annotations[0].used_by).toEqual(["Alert", "Button"]);
  });

  it("seeds placeholder-name examples from the matched prior-art pattern (N2, v1.2.1)", () => {
    // Matching a prior-art grammar whose pattern uses `{role}, {slot}`
    // must produce example names from THAT pattern, not Formtrieb's
    // `{hierarchy}, {element}, {state}` default.
    const materialLike: DSProfile = {
      name: "Material3-ish",
      version: "1.0",
      cdf_version: ">=1",
      dtcg_version: "2025.10",
      description: "",
      vocabularies: {},
      token_grammar: {
        palette: {
          pattern: "color.{role}.{slot}",
          dtcg_type: "color",
          description: "Role-slot bound color family.",
        },
      },
      token_layers: [],
      interaction_patterns: {},
      theming: { modifiers: {}, set_mapping: {} },
      naming: {
        css_prefix: "m3-",
        token_prefix: "--m3-",
        methodology: "BEM",
        pattern: "x",
        casing: {},
        reserved_names: {},
      },
      categories: {},
    };
    const priorArt = buildPriorArtIndex([{ ds: "material3", profile: materialLike }]);
    const g = mkGrammar({
      name: "color",
      pattern: "color.{axis0}.{axis1}",
      axes: [
        { placeholder: "axis0", position: 1, values: ["primary", "secondary"] },
        { placeholder: "axis1", position: 2, values: ["on", "fill"] },
      ],
    });
    const r = annotateGrammarUsage([g], [], priorArt);
    const desc = r.annotations[0].description;
    expect(desc).toContain("`{role}`");
    expect(desc).toContain("`{slot}`");
    // Pre-N2 the hint always carried Formtrieb's names — assert neither
    // leaks when the match came from a non-Formtrieb pattern.
    expect(desc).not.toContain("`{hierarchy}`");
    expect(desc).not.toContain("`{element}`");
  });

  it("handles multiple grammars independently", () => {
    const color = mkGrammar({ name: "color", pattern: "color.{axis0}" });
    color.axes = [{ placeholder: "axis0", position: 1, values: ["a", "b"] }];
    const spacing = mkGrammar({
      name: "spacing",
      pattern: "spacing.{axis0}",
      dtcg_type: "dimension",
    });
    spacing.axes = [{ placeholder: "axis0", position: 1, values: ["sm", "md"] }];

    const components = [
      mkComp("Button", ["color.a", "spacing.sm"]),
    ];
    const r = annotateGrammarUsage([color, spacing], components, EMPTY_PRIOR_ART);
    expect(r.annotations).toHaveLength(2);
    expect(
      r.annotations.find((a) => a.grammarName === "color")!.used_by,
    ).toEqual(["Button"]);
    expect(
      r.annotations.find((a) => a.grammarName === "spacing")!.used_by,
    ).toEqual(["Button"]);
  });
});
