import { describe, it, expect } from "vitest";
import { inferTokenStructure } from "../../src/analyzer/profile-scaffold/token-inference.js";
import type { ScaffoldInputToken } from "../../src/analyzer/profile-scaffold/input-parser.js";

function mkToken(
  path: string,
  type: ScaffoldInputToken["type"] = "color",
  value: string | number = "#fff",
): ScaffoldInputToken {
  return { path, type, value };
}

describe("inferTokenStructure", () => {
  it("returns empty result for no tokens", () => {
    const r = inferTokenStructure([]);
    expect(r.grammars).toEqual([]);
    expect(r.standaloneTokens).toEqual([]);
    expect(r.borderline).toEqual([]);
  });

  it("emits standalone_tokens for a small flat group (<=5 tokens)", () => {
    const tokens = [
      mkToken("color.primary"),
      mkToken("color.secondary"),
      mkToken("color.background"),
    ];
    const r = inferTokenStructure(tokens);
    expect(r.grammars).toHaveLength(0);
    expect(r.standaloneTokens).toHaveLength(3);
    expect(r.standaloneTokens.map((s) => s.path).sort()).toEqual([
      "color.background",
      "color.primary",
      "color.secondary",
    ]);
    expect(r.standaloneTokens[0].dtcg_type).toBe("color");
  });

  it("emits standalone_tokens when group has inconsistent depth", () => {
    // 10 tokens but inconsistent depth → flat
    const tokens = [
      mkToken("color.a.b.c.d"),
      mkToken("color.e.f.g.h"),
      mkToken("color.i.j.k.l"),
      mkToken("color.m.n"),
      mkToken("color.o.p"),
      mkToken("color.q.r"),
      mkToken("color.s"),
      mkToken("color.t"),
      mkToken("color.u"),
      mkToken("color.v"),
    ];
    const r = inferTokenStructure(tokens);
    expect(r.grammars).toHaveLength(0);
    expect(r.standaloneTokens).toHaveLength(10);
  });

  it("infers a grammar for a large consistent-depth group (>=10 tokens, depth >=3)", () => {
    // Pattern: color.{component}.{element}.{state}
    const tokens: ScaffoldInputToken[] = [];
    for (const component of ["button", "alert", "card"]) {
      for (const element of ["bg", "border", "text"]) {
        for (const state of ["rest", "hover"]) {
          tokens.push(mkToken(`color.${component}.${element}.${state}`));
        }
      }
    }
    const r = inferTokenStructure(tokens);
    expect(r.grammars).toHaveLength(1);
    const g = r.grammars[0];
    expect(g.name).toBe("color");
    expect(g.dtcg_type).toBe("color");
    // pattern has root literal + 3 placeholders
    expect(g.pattern.startsWith("color.")).toBe(true);
    expect((g.pattern.match(/\{/g) ?? []).length).toBe(3);
    expect(g.axes).toHaveLength(3);
    expect(g.axes[0].values.sort()).toEqual(["alert", "button", "card"]);
    expect(g.axes[1].values.sort()).toEqual(["bg", "border", "text"]);
    expect(g.axes[2].values.sort()).toEqual(["hover", "rest"]);
    expect(g.members).toHaveLength(18);
  });

  it("keeps literal segments as literals when a position has exactly one value", () => {
    // Every token starts with `color.controls.` — that position should be a literal, not a placeholder
    const tokens: ScaffoldInputToken[] = [];
    for (const hierarchy of ["primary", "secondary", "tertiary"]) {
      for (const element of ["bg", "border", "text"]) {
        for (const state of ["rest", "hover"]) {
          tokens.push(mkToken(`color.controls.${hierarchy}.${element}.${state}`));
        }
      }
    }
    const r = inferTokenStructure(tokens);
    expect(r.grammars).toHaveLength(1);
    expect(r.grammars[0].pattern).toMatch(/^color\.controls\./);
    expect((r.grammars[0].pattern.match(/\{/g) ?? []).length).toBe(3);
    expect(r.grammars[0].axes).toHaveLength(3);
  });

  it("produces mixed output — one group flat, another grammar", () => {
    const tokens: ScaffoldInputToken[] = [];
    // spacing: 3 tokens (flat)
    for (const size of ["sm", "md", "lg"]) {
      tokens.push(mkToken(`spacing.${size}`, "dimension", "4px"));
    }
    // color: 18-token grammar
    for (const h of ["primary", "secondary", "tertiary"]) {
      for (const el of ["bg", "border", "text"]) {
        for (const st of ["rest", "hover"]) {
          tokens.push(mkToken(`color.${h}.${el}.${st}`));
        }
      }
    }
    const r = inferTokenStructure(tokens);
    expect(r.grammars.map((g) => g.name)).toEqual(["color"]);
    expect(r.standaloneTokens).toHaveLength(3);
    expect(r.standaloneTokens.every((s) => s.path.startsWith("spacing."))).toBe(true);
  });

  it("flags borderline groups (6-9 tokens, consistent depth) for Milestone 2 review", () => {
    const tokens: ScaffoldInputToken[] = [];
    // 8 tokens, consistent depth — borderline
    for (const h of ["primary", "secondary"]) {
      for (const el of ["bg", "border", "text", "icon"]) {
        tokens.push(mkToken(`color.${h}.${el}`));
      }
    }
    const r = inferTokenStructure(tokens);
    expect(r.borderline).toHaveLength(1);
    expect(r.borderline[0].root).toBe("color");
    expect(r.borderline[0].memberCount).toBe(8);
    // default proposal: treat as standalone (conservative)
    expect(["flat", "grammar"]).toContain(r.borderline[0].proposedAction);
  });

  it("dtcg_type picks the majority token type in the group", () => {
    // 9 `color` tokens + 1 `dimension` token in same group — majority wins
    const tokens: ScaffoldInputToken[] = [];
    for (let i = 0; i < 9; i++) {
      tokens.push(mkToken(`color.a.b${i}.c`, "color"));
    }
    tokens.push(mkToken("color.a.d.c", "dimension", "4px"));
    const r = inferTokenStructure(tokens);
    expect(r.grammars).toHaveLength(1);
    expect(r.grammars[0].dtcg_type).toBe("color");
  });

  it("infers grammar-name as the root segment (e.g. `color`, `spacing`)", () => {
    const tokens: ScaffoldInputToken[] = [];
    for (let i = 0; i < 10; i++) {
      tokens.push(mkToken(`spacing.scale.x${i}.y`, "dimension", `${i * 4}px`));
    }
    const r = inferTokenStructure(tokens);
    expect(r.grammars[0].name).toBe("spacing");
  });

  it("sub-groups a large mixed-depth root and infers a grammar per consistent-depth sub-group (M-1)", () => {
    // Real-world pattern: `color.*` spans depths 2–5. The 48-token
    // `color.controls.{hierarchy}.{element}.{state}` family (consistent
    // depth 5) was previously dumped to `standalone_tokens` because the
    // top-level root `color` group had mixed depths. The fix partitions
    // large mixed-depth roots by their second segment and classifies each
    // sub-group independently.
    const tokens: ScaffoldInputToken[] = [];
    for (const hierarchy of ["primary", "secondary", "tertiary"]) {
      for (const element of ["bg", "text", "border", "icon"]) {
        for (const state of ["rest", "hover", "pressed", "disabled"]) {
          tokens.push(mkToken(`color.controls.${hierarchy}.${element}.${state}`));
        }
      }
    }
    tokens.push(mkToken("color.brand"));
    tokens.push(mkToken("color.page"));
    for (const level of ["primary", "secondary", "disabled"]) {
      tokens.push(mkToken(`color.text.${level}`));
    }

    const r = inferTokenStructure(tokens);

    const controls = r.grammars.find((g) => g.name === "color.controls");
    expect(controls).toBeDefined();
    expect(controls!.pattern).toBe("color.controls.{axis0}.{axis1}.{axis2}");
    expect(controls!.axes).toHaveLength(3);
    expect(controls!.axes[0].values).toEqual(["primary", "secondary", "tertiary"]);
    expect(controls!.axes[1].values.sort()).toEqual(["bg", "border", "icon", "text"]);
    expect(controls!.axes[2].values.sort()).toEqual([
      "disabled",
      "hover",
      "pressed",
      "rest",
    ]);
    expect(controls!.members).toHaveLength(48);

    const standalonePaths = r.standaloneTokens.map((s) => s.path);
    expect(standalonePaths).toContain("color.brand");
    expect(standalonePaths).toContain("color.page");
    expect(standalonePaths).toContain("color.text.primary");
    // The controls-family tokens MUST NOT also appear as standalone.
    expect(standalonePaths.some((p) => p.startsWith("color.controls."))).toBe(false);
  });
});
