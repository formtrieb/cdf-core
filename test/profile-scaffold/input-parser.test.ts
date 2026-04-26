import { describe, it, expect } from "vitest";
import { parseScaffoldInput } from "../../src/analyzer/profile-scaffold/input-parser.js";

describe("parseScaffoldInput", () => {
  it("parses a minimal valid input (tokens only, no components, no modes)", () => {
    const json = JSON.stringify({
      tokens: [
        { path: "color.bg", value: "#fff", type: "color" },
      ],
    });

    const result = parseScaffoldInput(json);

    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]).toEqual({ path: "color.bg", value: "#fff", type: "color" });
    expect(result.components).toEqual([]);
    expect(result.modes).toEqual([]);
  });

  it("parses full input with components + modes + metadata", () => {
    const json = JSON.stringify({
      tokens: [{ path: "color.primary", value: "#00f", type: "color" }],
      modes: [{ collection: "Theme", values: ["Light", "Dark"] }],
      components: [
        {
          name: "Button",
          properties: [
            { name: "variant", type: "variant", values: ["primary", "secondary"] },
          ],
          token_refs: ["color.primary"],
        },
      ],
      source: { kind: "figma", ref: "abc123", date: "2026-04-18" },
    });

    const result = parseScaffoldInput(json);

    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe("Button");
    expect(result.components[0].token_refs).toEqual(["color.primary"]);
    expect(result.modes).toHaveLength(1);
    expect(result.modes[0].collection).toBe("Theme");
    expect(result.source?.kind).toBe("figma");
  });

  it("throws on malformed JSON", () => {
    expect(() => parseScaffoldInput("{ not json")).toThrow(/JSON/i);
  });

  it("throws when top-level is not an object", () => {
    expect(() => parseScaffoldInput(JSON.stringify([1, 2, 3]))).toThrow(
      /must be a JSON object/i,
    );
  });

  it("throws when `tokens` is missing", () => {
    expect(() => parseScaffoldInput(JSON.stringify({}))).toThrow(
      /tokens.*required/i,
    );
  });

  it("throws when a token entry is missing required fields", () => {
    const json = JSON.stringify({
      tokens: [{ path: "color.bg" /* value + type missing */ }],
    });
    expect(() => parseScaffoldInput(json)).toThrow(/tokens\[0\]/);
  });

  it("throws when token.type is not an allowed DTCG-like value", () => {
    const json = JSON.stringify({
      tokens: [{ path: "color.bg", value: "#fff", type: "pizza" }],
    });
    expect(() => parseScaffoldInput(json)).toThrow(/type/i);
  });

  it("throws when a variant property declares no values", () => {
    const json = JSON.stringify({
      tokens: [],
      components: [
        {
          name: "Button",
          properties: [{ name: "variant", type: "variant" /* values missing */ }],
        },
      ],
    });
    expect(() => parseScaffoldInput(json)).toThrow(/variant.*values/i);
  });

  it("accepts a non-variant property without values", () => {
    const json = JSON.stringify({
      tokens: [],
      components: [
        {
          name: "Button",
          properties: [
            { name: "label", type: "text" },
            { name: "disabled", type: "boolean" },
            { name: "icon", type: "instance-swap" },
          ],
        },
      ],
    });
    expect(() => parseScaffoldInput(json)).not.toThrow();
  });

  it("normalizes token paths with `/` separator to `.`", () => {
    const json = JSON.stringify({
      tokens: [{ path: "color/primary/default", value: "#00f", type: "color" }],
    });
    const result = parseScaffoldInput(json);
    expect(result.tokens[0].path).toBe("color.primary.default");
  });

  it("emits a warning when token.type='string' but value looks like a color (D3)", () => {
    const json = JSON.stringify({
      tokens: [{ path: "color.primary", value: "#00ff00", type: "string" }],
    });
    const result = parseScaffoldInput(json);
    expect(result.warnings.some((w) => /#00ff00/.test(w) && /color/.test(w))).toBe(true);
  });

  it("emits a warning when token.type='string' but value looks like a dimension (D3)", () => {
    const json = JSON.stringify({
      tokens: [{ path: "size.sm", value: "12px", type: "string" }],
    });
    const result = parseScaffoldInput(json);
    expect(result.warnings.some((w) => /12px/.test(w) && /dimension/.test(w))).toBe(true);
  });

  it("recognises `ch` as a dimension unit (N1, v1.2.1)", () => {
    // Typography tokens frequently use character-width for measure /
    // line-length; pre-v1.2.1 the regex missed it.
    const json = JSON.stringify({
      tokens: [{ path: "typography.measure", value: "65ch", type: "string" }],
    });
    const result = parseScaffoldInput(json);
    expect(result.warnings.some((w) => /65ch/.test(w) && /dimension/.test(w))).toBe(true);
  });
});
