import { describe, it, expect } from "vitest";
import { diffProfiles } from "../src/analyzer/profile-diff.js";
import { join } from "node:path";

const FIXTURES = join(__dirname, "fixtures/profiles");

describe("diffProfiles", () => {
  it("returns empty changes when comparing a profile to itself", () => {
    const result = diffProfiles(
      join(FIXTURES, "standalone.profile.yaml"),
      join(FIXTURES, "standalone.profile.yaml"),
    );
    expect(result.changes).toEqual([]);
    expect(result.impact.vocabularies_changed).toBe(false);
  });

  it("reports added paths when child has new fields", () => {
    // raw:true — diff as-written, not merged
    const result = diffProfiles(
      join(FIXTURES, "parent.profile.yaml"),
      join(FIXTURES, "child.profile.yaml"),
      { raw: true },
    );
    const intentAdd = result.changes.find(c => c.path.startsWith("vocabularies.intent"));
    expect(intentAdd).toBeDefined();
    expect(intentAdd!.type).toBe("added");
  });

  it("reports changed paths when values differ", () => {
    const result = diffProfiles(
      join(FIXTURES, "parent.profile.yaml"),
      join(FIXTURES, "child.profile.yaml"),
      { raw: true },
    );
    const prefixChange = result.changes.find(c => c.path === "naming.css_prefix");
    expect(prefixChange).toBeDefined();
    expect(prefixChange!.type).toBe("changed");
    expect(prefixChange!.before).toBe("pa-");
    expect(prefixChange!.after).toBe("ch-");
  });

  it("sets impact.vocabularies_changed when vocabularies differ", () => {
    const result = diffProfiles(
      join(FIXTURES, "parent.profile.yaml"),
      join(FIXTURES, "child.profile.yaml"),
      { raw: true },
    );
    expect(result.impact.vocabularies_changed).toBe(true);
  });

  it("respects section filter", () => {
    const result = diffProfiles(
      join(FIXTURES, "parent.profile.yaml"),
      join(FIXTURES, "child.profile.yaml"),
      { raw: true, section: "naming" },
    );
    expect(result.changes.every(c => c.path.startsWith("naming"))).toBe(true);
  });

  it("merges extends on both sides by default (raw:false)", () => {
    // Default raw:false: child is merged with parent → comparing parent to
    // merged-child still shows the child's additions (intent, new hierarchy values).
    const result = diffProfiles(
      join(FIXTURES, "parent.profile.yaml"),
      join(FIXTURES, "child.profile.yaml"),
    );
    const intentAdd = result.changes.find(c => c.path === "vocabularies.intent");
    const hierarchyValuesChange = result.changes.find(c => c.path === "vocabularies.hierarchy.values");
    expect(intentAdd).toBeDefined();
    expect(hierarchyValuesChange).toBeDefined();
  });
});
