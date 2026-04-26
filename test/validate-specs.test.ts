import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  validateAll,
  validateFile,
  validate,
  parseCDF,
  parseCDFFile,
  resolveInheritance,
  expandTokenPath,
  suggestImprovements,
} from "../src/index.js";
import type { CDFComponent, CDFConfig } from "../src/index.js";

const specsDir = resolve(import.meta.dirname, "./fixtures/specs/components");

// ─── Validator rules: structural (errors) ──────────────────────────────────

describe("structural rules", () => {
  it("required-fields: missing name produces error", () => {
    const report = validate({ category: "Test", description: "t", anatomy: { c: { element: "box", description: "t" } }, tokens: { c: {} }, accessibility: { element: "div", "focus-visible": false, keyboard: {}, aria: [] } } as CDFComponent);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "required-fields", path: "name" }));
  });

  it("required-fields: inheriting component may omit anatomy, tokens, accessibility", () => {
    const report = validate({ name: "Child", category: "Test", description: "t", inherits: "parent.component.yaml" } as CDFComponent);
    expect(report.errors.filter((e) => e.rule === "required-fields")).toHaveLength(0);
  });

  it("name-format: lowercase name produces error", () => {
    const report = validate({ name: "button", category: "Test", description: "t", anatomy: { c: { element: "box", description: "t" } }, tokens: { c: {} }, accessibility: { element: "div", "focus-visible": false, keyboard: {}, aria: [] } } as CDFComponent);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "name-format" }));
  });

  it("enum-has-values: enum with less than 2 values produces error", () => {
    const comp = makeCDF({ properties: { size: { type: "enum", values: ["base"], default: "base", description: "t" } } });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "enum-has-values" }));
  });

  it("default-in-values: default not in values produces error", () => {
    const comp = makeCDF({ properties: { size: { type: "enum", values: ["base", "small"], default: "large", description: "t" } } });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "default-in-values" }));
  });

  // ── Profile-vocabulary shorthand (CDF Component §7.2) ───────────────────────
  // `type: <vocab-key>` is shorthand for `type: enum` + `values:
  // <vocab.values>`. Profile-aware validators MUST resolve these.

  it("property-type-valid: Profile-vocabulary shorthand is accepted when Profile loaded", () => {
    const comp = makeCDF({
      properties: {
        variant: { type: "variant", default: "primary", description: "t" } as import("../src/types/cdf.js").Property,
      },
    });
    const profile = {
      token_grammar: {},
      vocabularies: {
        variant: { description: "t", values: ["primary", "secondary", "tertiary"] },
      },
      interaction_patterns: {},
      categories: {},
    } as unknown as import("../src/types/profile.js").DSProfile;
    const report = validate(comp, { ds_profile: profile } as import("../src/types/cdf.js").CDFConfig);
    expect(report.errors.filter((e) => e.rule === "property-type-valid")).toEqual([]);
  });

  it("property-type-valid: unknown lowercase type is rejected with helpful message listing available vocabs", () => {
    const comp = makeCDF({
      properties: {
        variant: { type: "varriant", default: "primary", description: "t" } as import("../src/types/cdf.js").Property, // typo
      },
    });
    const profile = {
      token_grammar: {},
      vocabularies: {
        variant: { description: "t", values: ["primary", "secondary"] },
        size: { description: "t", values: ["base", "small"] },
      },
      interaction_patterns: {},
      categories: {},
    } as unknown as import("../src/types/profile.js").DSProfile;
    const report = validate(comp, { ds_profile: profile } as import("../src/types/cdf.js").CDFConfig);
    const typeError = report.errors.find((e) => e.rule === "property-type-valid");
    expect(typeError).toBeDefined();
    expect(typeError!.message).toContain("Available vocabularies: size, variant");
  });

  it("property-type-valid: lowercase type without Profile is rejected with hint", () => {
    const comp = makeCDF({
      properties: {
        variant: { type: "variant", default: "primary", description: "t" } as import("../src/types/cdf.js").Property,
      },
    });
    const report = validate(comp); // no profile loaded
    const typeError = report.errors.find((e) => e.rule === "property-type-valid");
    expect(typeError).toBeDefined();
    expect(typeError!.message).toContain("No Profile loaded");
  });

  it("default-in-values: vocab shorthand default is validated against vocab values", () => {
    const comp = makeCDF({
      properties: {
        variant: { type: "variant", default: "unknown-value", description: "t" } as import("../src/types/cdf.js").Property,
      },
    });
    const profile = {
      token_grammar: {},
      vocabularies: {
        variant: { description: "t", values: ["primary", "secondary"] },
      },
      interaction_patterns: {},
      categories: {},
    } as unknown as import("../src/types/profile.js").DSProfile;
    const report = validate(comp, { ds_profile: profile } as import("../src/types/cdf.js").CDFConfig);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        rule: "default-in-values",
        message: expect.stringContaining("primary, secondary"),
      })
    );
  });

  it("required-xor-default: property with neither produces error", () => {
    const comp = makeCDF({ properties: { label: { type: "string", description: "t" } } });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "required-xor-default" }));
  });

  it("required-xor-default: property with both produces error", () => {
    const comp = makeCDF({ properties: { label: { type: "string", required: true, default: "hi", description: "t" } } });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "required-xor-default" }));
  });

  it("mutual-exclusion-symmetric: one-sided exclusion produces error", () => {
    const comp = makeCDF({
      properties: {
        a: { type: "boolean", default: false, description: "t", mutual_exclusion: "b" },
        b: { type: "boolean", default: false, description: "t" },
      },
    });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "mutual-exclusion-symmetric" }));
  });

  it("anatomy-has-element-or-component: part with neither produces error", () => {
    const comp = makeCDF({ anatomy: { broken: { description: "t" } as any } });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "anatomy-has-element-or-component" }));
  });

  it("state-has-values: state with less than 2 values produces error", () => {
    const comp = makeCDF({ states: { loading: { values: ["true"], runtime: true, description: "t" } } });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "state-has-values" }));
  });

  it("token-placeholder-valid: unknown placeholder produces error (profile loaded)", () => {
    const comp = makeCDF({ tokens: { container: { bg: "color.{unknown}.fill" } } });
    // Profile-dependent rule only fires when a profile is present. Pass a
    // minimal stub so the check runs; `{unknown}` isn't a grammar slot there.
    const profile = {
      token_grammar: { color: { pattern: "color.{hierarchy}", axes: { hierarchy: {} } } },
      vocabularies: {},
      interaction_patterns: {},
      categories: {},
    } as unknown as import("../src/types/profile.js").DSProfile;
    const report = validate(comp, { ds_profile: profile } as import("../src/types/cdf.js").CDFConfig);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "token-placeholder-valid" }));
  });

  it("token-placeholder-valid: unknown placeholder is skipped without profile", () => {
    const comp = makeCDF({ tokens: { container: { bg: "color.{unknown}.fill" } } });
    const report = validate(comp);
    // No profile loaded → grammar-slot check is skipped; an info issue
    // flags the reduced coverage.
    expect(report.errors.filter((e) => e.rule === "token-placeholder-valid")).toEqual([]);
    expect(report.info).toContainEqual(expect.objectContaining({ rule: "profile-not-loaded" }));
  });

  it("derived-from-exists: unknown from produces error", () => {
    const comp = makeCDF({ derived: { iconSize: { from: "nonexistent", mapping: { a: "b" }, description: "t", consumed_by: ["container"] } } });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "derived-from-exists" }));
  });

  it("slot-accepts-valid: lowercase non-keyword produces error", () => {
    const comp = makeCDF({ slots: { content: { description: "t", accepts: "anything" } } });
    const report = validate(comp);
    expect(report.errors).toContainEqual(expect.objectContaining({ rule: "slot-accepts-valid" }));
  });

  it("slot-accepts-valid: 'text' and 'any' are valid", () => {
    const comp = makeCDF({ slots: { content: { description: "t", accepts: "text" }, other: { description: "t", accepts: "any" } } });
    const report = validate(comp);
    expect(report.errors.filter((e) => e.rule === "slot-accepts-valid")).toHaveLength(0);
  });
});

// ─── Validator rules: consistency (warnings) ────────────────────────────────

describe("consistency rules", () => {
  it("accessibility-element-mismatch: element=button but container is input", () => {
    const comp = makeCDF({
      anatomy: { container: { element: "input", description: "t" } },
      accessibility: { element: "button", "focus-visible": true, keyboard: { Enter: "activate" }, aria: [] },
    });
    const report = validate(comp);
    expect(report.warnings).toContainEqual(expect.objectContaining({ rule: "accessibility-element-mismatch" }));
  });

  it("orphan-derived: derived value not referenced anywhere", () => {
    const comp = makeCDF({
      derived: { orphan: { expression: "true", description: "t", consumed_by: [] } },
    });
    const report = validate(comp);
    expect(report.warnings).toContainEqual(expect.objectContaining({ rule: "orphan-derived" }));
  });

  it("events-for-non-interactive: events on non-interactive component", () => {
    const comp = makeCDF({
      events: { clicked: { type: "void", description: "t" } },
      states: undefined,
    });
    // Need to remove states explicitly
    delete (comp as any).states;
    const report = validate(comp);
    expect(report.warnings).toContainEqual(expect.objectContaining({ rule: "events-for-non-interactive" }));
  });

  // ── CDF-CON-008: no-raw-unitless-tokens ────────────────────────────────────
  it("no-raw-unitless-tokens: unquoted numeric opacity produces warning", () => {
    const comp = makeCDF({ tokens: { container: { opacity: 1 } } } as any);
    const report = validate(comp);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ rule: "no-raw-unitless-tokens", path: "tokens.container.opacity" })
    );
  });

  it("no-raw-unitless-tokens: quoted-string unitless number produces warning", () => {
    const comp = makeCDF({ tokens: { container: { opacity: "0.56" } } } as any);
    const report = validate(comp);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ rule: "no-raw-unitless-tokens", path: "tokens.container.opacity" })
    );
  });

  it("no-raw-unitless-tokens: dimensional-with-unit does not warn", () => {
    const comp = makeCDF({ tokens: { container: { "min-width": "80px", height: "2em" } } } as any);
    const report = validate(comp);
    expect(report.warnings.filter((w) => w.rule === "no-raw-unitless-tokens")).toHaveLength(0);
  });

  it("no-raw-unitless-tokens: token paths and documented literals do not warn", () => {
    const comp = makeCDF({
      tokens: {
        container: {
          background: "color.controls.primary.background.enabled",
          border: "none",
          color: "inherit",
          stroke: "currentColor",
        },
      },
    } as any);
    const report = validate(comp);
    expect(report.warnings.filter((w) => w.rule === "no-raw-unitless-tokens")).toHaveLength(0);
  });

  it("no-raw-unitless-tokens: unitless leaf in a value-map produces warning", () => {
    const comp = makeCDF({
      tokens: { container: { "line-height": { base: 1.5, small: "1.2" } } },
    } as any);
    const report = validate(comp);
    const hits = report.warnings.filter((w) => w.rule === "no-raw-unitless-tokens");
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.path).sort()).toEqual([
      "tokens.container.line-height.base",
      "tokens.container.line-height.small",
    ]);
  });
});

// ─── Convention rules (info, requires config) ───────────────────────────────

describe("convention rules", () => {
  const config: CDFConfig = {
    spec_directories: [],
    token_sources: [],
    profile: {
      prefix: "ft",
      token_pattern_interactive: "color.controls.{hierarchy}.{element}.{state}",
      theme_axes: { semantic: ["Light", "Dark"], device: ["Desktop", "Tablet", "Mobile"] },
    },
  };

  it("category-known: custom category produces info", () => {
    const comp = makeCDF({ category: "CustomCategory" });
    const report = validate(comp, config);
    expect(report.info).toContainEqual(expect.objectContaining({ rule: "category-known" }));
  });

  it("theme-axes-match: unknown axis produces info", () => {
    const comp = makeCDF({ theme_axes: { brand: { values: ["A", "B"], data_attribute: "data-brand", affects: "*" } } });
    const report = validate(comp, config);
    expect(report.info).toContainEqual(expect.objectContaining({ rule: "theme-axes-match" }));
  });

  it("no convention issues without config", () => {
    const comp = makeCDF({ category: "CustomCategory" });
    const report = validate(comp);
    expect(report.info.filter((i) => i.rule === "category-known")).toHaveLength(0);
  });
});

// ─── Real spec files: parsing and feature tests ─────────────────────────────

describe("Button spec", () => {
  const button = parseCDFFile(resolve(specsDir, "actions/button.spec.yaml"));

  it("should parse name and category", () => {
    expect(button.name).toBe("Button");
    expect(button.category).toBe("Actions");
  });

  it("should have 6 properties", () => {
    expect(Object.keys(button.properties!)).toHaveLength(6);
  });

  it("should have symmetric mutual exclusion", () => {
    expect(button.properties!.iconLeft.mutual_exclusion).toBe("iconRight");
    expect(button.properties!.iconRight.mutual_exclusion).toBe("iconLeft");
  });

  it("should expand token paths", () => {
    const paths = expandTokenPath(
      "color.controls.{hierarchy}.background.{interaction}",
      button.properties!,
      button.states!
    );
    expect(paths).toHaveLength(16);
    expect(paths).toContain("color.controls.brand.background.enabled");
    expect(paths).toContain("color.controls.tertiary.background.disabled");
  });
});

describe("IconButton inheritance", () => {
  const button = parseCDFFile(resolve(specsDir, "actions/button.spec.yaml"));
  const iconButton = parseCDFFile(resolve(specsDir, "actions/iconbutton.spec.yaml"));

  it("should declare inherits", () => {
    expect(iconButton.inherits).toBe("button.spec.yaml");
  });

  it("should resolve inheritance correctly", () => {
    const resolved = resolveInheritance(iconButton, button);

    expect(resolved.name).toBe("IconButton");
    expect(resolved.properties!.iconLeft).toBeUndefined();
    expect(resolved.properties!.iconRight).toBeUndefined();
    expect(resolved.properties!.noPadding).toBeUndefined();
    expect(resolved.properties!.name).toBeDefined();
    expect(resolved.properties!.hierarchy).toBeDefined();
    expect(resolved.anatomy.label).toBeUndefined();
    expect(resolved.anatomy.icon.conditional).toBeUndefined();
    expect(resolved.tokens.container.width).toBe("controls.height.{size}");
    expect(resolved.tokens.container["padding-inline"]).toBeUndefined();
    expect(resolved.tokens.label).toBeUndefined();
  });
});

describe("Divider spec (minimal)", () => {
  const divider = parseCDFFile(resolve(specsDir, "layout/divider.spec.yaml"));

  it("should have no states", () => {
    expect(divider.states).toBeUndefined();
  });

  it("should have single anatomy part", () => {
    expect(Object.keys(divider.anatomy)).toHaveLength(1);
    expect(divider.anatomy.line.element).toBe("box");
  });
});

// ─── Existing specs: expected validation results ────────────────────────────

describe("existing specs validation (specs are older than CDF v0.2.1)", () => {
  it("should find all spec files", () => {
    const reports = validateAll([specsDir]);
    expect(reports.length).toBeGreaterThanOrEqual(11);
  });

  it("should report the actual state of existing specs (not all pass)", () => {
    const reports = validateAll([specsDir]);
    const totalErrors = reports.reduce((acc, r) => acc + r.errors.length, 0);
    const totalWarnings = reports.reduce((acc, r) => acc + r.warnings.length, 0);

    // Log for visibility — these are known gaps in the older specs
    const allErrors = reports.flatMap((r) =>
      r.errors.map((e) => `${r.file.split("/").pop()}: [${e.rule}] ${e.path}: ${e.message}`)
    );
    const allWarnings = reports.flatMap((r) =>
      r.warnings.map((w) => `${r.file.split("/").pop()}: [${w.rule}] ${w.path}: ${w.message}`)
    );

    console.log(`\n── Existing spec validation summary ──`);
    console.log(`Errors: ${totalErrors} across ${reports.filter((r) => !r.valid).length} specs`);
    console.log(`Warnings: ${totalWarnings}`);
    if (allErrors.length > 0) {
      console.log(`\nErrors:\n${allErrors.join("\n")}`);
    }
    if (allWarnings.length > 0) {
      console.log(`\nWarnings:\n${allWarnings.join("\n")}`);
    }

    // This test documents the current state — it doesn't assert pass/fail.
    // When specs are updated to CDF v0.2.1, totalErrors should become 0.
    expect(reports.length).toBeGreaterThanOrEqual(11);
  });
});

// ─── Suggest: completeness gaps in existing specs ───────────────────────────

describe("suggest improvements on existing specs", () => {
  it("should find completeness gaps in Button", () => {
    const button = parseCDFFile(resolve(specsDir, "actions/button.spec.yaml"));
    const suggestions = suggestImprovements(button);

    // Button has no events section (uses native click)
    const eventsSuggestion = suggestions.find((s) => s.area === "events");
    expect(eventsSuggestion).toBeDefined();

    // Button has no css_architecture
    const cssSuggestion = suggestions.find((s) => s.area === "css");
    expect(cssSuggestion).toBeDefined();

    console.log(`\n── Button suggestions (${suggestions.length}) ──`);
    for (const s of suggestions) {
      console.log(`  [${s.priority}] ${s.area}: ${s.message}`);
    }
  });

  it("should find gaps across all specs", () => {
    const specFiles = [
      "primitives/icon.spec.yaml",
      "primitives/loadingspinner.spec.yaml",
      "actions/button.spec.yaml",
      "inputs/textfield.spec.yaml",
      "inputs/tag.spec.yaml",
      "status/statuschip.spec.yaml",
      "layout/divider.spec.yaml",
    ];

    console.log(`\n── Suggestions per spec ──`);
    for (const file of specFiles) {
      const comp = parseCDFFile(resolve(specsDir, file));
      const suggestions = suggestImprovements(comp);
      const high = suggestions.filter((s) => s.priority === "high").length;
      const medium = suggestions.filter((s) => s.priority === "medium").length;
      const low = suggestions.filter((s) => s.priority === "low").length;
      console.log(`  ${comp.name}: ${suggestions.length} suggestions (${high} high, ${medium} medium, ${low} low)`);
    }

    // Just verify it runs without errors
    expect(true).toBe(true);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCDF(overrides: Partial<CDFComponent>): CDFComponent {
  return {
    name: "TestComponent",
    category: "Actions",
    description: "Test component.",
    anatomy: { container: { element: "box", description: "Container." } },
    tokens: { container: {} },
    accessibility: { element: "div", "focus-visible": false, keyboard: {}, aria: [] },
    ...overrides,
  };
}
