import { describe, it, expect } from "vitest";
import { expandTokenTables, parseCDF } from "../src/index.js";
import type { CDFComponent } from "../src/index.js";

// Helper: a component with a `variant` property (so axis "variant" resolves)
// and an arbitrary tokens block (token_table allowed pre-expansion).
function comp(tokens: unknown, extra: Partial<CDFComponent> = {}): CDFComponent {
  return {
    name: "T",
    category: "Actions",
    properties: {
      variant: { type: "enum", values: ["default", "secondary", "accent"], default: "default", description: "t" },
    },
    anatomy: { container: { element: "box", description: "t" } },
    tokens: tokens as CDFComponent["tokens"],
    ...extra,
  } as CDFComponent;
}

describe("expandTokenTables (§13.3.1)", () => {
  it("expands a step-based table to flat §13.3 value-maps", () => {
    const out = expandTokenTables(
      comp({
        container: {
          token_table: {
            axis: "variant",
            states: { hover: "{rest}-dark", active: "{rest}-darker" },
            background: { default: "color.primary", secondary: "color.secondary" },
          },
        },
      })
    );
    expect(out.tokens!.container).toEqual({
      background: { default: "color.primary", secondary: "color.secondary" },
      "background--hover": { default: "color.primary-dark", secondary: "color.secondary-dark" },
      "background--active": { default: "color.primary-darker", secondary: "color.secondary-darker" },
    });
  });

  it("supports multiple columns and explicit-cell rows that override the step", () => {
    const out = expandTokenTables(
      comp({
        container: {
          token_table: {
            axis: "variant",
            states: { hover: "{rest}-dark" },
            background: { default: "color.primary", accent: { rest: "color.accent", hover: "color.accent-700" } },
            color: { default: "color.onPrimary", accent: "color.onAccent" },
          },
        },
      })
    );
    expect(out.tokens!.container).toEqual({
      background: { default: "color.primary", accent: "color.accent" },
      "background--hover": { default: "color.primary-dark", accent: "color.accent-700" },
      color: { default: "color.onPrimary", accent: "color.onAccent" },
      "color--hover": { default: "color.onPrimary-dark", accent: "color.onAccent-dark" },
    });
  });

  it("hand-authored keys win per row over generated value-maps", () => {
    const out = expandTokenTables(
      comp({
        container: {
          "background--hover": { default: "color.OVERRIDE" },
          token_table: {
            axis: "variant",
            states: { hover: "{rest}-dark" },
            background: { default: "color.primary", secondary: "color.secondary" },
          },
        },
      })
    );
    expect(out.tokens!.container["background--hover"]).toEqual({
      default: "color.OVERRIDE", // hand-authored survives
      secondary: "color.secondary-dark", // generated fills the gap
    });
  });

  it("is deterministic (stable serialization across runs)", () => {
    const mk = () =>
      comp({
        container: {
          token_table: {
            axis: "variant",
            states: { hover: "{rest}-dark", active: "{rest}-darker" },
            background: { default: "color.a", secondary: "color.b" },
            color: { default: "color.c", secondary: "color.d" },
          },
        },
      });
    expect(JSON.stringify(expandTokenTables(mk()).tokens)).toBe(JSON.stringify(expandTokenTables(mk()).tokens));
  });

  it("returns the component unchanged (same reference) when no token_table is present", () => {
    const input = comp({ container: { background: "color.x" } });
    expect(expandTokenTables(input)).toBe(input);
  });

  it("throws when a token_table declares no axis", () => {
    expect(() => expandTokenTables(comp({ container: { token_table: { background: { default: "color.a" } } } }))).toThrow(/axis/);
  });

  it("throws when the axis names no declared property or state", () => {
    expect(() =>
      expandTokenTables(comp({ container: { token_table: { axis: "nope", background: { default: "color.a" } } } }))
    ).toThrow(/names no declared/);
  });

  it("parseCDF applies expansion transparently and removes token_table", () => {
    const yaml = `
name: T
category: Actions
properties:
  variant:
    type: enum
    values: [default, secondary]
    default: default
anatomy:
  container: { element: box, description: t }
tokens:
  container:
    token_table:
      axis: variant
      states: { hover: "{rest}-dark" }
      background: { default: color.primary, secondary: color.secondary }
`;
    const parsed = parseCDF(yaml);
    expect(parsed.tokens!.container).toEqual({
      background: { default: "color.primary", secondary: "color.secondary" },
      "background--hover": { default: "color.primary-dark", secondary: "color.secondary-dark" },
    });
    expect((parsed.tokens!.container as Record<string, unknown>).token_table).toBeUndefined();
  });
});
