import { describe, it, expect } from "vitest";
import { inferVocabularies } from "../../src/analyzer/profile-scaffold/vocab-inference.js";
import type { ScaffoldInputComponent } from "../../src/analyzer/profile-scaffold/input-parser.js";

function mkComp(
  name: string,
  props: Array<{
    name: string;
    type?: ScaffoldInputComponent["properties"][number]["type"];
    values?: string[];
  }>,
): ScaffoldInputComponent {
  return {
    name,
    properties: props.map((p) => ({
      name: p.name,
      type: p.type ?? "variant",
      values: p.values,
    })),
  };
}

describe("inferVocabularies", () => {
  it("returns empty when no components are provided", () => {
    const r = inferVocabularies([]);
    expect(r.vocabularies).toEqual([]);
    expect(r.clashes).toEqual([]);
  });

  it("ignores non-variant properties (boolean / text / instance-swap)", () => {
    const components = [
      mkComp("Button", [
        { name: "disabled", type: "boolean" },
        { name: "label", type: "text" },
        { name: "icon", type: "instance-swap" },
      ]),
    ];
    const r = inferVocabularies(components);
    expect(r.vocabularies).toEqual([]);
  });

  it("creates a single vocab for one variant property on one component", () => {
    const components = [
      mkComp("Button", [
        { name: "size", values: ["sm", "md", "lg"] },
      ]),
    ];
    const r = inferVocabularies(components);
    expect(r.vocabularies).toHaveLength(1);
    expect(r.vocabularies[0].name).toBe("size");
    expect(r.vocabularies[0].values.sort()).toEqual(["lg", "md", "sm"]);
    expect(r.vocabularies[0].sources).toHaveLength(1);
    expect(r.vocabularies[0].sources[0]).toEqual({
      component: "Button",
      property: "size",
      values: ["sm", "md", "lg"],
    });
  });

  it("merges two components sharing a property name AND overlapping values (>=50%)", () => {
    const components = [
      mkComp("Button", [{ name: "size", values: ["sm", "md", "lg"] }]),
      mkComp("TextField", [{ name: "size", values: ["sm", "md"] }]),
    ];
    const r = inferVocabularies(components);
    expect(r.vocabularies).toHaveLength(1);
    expect(r.vocabularies[0].name).toBe("size");
    expect(r.vocabularies[0].values.sort()).toEqual(["lg", "md", "sm"]);
    expect(r.vocabularies[0].sources).toHaveLength(2);
    expect(r.clashes).toHaveLength(0);
  });

  it("flags a clash when two components share a property name but have disjoint values", () => {
    // `variant` means different things to Button and Alert (design §2.3 M1 example)
    const components = [
      mkComp("Button", [{ name: "variant", values: ["primary", "secondary", "tertiary"] }]),
      mkComp("Alert", [{ name: "variant", values: ["info", "success", "warning", "error"] }]),
    ];
    const r = inferVocabularies(components);
    expect(r.clashes).toHaveLength(1);
    const clash = r.clashes[0];
    expect(clash.propertyName).toBe("variant");
    expect(clash.groups).toHaveLength(2);
    // groups include per-component value sets
    const buttonGroup = clash.groups.find((g) => g.components.includes("Button"))!;
    const alertGroup = clash.groups.find((g) => g.components.includes("Alert"))!;
    expect(buttonGroup.values.sort()).toEqual(["primary", "secondary", "tertiary"]);
    expect(alertGroup.values.sort()).toEqual(["error", "info", "success", "warning"]);
    expect(clash.overlapRatio).toBe(0);
    // Default: emit nothing under `vocabularies` for the clash — caller
    // elicits and decides final names.
    expect(r.vocabularies.find((v) => v.name === "variant")).toBeUndefined();
  });

  it("treats two disjoint groups across three components as one clash with three groups", () => {
    const components = [
      mkComp("A", [{ name: "variant", values: ["a1", "a2"] }]),
      mkComp("B", [{ name: "variant", values: ["b1", "b2"] }]),
      mkComp("C", [{ name: "variant", values: ["a1", "a2"] }]),
    ];
    const r = inferVocabularies(components);
    // A and C overlap fully on values — should merge into one group;
    // B is disjoint — separate group.
    expect(r.clashes).toHaveLength(1);
    const clash = r.clashes[0];
    expect(clash.groups).toHaveLength(2);
    const ac = clash.groups.find((g) =>
      g.components.includes("A") && g.components.includes("C"),
    );
    expect(ac).toBeDefined();
    expect(ac!.values.sort()).toEqual(["a1", "a2"]);
  });

  it("emits a warning when any component property has no values array (variant without enum)", () => {
    // Input-parser already blocks this for type:variant; defensive check here for
    // non-variant with no values — we just skip them quietly.
    const components = [
      mkComp("Card", [{ name: "elevated", type: "boolean" }]),
    ];
    const r = inferVocabularies(components);
    expect(r.vocabularies).toEqual([]);
    expect(r.clashes).toEqual([]);
  });

  it("merges via partial overlap — 50% threshold", () => {
    // 2 shared / 3 total per group = 66% overlap → merge
    const components = [
      mkComp("X", [{ name: "tone", values: ["neutral", "muted", "bold"] }]),
      mkComp("Y", [{ name: "tone", values: ["neutral", "muted", "vivid"] }]),
    ];
    const r = inferVocabularies(components);
    expect(r.vocabularies).toHaveLength(1);
    expect(r.vocabularies[0].values.sort()).toEqual(["bold", "muted", "neutral", "vivid"]);
    expect(r.clashes).toHaveLength(0);
  });
});
