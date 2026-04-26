import { describe, it, expect } from "vitest";
import { applyStructuralDeltas } from "../../src/analyzer/profile-scaffold/phase2-structural-deltas.js";
import type { InferredGrammar } from "../../src/analyzer/profile-scaffold/token-inference.js";
import type { ScaffoldInputToken } from "../../src/analyzer/profile-scaffold/input-parser.js";

// Grammar.name == pattern root is the cdf-core convention
// (see token-inference.ts extractGrammar).
function mkGrammar(over: Partial<InferredGrammar> = {}): InferredGrammar {
  return {
    name: "color",
    pattern: "color.{hierarchy}.{element}.{state}",
    dtcg_type: "color",
    axes: [
      { placeholder: "hierarchy", position: 1, values: ["primary", "secondary"] },
      { placeholder: "element", position: 2, values: ["background", "text"] },
      { placeholder: "state", position: 3, values: ["rest", "hover"] },
    ],
    members: [],
    ...over,
  };
}

const TOKEN_SET: ScaffoldInputToken[] = [
  { path: "color.primary.background.rest", value: "#111", type: "color" },
  { path: "color.primary.background.hover", value: "#112", type: "color" },
  { path: "color.primary.text.rest", value: "#221", type: "color" },
  { path: "color.secondary.background.rest", value: "#331", type: "color" },
];

describe("applyStructuralDeltas", () => {
  it("returns input unchanged when the delta list is empty", () => {
    const r = applyStructuralDeltas(TOKEN_SET, [], [mkGrammar()]);
    expect(r).toEqual(TOKEN_SET);
  });

  it("rewrites the axis-value in matching token paths on rename-axis-value", () => {
    const r = applyStructuralDeltas(
      TOKEN_SET,
      [
        {
          kind: "rename-axis-value",
          grammar: "color",
          axis: "element",
          from: "background",
          to: "fill",
        },
      ],
      [mkGrammar()],
    );
    expect(r.map((t) => t.path).sort()).toEqual([
      "color.primary.fill.hover",
      "color.primary.fill.rest",
      "color.primary.text.rest",
      "color.secondary.fill.rest",
    ]);
  });

  it("drops the axis segment and deduplicates on remove-axis", () => {
    const r = applyStructuralDeltas(
      TOKEN_SET,
      [{ kind: "remove-axis", grammar: "color", axis: "state" }],
      [mkGrammar()],
    );
    // After dropping `state` segment, hover/rest collapse.
    expect(r.map((t) => t.path).sort()).toEqual([
      "color.primary.background",
      "color.primary.text",
      "color.secondary.background",
    ]);
  });

  it("rewrites the root segment of matching token paths on rename-grammar", () => {
    const r = applyStructuralDeltas(
      TOKEN_SET,
      [{ kind: "rename-grammar", from: "color", to: "paint" }],
      [mkGrammar()],
    );
    expect(r.map((t) => t.path).sort()).toEqual([
      "paint.primary.background.hover",
      "paint.primary.background.rest",
      "paint.primary.text.rest",
      "paint.secondary.background.rest",
    ]);
  });

  it("leaves tokens of non-matching grammars untouched", () => {
    const extra: ScaffoldInputToken[] = [
      ...TOKEN_SET,
      { path: "spacing.md", value: "8px", type: "dimension" },
    ];
    const r = applyStructuralDeltas(
      extra,
      [
        {
          kind: "rename-axis-value",
          grammar: "color",
          axis: "element",
          from: "background",
          to: "fill",
        },
      ],
      [mkGrammar()],
    );
    expect(r.find((t) => t.path === "spacing.md")).toBeDefined();
  });

  it("applies multiple deltas in order", () => {
    const r = applyStructuralDeltas(
      TOKEN_SET,
      [
        {
          kind: "rename-axis-value",
          grammar: "color",
          axis: "element",
          from: "background",
          to: "fill",
        },
        { kind: "rename-grammar", from: "color", to: "paint" },
      ],
      [mkGrammar()],
    );
    expect(r.map((t) => t.path).sort()).toEqual([
      "paint.primary.fill.hover",
      "paint.primary.fill.rest",
      "paint.primary.text.rest",
      "paint.secondary.fill.rest",
    ]);
  });
});
