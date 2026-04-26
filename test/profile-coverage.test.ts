import { describe, it, expect } from "vitest";
import { analyzeProfileCoverage } from "../src/analyzer/profile-coverage.js";
import { parseProfileFile } from "../src/parser/profile-parser.js";
import type { CDFComponent } from "../src/index.js";
import { join } from "node:path";

const FIXTURES = join(__dirname, "fixtures/profiles");

function makeComponent(name: string, tokenMapping: Record<string, string>): CDFComponent {
  return {
    name,
    category: "Primitives",
    properties: {},
    states: {},
    anatomy: { root: {} },
    events: {},
    tokens: { token_mapping: tokenMapping },
  } as unknown as CDFComponent;
}

describe("analyzeProfileCoverage — vocab-orphan (profile-internal)", () => {
  it("flags vocab values that are not explicitly referenced", () => {
    const profilePath = join(FIXTURES, "with-orphans.profile.yaml");
    const profile = parseProfileFile(profilePath);
    const result = analyzeProfileCoverage({ profile, profilePath, components: [] });
    const tertiaryOrphan = result.orphans.find(
      (o) => o.path === "vocabularies.hierarchy.tertiary"
    );
    expect(tertiaryOrphan).toBeDefined();
    expect(tertiaryOrphan!.type).toBe("vocab-orphan");
    expect(tertiaryOrphan!.scope).toBe("profile-internal");
  });

  it("does NOT flag vocab values referenced via theming.modifiers.contexts", () => {
    const profilePath = join(FIXTURES, "with-orphans.profile.yaml");
    const profile = parseProfileFile(profilePath);
    const result = analyzeProfileCoverage({ profile, profilePath, components: [] });
    const infoOrphan = result.orphans.find((o) => o.path.endsWith("intent.info"));
    expect(infoOrphan).toBeUndefined();
  });

  it("does NOT treat grammar-template placeholders as explicit references (strict)", () => {
    // hierarchy.primary and .secondary appear only in grammar pattern `color.{hierarchy}`.
    // Per strict definition, placeholder expansion does NOT count.
    // But here they ARE listed as .values — placeholder-only is tested via synthetic fixture.
    // This test just confirms the infrastructure flags tertiary (the unreferenced one).
    const profilePath = join(FIXTURES, "with-orphans.profile.yaml");
    const profile = parseProfileFile(profilePath);
    const result = analyzeProfileCoverage({ profile, profilePath, components: [] });
    expect(result.orphans.some((o) => o.path === "vocabularies.hierarchy.tertiary")).toBe(true);
  });
});

describe("analyzeProfileCoverage — grammar-orphan (cross-layer)", () => {
  it("flags grammar whose expansion is not consumed by any component", () => {
    const profilePath = join(FIXTURES, "with-orphans.profile.yaml");
    const profile = parseProfileFile(profilePath);
    const components = [makeComponent("ButtonX", {})]; // no bindings at all
    const result = analyzeProfileCoverage({ profile, profilePath, components });
    const grammarOrphan = result.orphans.find((o) => o.type === "grammar-orphan");
    expect(grammarOrphan).toBeDefined();
    expect(grammarOrphan!.path).toBe("token_grammar.g1");
  });

  it("does NOT flag grammar consumed by at least one component token_mapping", () => {
    const profilePath = join(FIXTURES, "with-orphans.profile.yaml");
    const profile = parseProfileFile(profilePath);
    const components = [
      makeComponent("ButtonY", { "root.color": "color.primary" }),
    ];
    const result = analyzeProfileCoverage({ profile, profilePath, components });
    const grammarOrphan = result.orphans.find((o) => o.path === "token_grammar.g1");
    expect(grammarOrphan).toBeUndefined();
  });

  it("runs grammar-orphan check when components are provided", () => {
    const profilePath = join(FIXTURES, "with-orphans.profile.yaml");
    const profile = parseProfileFile(profilePath);
    const result = analyzeProfileCoverage({
      profile,
      profilePath,
      components: [makeComponent("X", {})],
    });
    expect(result.checks_run).toContain("grammar-orphan");
    expect(result.checks_skipped.some((s) => s.check === "grammar-orphan")).toBe(false);
  });
});

function makeComponentWithPattern(name: string, patternName: string): CDFComponent {
  return {
    name,
    category: "Actions",
    properties: {},
    states: {
      enabled: { interaction_pattern: patternName } as unknown,
      hover:   { interaction_pattern: patternName } as unknown,
    },
    anatomy: { root: {} },
    events: {},
    tokens: { token_mapping: {} },
  } as unknown as CDFComponent;
}

describe("analyzeProfileCoverage — pattern-orphan (cross-layer)", () => {
  it("flags pattern declared but not referenced by any component state", () => {
    const profilePath = join(FIXTURES, "with-orphans.profile.yaml");
    const profile = parseProfileFile(profilePath);
    const components = [makeComponentWithPattern("ButtonZ", "used_pattern")];
    const result = analyzeProfileCoverage({ profile, profilePath, components });
    const orphan = result.orphans.find(
      (o) => o.type === "pattern-orphan" && o.path === "interaction_patterns.orphan_pattern"
    );
    expect(orphan).toBeDefined();
  });

  it("does NOT flag pattern referenced by at least one component state", () => {
    const profilePath = join(FIXTURES, "with-orphans.profile.yaml");
    const profile = parseProfileFile(profilePath);
    const components = [makeComponentWithPattern("ButtonZ", "used_pattern")];
    const result = analyzeProfileCoverage({ profile, profilePath, components });
    const notOrphan = result.orphans.find(
      (o) => o.path === "interaction_patterns.used_pattern"
    );
    expect(notOrphan).toBeUndefined();
  });
});
