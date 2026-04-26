import { describe, it, expect } from "vitest";
import { scaffoldProfile } from "../../src/analyzer/profile-scaffold/index.js";
import { parseProfile } from "../../src/parser/profile-parser.js";
import { buildPriorArtIndex } from "../../src/analyzer/profile-scaffold/prior-art.js";
import type { DSProfile } from "../../src/types/profile.js";

function fixturePriorArt() {
  const formtriebLike: DSProfile = {
    name: "Formtrieb",
    version: "1.0.0",
    cdf_version: ">=1.0.0",
    dtcg_version: "2025.10",
    description: "",
    vocabularies: {
      hierarchy: { description: "emphasis", values: ["brand", "primary", "secondary"] },
    },
    token_grammar: {
      controls: {
        pattern: "color.controls.{hierarchy}.{element}.{state}",
        dtcg_type: "color",
        description: "Interactive Controls pattern",
      },
    },
    token_layers: [],
    interaction_patterns: {
      pressable: {
        description: "press",
        states: ["default", "hover", "pressed", "disabled"],
      },
    },
    theming: { modifiers: {}, set_mapping: {} },
    naming: {
      css_prefix: "ft-",
      token_prefix: "--ft-",
      methodology: "BEM",
      pattern: "x",
      casing: {},
      reserved_names: {},
    },
    categories: {},
  };
  return buildPriorArtIndex([{ ds: "formtrieb", profile: formtriebLike }]);
}

describe("scaffoldProfile — integration", () => {
  it("builds a minimal valid profile from an empty-ish input", () => {
    const r = scaffoldProfile(
      { tokens: [], modes: [], components: [], warnings: [] },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    expect(r.profile.name).toBe("Acme");
    expect(r.profile.vocabularies).toEqual({});
    expect(r.profile.token_grammar).toEqual({});
    // Empty-components warning surfaced
    expect(r.warnings.some((w) => /components|vocabular/i.test(w))).toBe(true);
    // Round-trip the emitted YAML
    expect(() => parseProfile(r.profileYaml)).not.toThrow();
  });

  it("wires inferred vocabs, grammars, theming into the DSProfile", () => {
    const tokens = [];
    for (const h of ["primary", "secondary", "tertiary"]) {
      for (const el of ["bg", "border", "text"]) {
        for (const st of ["rest", "hover"]) {
          tokens.push({
            path: `color.${h}.${el}.${st}`,
            value: "#fff",
            type: "color" as const,
          });
        }
      }
    }
    const r = scaffoldProfile(
      {
        tokens,
        modes: [{ collection: "Theme", values: ["Light", "Dark"] }],
        components: [
          {
            name: "Button",
            properties: [
              { name: "size", type: "variant", values: ["sm", "md", "lg"] },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    expect(r.profile.vocabularies.size).toBeDefined();
    expect(Object.keys(r.profile.vocabularies)).toContain("size");
    expect(Object.keys(r.profile.token_grammar)).toContain("color");
    expect(r.profile.theming.modifiers.semantic).toBeDefined();
  });

  it("surfaces Milestone 1 (vocab-naming) data when properties clash", () => {
    const r = scaffoldProfile(
      {
        tokens: [],
        modes: [],
        components: [
          {
            name: "Button",
            properties: [
              { name: "variant", type: "variant", values: ["primary", "secondary"] },
            ],
          },
          {
            name: "Alert",
            properties: [
              { name: "variant", type: "variant", values: ["info", "success", "warning"] },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    expect(r.milestones.vocabNaming).toBeDefined();
    expect(r.milestones.vocabNaming!.propertyName).toBe("variant");
    expect(r.milestones.vocabNaming!.groups).toHaveLength(2);
  });

  it("surfaces Milestone 3 (base-state) when tokens and properties disagree on the base name", () => {
    // Tokens use `.rest`; components use `default` — the classic mismatch.
    const r = scaffoldProfile(
      {
        tokens: [
          { path: "color.a.b.rest", value: "#fff", type: "color" },
          { path: "color.a.b.hover", value: "#eee", type: "color" },
        ],
        modes: [],
        components: [
          {
            name: "Button",
            properties: [
              {
                name: "state",
                type: "variant",
                values: ["default", "hover", "pressed"],
              },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    expect(r.milestones.baseState).toBeDefined();
    expect(r.milestones.baseState!.tokenBaseState).toBe("rest");
    expect(r.milestones.baseState!.propertyBaseState).toBe("default");
  });

  it("resolves Milestone 1 via provided resolution (split-recommended)", () => {
    const r = scaffoldProfile(
      {
        tokens: [],
        modes: [],
        components: [
          {
            name: "Button",
            properties: [
              { name: "variant", type: "variant", values: ["primary", "secondary"] },
            ],
          },
          {
            name: "Alert",
            properties: [
              { name: "variant", type: "variant", values: ["info", "success"] },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
        resolutions: {
          "vocab-naming": { action: "split-recommended" },
        },
      },
    );
    // Two separate vocabs should be emitted, each with a distinct name
    // (default split-recommended names are stable but may be heuristic;
    // we assert two entries exist, not the specific names)
    const names = Object.keys(r.profile.vocabularies);
    expect(names.length).toBeGreaterThanOrEqual(2);

    const decision = r.decisions.find((d) => d.milestone_id === "vocab-naming");
    expect(decision).toBeDefined();
    expect(decision!.source).toBe("user");
  });

  it("falls back to default resolutions when none provided and records source:default", () => {
    const r = scaffoldProfile(
      {
        tokens: [],
        modes: [],
        components: [
          {
            name: "Button",
            properties: [
              { name: "variant", type: "variant", values: ["primary", "secondary"] },
            ],
          },
          {
            name: "Alert",
            properties: [
              { name: "variant", type: "variant", values: ["info", "success"] },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    const decision = r.decisions.find((d) => d.milestone_id === "vocab-naming");
    expect(decision).toBeDefined();
    expect(decision!.source).toBe("default");
  });

  it("emits profile_yaml that round-trips through parseProfile", () => {
    const tokens = [];
    for (let i = 0; i < 12; i++) {
      tokens.push({
        path: `color.a.b${i}.c`,
        value: "#fff",
        type: "color" as const,
      });
    }
    const r = scaffoldProfile(
      {
        tokens,
        modes: [{ collection: "Theme", values: ["Light", "Dark"] }],
        components: [
          {
            name: "Button",
            properties: [
              { name: "size", type: "variant", values: ["sm", "md"] },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    const parsed = parseProfile(r.profileYaml);
    expect(parsed.name).toBe("Acme");
    expect(Object.keys(parsed.vocabularies)).toContain("size");
  });

  it("counts summary fields (tokens_inferred, vocabularies_inferred, theming_modifiers_inferred)", () => {
    const r = scaffoldProfile(
      {
        tokens: [
          { path: "color.primary", value: "#00f", type: "color" },
          { path: "color.secondary", value: "#0f0", type: "color" },
        ],
        modes: [
          { collection: "Theme", values: ["Light", "Dark"] },
        ],
        components: [
          {
            name: "Button",
            properties: [
              { name: "size", type: "variant", values: ["sm", "md"] },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    expect(r.summary.tokens_inferred).toBe(2);
    expect(r.summary.vocabularies_inferred).toBe(1);
    expect(r.summary.theming_modifiers_inferred).toBe(1);
  });

  it("re-runs inference with applied structuralDeltas and skips Phase-1 milestones", () => {
    // Tokens that would normally surface the base-state milestone (tokens
    // use `rest`; properties use `default`).
    const tokens = [];
    for (const h of ["primary", "secondary", "tertiary"]) {
      for (const el of ["bg", "text"]) {
        for (const st of ["rest", "hover"]) {
          tokens.push({
            path: `color.${h}.${el}.${st}`,
            value: "#fff",
            type: "color" as const,
          });
        }
      }
    }
    const baseline = scaffoldProfile(
      {
        tokens,
        modes: [],
        components: [
          {
            name: "Button",
            properties: [
              {
                name: "state",
                type: "variant",
                values: ["default", "hover", "pressed"],
              },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    // Sanity: Phase-1 would fire here without deltas.
    expect(baseline.milestones.baseState).toBeDefined();

    // Now pass a rename-axis-value delta; orchestrator re-runs inference
    // on mutated tokens AND skips Phase-1 milestone preparation.
    const rerun = scaffoldProfile(
      {
        tokens,
        modes: [],
        components: [
          {
            name: "Button",
            properties: [
              {
                name: "state",
                type: "variant",
                values: ["default", "hover", "pressed"],
              },
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
        structuralDeltas: [
          {
            kind: "rename-axis-value",
            grammar: "color",
            axis: "axis1",
            from: "bg",
            to: "fill",
          },
        ],
      },
    );
    // Phase-1 milestones NOT populated on re-runs (hard loop-prevention rule).
    expect(rerun.milestones.vocabNaming).toBeUndefined();
    expect(rerun.milestones.grammarPattern).toBeUndefined();
    expect(rerun.milestones.baseState).toBeUndefined();
    // Mutation landed: the grammar's axis values reflect the rename.
    const colorAxes = rerun.profile.token_grammar.color.axes;
    const elementValues = Object.values(colorAxes ?? {})
      .flatMap((a) => a.values);
    expect(elementValues).toContain("fill");
    expect(elementValues).not.toContain("bg");
  });

  it("emits Phase-2 raw material for each inferred grammar", () => {
    const tokens = [];
    for (const h of ["primary", "secondary", "tertiary"]) {
      for (const el of ["bg", "border", "text"]) {
        for (const st of ["rest", "hover"]) {
          tokens.push({
            path: `color.${h}.${el}.${st}`,
            value: "#fff",
            type: "color" as const,
          });
        }
      }
    }
    const r = scaffoldProfile(
      {
        tokens,
        modes: [],
        components: [
          {
            name: "Button",
            properties: [
              { name: "variant", type: "variant", values: ["primary"] },
            ],
            token_refs: [
              "color.primary.bg.rest",
              "color.primary.text.rest",
            ],
          },
        ],
        warnings: [],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    expect(r.rawMaterial).toBeDefined();
    const colorUsage = r.rawMaterial.grammars.color;
    expect(colorUsage).toBeDefined();
    expect(colorUsage.sparsity.totalSlots).toBe(3 * 3 * 2);
    expect(colorUsage.sparsity.boundSlots).toBeGreaterThan(0);
    expect(colorUsage.perComponent.map((b) => b.component)).toContain("Button");
  });

  it("propagates ScaffoldInput warnings (D3) into the result", () => {
    const r = scaffoldProfile(
      {
        tokens: [{ path: "color.a", value: "#abc", type: "color" }],
        modes: [],
        components: [],
        warnings: ["input-parser warning: x"],
      },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      },
    );
    expect(r.warnings).toContain("input-parser warning: x");
  });

  it("processes every vocab clash — not just the first — so a `state` divergence behind a `type` clash still reaches the emitted profile (M-2)", () => {
    // Multi-clash fixture: six components share a `state` variant property
    // with five divergent vocabularies, and Button + ValueSlider also
    // share a `type` property with zero overlap. Previously the `type`
    // clash consumed the single milestone slot and the `state` clash was
    // silently dropped, leaving `state` absent from the emitted profile.
    const components = [
      {
        name: "Button",
        properties: [
          {
            name: "type",
            type: "variant" as const,
            values: [
              "brand",
              "primary",
              "secondary",
              "tertiary",
              "tertiaryWithoutPadding",
            ],
          },
          {
            name: "state",
            type: "variant" as const,
            values: ["enabled", "hover", "pressed", "disabled", "pending"],
          },
        ],
      },
      {
        name: "BasetextInput",
        properties: [
          {
            name: "state",
            type: "variant" as const,
            values: [
              "enabled",
              "hover",
              "filled-hover",
              "filled",
              "filled-error",
              "disabled",
              "read-only",
              "error",
              "filled-disabled",
            ],
          },
        ],
      },
      {
        name: "TextInput",
        properties: [
          {
            name: "state",
            type: "variant" as const,
            values: ["default", "error"],
          },
        ],
      },
      {
        name: "ValueSlider",
        properties: [
          {
            name: "type",
            type: "variant" as const,
            values: ["continuous", "stepped"],
          },
          {
            name: "state",
            type: "variant" as const,
            values: ["enabled", "hover", "pressed", "disabled"],
          },
        ],
      },
      {
        name: "BaseSlider",
        properties: [
          {
            name: "state",
            type: "variant" as const,
            values: ["enabled", "hover", "pressed", "disabled"],
          },
        ],
      },
      {
        name: "PasswordField",
        properties: [
          {
            name: "state",
            type: "variant" as const,
            values: ["placeholder", "filled", "visible", "error", "error-visible"],
          },
        ],
      },
    ];

    const r = scaffoldProfile(
      { tokens: [], modes: [], components, warnings: [] },
      {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-19",
        priorArt: fixturePriorArt(),
      },
    );

    const vocabNames = Object.keys(r.profile.vocabularies);
    // Sanity: `type` still splits as before.
    expect(vocabNames).toContain("type");
    // The fix: `state` must also reach the emitted profile, split into
    // at least two per-group vocabularies (the big merged group + the
    // disjoint PasswordField group).
    expect(vocabNames).toContain("state");
    const stateLike = vocabNames.filter(
      (n) => n === "state" || /^state_\d+$/.test(n),
    );
    expect(stateLike.length).toBeGreaterThanOrEqual(2);
    // Decision log records the state split alongside the type split.
    const stateDecisions = r.decisions.filter(
      (d) =>
        d.milestone_id === "vocab-naming" &&
        d.summary.toLowerCase().includes("state"),
    );
    expect(stateDecisions.length).toBeGreaterThan(0);
  });

  // ── F2: grammar-pattern resolution-reactive path ──────────────────────
  // A borderline token group (6-9 tokens, consistent depth ≥3) surfaces
  // Milestone 2. Resolution `accept-grammar` must actually promote those
  // tokens from `standalone_tokens` to `token_grammar` on the second pass.
  // Pre-fix: resolution only wrote a decision log entry; emitted Profile
  // was identical to the default — a contract violation of Elicitation
  // Principle 2 (see post-Session-1 review finding F2).
  describe("F2 — grammar-pattern resolution changes the emitted Profile", () => {
    // 8 tokens, consistent depth 3 → borderline (6-9 window).
    const borderlineInput = {
      tokens: [
        { path: "color.primary.bg", value: "#111", type: "color" as const },
        { path: "color.primary.border", value: "#222", type: "color" as const },
        { path: "color.primary.text", value: "#333", type: "color" as const },
        { path: "color.primary.icon", value: "#444", type: "color" as const },
        { path: "color.secondary.bg", value: "#555", type: "color" as const },
        { path: "color.secondary.border", value: "#666", type: "color" as const },
        { path: "color.secondary.text", value: "#777", type: "color" as const },
        { path: "color.secondary.icon", value: "#888", type: "color" as const },
      ],
      modes: [],
      components: [],
      warnings: [],
    };

    it("surfaces grammarPattern milestone for a borderline group", () => {
      const r = scaffoldProfile(borderlineInput, {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      });
      expect(r.milestones.grammarPattern).toBeDefined();
      expect(r.milestones.grammarPattern!.root).toBe("color");
      expect(r.milestones.grammarPattern!.memberCount).toBe(8);
    });

    it("default resolution (no user input) keeps tokens in standalone_tokens", () => {
      const r = scaffoldProfile(borderlineInput, {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
      });
      // 8 borderline tokens stay flat by default — conservative behaviour.
      expect(Object.keys(r.profile.token_grammar)).not.toContain("color");
      expect(Object.keys(r.profile.standalone_tokens ?? {}).length).toBe(8);
    });

    it("resolution `accept-grammar` promotes the borderline group into token_grammar", () => {
      const r = scaffoldProfile(borderlineInput, {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
        resolutions: {
          "grammar-pattern": { action: "accept-grammar" },
        },
      });
      // The borderline group must now live under token_grammar, not standalone.
      expect(Object.keys(r.profile.token_grammar)).toContain("color");
      const standalonePaths = Object.keys(r.profile.standalone_tokens ?? {});
      expect(standalonePaths.filter((p) => p.startsWith("color."))).toHaveLength(0);

      const g = r.profile.token_grammar.color;
      expect(g.pattern).toMatch(/^color\./);
      // Two axes: {axis0} for hierarchy level, {axis1} for element.
      expect((g.pattern.match(/\{/g) ?? []).length).toBe(2);

      const decision = r.decisions.find((d) => d.milestone_id === "grammar-pattern");
      expect(decision).toBeDefined();
      expect(decision!.source).toBe("user");
    });

    it("resolution `flatten-standalone` keeps the group in standalone_tokens", () => {
      const r = scaffoldProfile(borderlineInput, {
        ds_name: "Acme",
        ds_identifier: "acme",
        date: "2026-04-18",
        priorArt: fixturePriorArt(),
        resolutions: {
          "grammar-pattern": { action: "flatten-standalone" },
        },
      });
      expect(Object.keys(r.profile.token_grammar)).not.toContain("color");
      expect(Object.keys(r.profile.standalone_tokens ?? {}).length).toBe(8);
      const decision = r.decisions.find((d) => d.milestone_id === "grammar-pattern");
      expect(decision!.source).toBe("user");
    });
  });
});
