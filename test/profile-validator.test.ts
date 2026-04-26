import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateProfile, validateProfileFile } from "../src/validator/profile/index.js";

// ── Fixtures ───────────────────────────────────────────────────────────────

const MINIMAL_VALID = `
name: TestSystem
version: "1.0.0"
cdf_version: ">=1.0.0"
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

theming:
  modifiers:
    semantic:
      description: "Color mood"
      contexts: [Light, Dark]
      required: true
  set_mapping:
    "Semantic/Light": { modifier: semantic, context: Light }
    "Semantic/Dark": { modifier: semantic, context: Dark }

naming:
  css_prefix: "ts-"
  token_prefix: "--ts-"
  methodology: BEM
  pattern: "block__element--modifier"
  casing: { components: PascalCase }
  reserved_names: {}
`;

const EXTENDS_CHILD = `
name: ChildSystem
version: "1.0.0"
extends: ../parent.profile.yaml

theming:
  modifiers:
    brand:
      description: "DS-specific brand variant"
      contexts: [Default, Negative]
  set_mapping:
    "Brand/Default": { modifier: brand, context: Default }
`;

// ── L0: parse ──────────────────────────────────────────────────────────────

describe("Profile Validator — L0 (parse)", () => {
  it("rejects malformed YAML", () => {
    const r = validateProfile("name: foo\n  bad:\n   yaml: : :");
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.rule === "profile-parseable")).toBe(true);
  });

  it("rejects array root", () => {
    const r = validateProfile("- foo\n- bar\n");
    expect(r.valid).toBe(false);
    expect(r.errors[0].rule).toBe("profile-parseable");
  });

  it("rejects scalar root", () => {
    const r = validateProfile('"just a string"');
    expect(r.valid).toBe(false);
    expect(r.errors[0].rule).toBe("profile-parseable");
  });

  it("accepts minimal valid profile", () => {
    const r = validateProfile(MINIMAL_VALID);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

// ── L1: required fields (extends-aware) ────────────────────────────────────

describe("Profile Validator — L1 (required fields)", () => {
  it("flags missing name on standalone profile", () => {
    const r = validateProfile(`version: "1.0.0"\n`);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "name" && e.rule === "profile-required-fields")).toBe(true);
  });

  it("requires only name + version on extends-child", () => {
    const r = validateProfile(EXTENDS_CHILD);
    // name + version present; theming present — child is fine without
    // vocabularies / token_grammar / naming.
    const required = r.errors.filter((e) => e.rule === "profile-required-fields");
    expect(required).toHaveLength(0);
  });

  it("flags extends-child still missing name", () => {
    const r = validateProfile(`extends: ../parent.yaml\nversion: "1.0.0"\n`);
    expect(r.errors.some((e) => e.path === "name")).toBe(true);
  });

  it("requires all six core fields on standalone", () => {
    const r = validateProfile(`name: X\nversion: "1.0.0"\n`);
    const missing = r.errors
      .filter((e) => e.rule === "profile-required-fields")
      .map((e) => e.path);
    expect(missing).toEqual(
      expect.arrayContaining(["vocabularies", "token_grammar", "theming", "naming"]),
    );
  });
});

// ── L2: field types ────────────────────────────────────────────────────────

describe("Profile Validator — L2 (field types)", () => {
  it("flags non-string name", () => {
    const r = validateProfile(`name: 42\nversion: "1.0.0"\n`);
    expect(r.errors.some((e) => e.path === "name" && e.rule === "profile-field-type")).toBe(true);
  });

  it("flags vocabulary values that aren't an array", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies:
  hierarchy:
    description: x
    values: "not an array"
token_grammar: {}
theming: { modifiers: {}, set_mapping: {} }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(
      r.errors.some(
        (e) => e.path === "vocabularies.hierarchy.values" && e.rule === "profile-field-type",
      ),
    ).toBe(true);
  });

  it("flags non-string vocabulary value entries", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies:
  hierarchy:
    description: x
    values: [brand, 42, secondary]
token_grammar: {}
theming: { modifiers: {}, set_mapping: {} }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(
      r.errors.some((e) => e.path === "vocabularies.hierarchy.values[1]"),
    ).toBe(true);
  });

  it("flags token_grammar entries missing pattern", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies: {}
token_grammar:
  broken:
    dtcg_type: color
    description: x
theming: { modifiers: {}, set_mapping: {} }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(
      r.errors.some((e) => e.path === "token_grammar.broken.pattern"),
    ).toBe(true);
  });
});

// ── L2 (standalone_tokens shape) ──────────────────────────────────────────
// Per CDF-PROFILE-SPEC §6.11.1: standalone_tokens is a map keyed by leaf
// path; each entry has REQUIRED `dtcg_type` (non-empty string) +
// `description` (non-empty string), with optional `values` / `layer`.
// Pre-N3 the validator accepted any shape; the Phase-7 template even
// sanctioned a flat-list alternative. Post-N3 the shape is enforced
// structurally so the LLM can't fall back to the cheaper variant.

describe("Profile Validator — L2 (standalone_tokens shape, §6.11.1)", () => {
  const PRELUDE = `
name: X
version: "1.0.0"
vocabularies:
  hierarchy: { description: x, values: [a] }
token_grammar:
  g1:
    pattern: "g1.{hierarchy}"
    dtcg_type: color
    description: x
    axes:
      hierarchy: { vocabulary: hierarchy }
theming: { modifiers: {}, set_mapping: {} }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`;

  it("accepts valid map shape with required fields", () => {
    const r = validateProfile(`${PRELUDE}
standalone_tokens:
  color.page:
    dtcg_type: color
    description: "Page background"
  focus.outer:
    dtcg_type: color
    description: "Outer focus ring"
    values: [primary, secondary]
    layer: Components
`);
    const shapeIssues = [...r.errors, ...r.warnings].filter(
      (i) => i.rule === "profile-standalone-shape",
    );
    expect(shapeIssues).toHaveLength(0);
  });

  it("accepts empty map (vacuous OK)", () => {
    const r = validateProfile(`${PRELUDE}
standalone_tokens: {}
`);
    expect(
      r.errors.filter((e) => e.rule === "profile-standalone-shape"),
    ).toHaveLength(0);
  });

  it("rejects flat-list shape with a clear §6.11.1 pointer", () => {
    const r = validateProfile(`${PRELUDE}
standalone_tokens:
  - color.page
  - color.backdrop
  - shadow.elevation.*
`);
    const e = r.errors.find((e) => e.rule === "profile-standalone-shape");
    expect(e).toBeDefined();
    expect(e?.path).toBe("standalone_tokens");
    expect(e?.message).toMatch(/map|object/i);
    expect(e?.message).toContain("§6.11.1");
  });

  it("rejects entry missing dtcg_type", () => {
    const r = validateProfile(`${PRELUDE}
standalone_tokens:
  color.page:
    description: "Page background"
`);
    expect(
      r.errors.some(
        (e) =>
          e.rule === "profile-standalone-shape" &&
          e.path === "standalone_tokens.color.page.dtcg_type",
      ),
    ).toBe(true);
  });

  it("rejects entry with empty-string dtcg_type", () => {
    const r = validateProfile(`${PRELUDE}
standalone_tokens:
  color.page:
    dtcg_type: ""
    description: "Page background"
`);
    expect(
      r.errors.some(
        (e) =>
          e.rule === "profile-standalone-shape" &&
          e.path === "standalone_tokens.color.page.dtcg_type",
      ),
    ).toBe(true);
  });

  it("rejects entry missing description", () => {
    const r = validateProfile(`${PRELUDE}
standalone_tokens:
  color.page:
    dtcg_type: color
`);
    expect(
      r.errors.some(
        (e) =>
          e.rule === "profile-standalone-shape" &&
          e.path === "standalone_tokens.color.page.description",
      ),
    ).toBe(true);
  });

  it("rejects entry with empty-string description", () => {
    const r = validateProfile(`${PRELUDE}
standalone_tokens:
  color.page:
    dtcg_type: color
    description: ""
`);
    expect(
      r.errors.some(
        (e) =>
          e.rule === "profile-standalone-shape" &&
          e.path === "standalone_tokens.color.page.description",
      ),
    ).toBe(true);
  });

  it("rejects non-object entry (e.g. scalar value)", () => {
    const r = validateProfile(`${PRELUDE}
standalone_tokens:
  color.page: "just-a-path"
`);
    expect(
      r.errors.some(
        (e) =>
          e.rule === "profile-standalone-shape" &&
          e.path === "standalone_tokens.color.page",
      ),
    ).toBe(true);
  });
});

// ── L3: schema baking ──────────────────────────────────────────────────────

describe("Profile Validator — L3 (schema baking)", () => {
  it("warns on unknown top-level field", () => {
    const r = validateProfile(MINIMAL_VALID + "\nfoo_bar: { x: 1 }\n");
    expect(r.warnings.some((w) => w.path === "foo_bar" && w.rule === "profile-unknown-field")).toBe(
      true,
    );
  });

  it("suggests close matches (theme → theming)", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies: {}
token_grammar: {}
theme: {}
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    const w = r.warnings.find((w) => w.path === "theme");
    expect(w?.message).toContain("Did you mean 'theming'");
  });
});

// ── L4: cross-field structural ─────────────────────────────────────────────

describe("Profile Validator — L4 (cross-field)", () => {
  it("warns when interaction pattern references unknown token_layer", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies:
  hierarchy: { description: x, values: [a] }
token_grammar:
  g1: { pattern: x, dtcg_type: color, description: x }
token_layers:
  - { name: Foundation, description: x, grammars: [] }
interaction_patterns:
  pressable:
    description: x
    states: [enabled]
    token_layer: NonExistent
theming: { modifiers: {}, set_mapping: {} }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(
      r.warnings.some(
        (w) =>
          w.path === "interaction_patterns.pressable.token_layer" &&
          w.rule === "profile-token-layer-ref",
      ),
    ).toBe(true);
  });
});

// ── L5: vocabulary isolation ───────────────────────────────────────────────

describe("Profile Validator — L5 (vocab isolation)", () => {
  it("warns when standalone axis value collides with vocabulary value", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies:
  hierarchy: { description: x, values: [brand, primary] }
token_grammar:
  g1:
    pattern: x
    dtcg_type: color
    description: x
    axes:
      misnamed:
        values: [brand, secondary]   # 'brand' belongs to hierarchy
theming: { modifiers: {}, set_mapping: {} }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    const w = r.warnings.find((w) => w.rule === "profile-vocab-isolation");
    expect(w).toBeDefined();
    expect(w?.message).toContain("'brand'");
    expect(w?.message).toContain("hierarchy");
  });

  it("flags axis vocabulary reference to non-existent vocabulary", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies:
  hierarchy: { description: x, values: [brand] }
token_grammar:
  g1:
    pattern: x
    dtcg_type: color
    description: x
    axes:
      h: { vocabulary: not_declared }
theming: { modifiers: {}, set_mapping: {} }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(
      r.errors.some(
        (e) => e.path === "token_grammar.g1.axes.h.vocabulary" && e.rule === "profile-vocab-ref",
      ),
    ).toBe(true);
  });
});

// ── L6: extends resolution ─────────────────────────────────────────────────

describe("Profile Validator — L6 (extends)", () => {
  it("errors when extends target file missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-validator-"));
    const childPath = join(tmp, "child.profile.yaml");
    writeFileSync(childPath, EXTENDS_CHILD);
    const r = validateProfileFile(childPath);
    expect(r.errors.some((e) => e.rule === "profile-extends-target")).toBe(true);
  });

  it("accepts when extends target exists and parses", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-validator-"));
    writeFileSync(join(tmp, "parent.profile.yaml"), MINIMAL_VALID);
    mkdirSync(join(tmp, "sub"));
    writeFileSync(join(tmp, "sub", "child.profile.yaml"), EXTENDS_CHILD);
    const r = validateProfileFile(join(tmp, "sub", "child.profile.yaml"));
    expect(r.errors.filter((e) => e.rule.startsWith("profile-extends"))).toHaveLength(0);
  });

  it("rejects parent that itself extends (cycle prevention v1.0.0)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-validator-"));
    writeFileSync(join(tmp, "grandparent.profile.yaml"), MINIMAL_VALID);
    writeFileSync(
      join(tmp, "parent.profile.yaml"),
      `name: P\nversion: "1.0.0"\nextends: ./grandparent.profile.yaml\n`,
    );
    mkdirSync(join(tmp, "sub"));
    writeFileSync(join(tmp, "sub", "child.profile.yaml"), EXTENDS_CHILD);
    const r = validateProfileFile(join(tmp, "sub", "child.profile.yaml"));
    expect(r.errors.some((e) => e.rule === "profile-extends-cycle")).toBe(true);
  });

  it("errors when parent file is malformed YAML", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-validator-"));
    writeFileSync(join(tmp, "parent.profile.yaml"), "not: : valid: : yaml\n  - garbage");
    mkdirSync(join(tmp, "sub"));
    writeFileSync(join(tmp, "sub", "child.profile.yaml"), EXTENDS_CHILD);
    const r = validateProfileFile(join(tmp, "sub", "child.profile.yaml"));
    expect(r.errors.some((e) => e.rule === "profile-extends-parseable")).toBe(true);
  });
});

// ── L7: set_mapping globs ──────────────────────────────────────────────────

describe("Profile Validator — L7 (set_mapping globs)", () => {
  it("accepts trailing-* glob", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies: {}
token_grammar: {}
theming:
  modifiers: {}
  set_mapping:
    "Components/*": { always_enabled: true }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(r.errors.filter((e) => e.rule === "profile-set-mapping-glob")).toHaveLength(0);
  });

  it("rejects mid-key wildcard", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies: {}
token_grammar: {}
theming:
  modifiers: {}
  set_mapping:
    "Comp*onents": { always_enabled: true }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(r.errors.some((e) => e.rule === "profile-set-mapping-glob")).toBe(true);
  });

  it("rejects multi-wildcard", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies: {}
token_grammar: {}
theming:
  modifiers: {}
  set_mapping:
    "*/Foo/*": { always_enabled: true }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(r.errors.some((e) => e.rule === "profile-set-mapping-glob")).toBe(true);
  });

  it("warns on bare * (matches everything)", () => {
    const r = validateProfile(`
name: X
version: "1.0.0"
vocabularies: {}
token_grammar: {}
theming:
  modifiers: {}
  set_mapping:
    "*": { always_enabled: true }
naming: { css_prefix: x, token_prefix: x, methodology: BEM, pattern: x, casing: {}, reserved_names: {} }
`);
    expect(r.warnings.some((w) => w.rule === "profile-set-mapping-glob")).toBe(true);
  });
});

// ── L8: opt-in token reference resolution ──────────────────────────────────

describe("Profile Validator — L8 (opt-in token refs)", () => {
  it("is off by default — never emits L8 issues", () => {
    const r = validateProfile(MINIMAL_VALID);
    const l8 = r.warnings.filter((w) => w.rule.startsWith("profile-l8") || w.rule === "profile-token-ref-unresolved");
    expect(l8).toHaveLength(0);
    expect(r.info[0].message).toContain("L0-L7");
  });

  it("emits depth-info L0-L8 when resolveTokens: true", () => {
    const r = validateProfile(MINIMAL_VALID, { resolveTokens: true });
    expect(r.info[0].message).toContain("L0-L8");
  });

  it("warns and skips when token_sources is missing", () => {
    const r = validateProfile(MINIMAL_VALID, { resolveTokens: true });
    expect(r.warnings.some((w) => w.rule === "profile-l8-skipped")).toBe(true);
  });

  it("resolves token reference that exists in token tree", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-validator-"));
    const tokensDir = join(tmp, "tokens");
    mkdirSync(tokensDir);
    writeFileSync(
      join(tokensDir, "controls.json"),
      JSON.stringify({
        color: { controls: { primary: { background: { default: { $value: "#fff", $type: "color" } } } } },
      }),
    );
    const profileWithSources = `${MINIMAL_VALID}
token_sources:
  directory: ./tokens
  format: dtcg
  sets:
    controls: controls.json

interaction_patterns:
  pressable:
    description: x
    states: [enabled]
    token_mapping:
      enabled: color.controls.primary.background.default
`;
    writeFileSync(join(tmp, "p.profile.yaml"), profileWithSources);
    const r = validateProfileFile(join(tmp, "p.profile.yaml"), { resolveTokens: true });
    const unresolved = r.warnings.filter((w) => w.rule === "profile-token-ref-unresolved");
    expect(unresolved).toHaveLength(0);
  });

  it("warns on token reference that doesn't resolve", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-validator-"));
    const tokensDir = join(tmp, "tokens");
    mkdirSync(tokensDir);
    writeFileSync(
      join(tokensDir, "controls.json"),
      JSON.stringify({ color: { other: { thing: { $value: "#fff", $type: "color" } } } }),
    );
    const profileWithSources = `${MINIMAL_VALID}
token_sources:
  directory: ./tokens
  format: dtcg
  sets:
    controls: controls.json

interaction_patterns:
  pressable:
    description: x
    states: [enabled]
    token_mapping:
      enabled: color.controls.primary.background.default
`;
    writeFileSync(join(tmp, "p.profile.yaml"), profileWithSources);
    const r = validateProfileFile(join(tmp, "p.profile.yaml"), { resolveTokens: true });
    expect(
      r.warnings.some(
        (w) =>
          w.rule === "profile-token-ref-unresolved" &&
          w.path === "interaction_patterns.pressable.token_mapping.enabled",
      ),
    ).toBe(true);
  });

  it("skips template-placeholder refs ({hierarchy} etc.)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-validator-"));
    const tokensDir = join(tmp, "tokens");
    mkdirSync(tokensDir);
    writeFileSync(join(tokensDir, "controls.json"), JSON.stringify({}));
    const profileWithSources = `${MINIMAL_VALID}
token_sources:
  directory: ./tokens
  format: dtcg
  sets:
    controls: controls.json

interaction_patterns:
  pressable:
    description: x
    states: [enabled]
    token_mapping:
      enabled: "color.controls.{hierarchy}.background.default"
`;
    writeFileSync(join(tmp, "p.profile.yaml"), profileWithSources);
    const r = validateProfileFile(join(tmp, "p.profile.yaml"), { resolveTokens: true });
    expect(r.warnings.filter((w) => w.rule === "profile-token-ref-unresolved")).toHaveLength(0);
  });
});

// ── Integration: ValidationReport shape ────────────────────────────────────

describe("Profile Validator — report shape", () => {
  it("returns ValidationReport with summary + valid flag", () => {
    const r = validateProfile(MINIMAL_VALID);
    expect(r).toMatchObject({
      file: "<inline>",
      valid: true,
      summary: { errors: 0, warnings: 0 },
    });
    // info always contains depth marker
    expect(r.info.length).toBeGreaterThan(0);
    expect(r.info[0].rule).toBe("profile-validation-depth");
  });

  it("never throws on garbage input", () => {
    expect(() => validateProfile("\u0000\u0001\u0002")).not.toThrow();
    expect(() => validateProfile("")).not.toThrow();
    expect(() => validateProfile("[1, 2, 3]")).not.toThrow();
  });

  it("validateProfileFile reports unreadable paths cleanly", () => {
    const r = validateProfileFile("/nonexistent/path/profile.yaml");
    expect(r.valid).toBe(false);
    expect(r.errors[0].rule).toBe("profile-file-readable");
  });
});
