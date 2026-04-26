import { describe, it, expect } from "vitest";
import { resolveExtends } from "../src/resolver/extends-resolver.js";
import { join } from "node:path";

const FIXTURES = join(__dirname, "fixtures/profiles");

describe("resolveExtends — basic merge", () => {
  it("returns profile as-is when extends is not set", () => {
    const result = resolveExtends(join(FIXTURES, "standalone.profile.yaml"));
    expect(result.extends_chain).toHaveLength(1);
    expect(result.extends_chain[0]).toContain("standalone.profile.yaml");
    expect(result.merged.name).toBe("Standalone");
  });

  it("merges 1-level extends with child additions propagating to merged", () => {
    const result = resolveExtends(join(FIXTURES, "child.profile.yaml"));
    expect(result.extends_chain).toHaveLength(2);
    expect(result.merged.vocabularies.hierarchy.values).toEqual([
      "primary", "secondary", "tertiary"
    ]);
    expect(result.merged.vocabularies.intent.values).toEqual(["info", "warn"]);
  });

  it("child overrides parent fields per REPLACE merge semantics (§15.1)", () => {
    const result = resolveExtends(join(FIXTURES, "child.profile.yaml"));
    expect(result.merged.naming.css_prefix).toBe("ch-");
    expect(result.merged.naming.token_prefix).toBe("--ch-");
  });

  it("inherits parent fields when child does not declare them", () => {
    const result = resolveExtends(join(FIXTURES, "child.profile.yaml"));
    expect(result.merged.token_grammar.g1).toBeDefined();
    expect(result.merged.theming).toBeDefined();
  });
});

describe("resolveExtends — provenance", () => {
  it("records action:added for fields the child introduces", () => {
    const result = resolveExtends(join(FIXTURES, "child.profile.yaml"));
    expect(result.provenance["vocabularies.intent"]).toBeDefined();
    expect(result.provenance["vocabularies.intent"].action).toBe("added");
    expect(result.provenance["vocabularies.intent"].source).toContain("child.profile.yaml");
  });

  it("records action:overridden with parent_value and own_value", () => {
    const result = resolveExtends(join(FIXTURES, "child.profile.yaml"));
    const entry = result.provenance["vocabularies.hierarchy"];
    expect(entry).toBeDefined();
    expect(entry.action).toBe("overridden");
    expect(entry.parent_source).toContain("parent.profile.yaml");
    expect((entry.parent_value as { values: string[] }).values).toEqual(["primary", "secondary"]);
    expect((entry.own_value as { values: string[] }).values).toEqual(["primary", "secondary", "tertiary"]);
  });

  it("does NOT include inherited-unchanged fields in provenance (non-baseline only)", () => {
    const result = resolveExtends(join(FIXTURES, "child.profile.yaml"));
    expect(result.provenance["token_grammar.g1"]).toBeUndefined();
    expect(result.provenance["theming"]).toBeUndefined();
  });

  it("returns empty provenance for a profile without extends", () => {
    const result = resolveExtends(join(FIXTURES, "standalone.profile.yaml"));
    expect(result.provenance).toEqual({});
  });
});

describe("resolveExtends — chain semantics", () => {
  it("handles 2-level extends chain (grandchild → child → parent)", () => {
    const result = resolveExtends(join(FIXTURES, "grandchild.profile.yaml"));
    expect(result.extends_chain).toHaveLength(3);
    expect(result.extends_chain[0]).toContain("parent.profile.yaml");
    expect(result.extends_chain[1]).toContain("child.profile.yaml");
    expect(result.extends_chain[2]).toContain("grandchild.profile.yaml");

    // Grandchild adds size:
    expect(result.merged.vocabularies.size.values).toEqual(["sm", "md", "lg"]);
    // Intent was added by child (inherited here):
    expect(result.merged.vocabularies.intent.values).toEqual(["info", "warn"]);
    // Hierarchy is child's override (inherited here):
    expect(result.merged.vocabularies.hierarchy.values).toEqual(["primary", "secondary", "tertiary"]);
  });

  it("throws on circular extends", () => {
    expect(() =>
      resolveExtends(join(FIXTURES, "circular-a.profile.yaml"))
    ).toThrow(/Circular extends detected/);
  });
});
