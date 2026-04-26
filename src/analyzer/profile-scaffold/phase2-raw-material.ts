/**
 * Phase-2 raw-material aggregator — D1 Medium.
 *
 * Pre-computes the numeric substrate that the client LLM needs to
 * formulate prose hypotheses during the Phase-2 interview. cdf-core
 * counts; the client LLM interprets. No pattern-taxonomy lives here.
 *
 * Produced per grammar: usage matrix (axis-value counts across
 * components' token_refs), per-component axis-value sets, sparsity
 * metric, and optional axis-to-category correlation.
 *
 * See `docs/plans/2026-04-18-cdf-profile-scaffold-phase2-interview-design.md`
 * §"Flow Step 1" and Decisions Summary D1.
 */

import type { InferredGrammar } from "./token-inference.js";
import type { ScaffoldInputComponent, ScaffoldInputToken } from "./input-parser.js";
import type { DSProfile } from "../../types/profile.js";

export interface Phase2RawMaterial {
  grammars: Record<string, GrammarUsage>;
}

export interface GrammarUsage {
  /** Total number of bound cartesian slots / total cartesian slots. */
  sparsity: SparsityMetric;
  /** Axis → { value → occurrence-count across all token_refs }. */
  usageMatrix: Record<string, Record<string, number>>;
  /** For each component binding this grammar, the axis-value set it uses. */
  perComponent: ComponentBinding[];
  /** Axis → value → list of categories that value co-occurs with.
   *  Empty when no category map is supplied. */
  axisCategoryCorrelation: Record<string, Record<string, string[]>>;
}

export interface SparsityMetric {
  boundSlots: number;
  totalSlots: number;
  ratio: number;
}

export interface ComponentBinding {
  component: string;
  axisValues: Record<string, string[]>;
}

export interface AggregateOptions {
  /** Optional map: component name → category name(s). Enables
   *  axis-to-category correlation. Empty/absent during scaffold-mode. */
  componentCategories?: Record<string, string[]>;
}

export function aggregateRawMaterial(
  grammars: InferredGrammar[],
  components: ScaffoldInputComponent[],
  options: AggregateOptions = {},
): Phase2RawMaterial {
  const out: Phase2RawMaterial = { grammars: {} };
  for (const g of grammars) {
    out.grammars[g.name] = buildGrammarUsage(
      g,
      components,
      options.componentCategories ?? {},
    );
  }
  return out;
}

/**
 * Enrich-mode entry point. Given an already-declared Profile (loaded
 * from YAML), reconstruct `InferredGrammar`-shaped inputs by pulling
 * axes from the Profile's `token_grammar` and member tokens from the
 * provided tokens list (filtered by each grammar's pattern). Delegates
 * to `aggregateRawMaterial` for the actual counting.
 *
 * Axis values are resolved from the Profile's `vocabularies:` when an
 * axis declares `vocabulary: <name>`; otherwise the axis's inline
 * `values:` are used.
 *
 * Phase-2 interview consumes the result directly; no structural
 * inference runs on this path.
 */
export function enrichRawMaterial(
  profile: DSProfile,
  tokens: ScaffoldInputToken[],
  components: ScaffoldInputComponent[],
  options: AggregateOptions = {},
): Phase2RawMaterial {
  const grammars = reconstructGrammars(profile, tokens);
  return aggregateRawMaterial(grammars, components, options);
}

function reconstructGrammars(
  profile: DSProfile,
  tokens: ScaffoldInputToken[],
): InferredGrammar[] {
  const out: InferredGrammar[] = [];
  for (const [name, grammar] of Object.entries(profile.token_grammar ?? {})) {
    const patternSegs = grammar.pattern.split(".");
    const axes = resolveAxes(grammar, patternSegs, profile.vocabularies ?? {});
    const members = tokens.filter((t) =>
      refMatches(t.path.split("."), patternSegs),
    );
    out.push({
      name,
      pattern: grammar.pattern,
      dtcg_type: grammar.dtcg_type,
      axes,
      members,
    });
  }
  return out;
}

function resolveAxes(
  grammar: DSProfile["token_grammar"][string],
  patternSegs: string[],
  vocabularies: DSProfile["vocabularies"],
): InferredGrammar["axes"] {
  const axes: InferredGrammar["axes"] = [];
  const declared = grammar.axes ?? {};
  for (let i = 0; i < patternSegs.length; i++) {
    const seg = patternSegs[i];
    if (!seg.startsWith("{") || !seg.endsWith("}")) continue;
    const placeholder = seg.slice(1, -1);
    const spec = declared[placeholder] as
      | { values?: string[]; vocabulary?: string }
      | undefined;
    let values: string[] = [];
    if (spec) {
      if (spec.values && spec.values.length > 0) {
        values = [...spec.values];
      } else if (spec.vocabulary) {
        values = [...(vocabularies[spec.vocabulary]?.values ?? [])];
      }
    }
    axes.push({ placeholder, position: i, values });
  }
  return axes;
}

function buildGrammarUsage(
  grammar: InferredGrammar,
  components: ScaffoldInputComponent[],
  componentCategories: Record<string, string[]>,
): GrammarUsage {
  const usageMatrix: Record<string, Record<string, number>> = {};
  for (const axis of grammar.axes) usageMatrix[axis.placeholder] = {};

  const perComponent: ComponentBinding[] = [];
  const correlation: Record<string, Record<string, Set<string>>> = {};
  const hasCategories = Object.keys(componentCategories).length > 0;
  if (hasCategories) {
    for (const axis of grammar.axes) correlation[axis.placeholder] = {};
  }

  const patternSegs = grammar.pattern.split(".");

  for (const c of components) {
    if (!c.token_refs) continue;
    const axisSets: Record<string, Set<string>> = {};
    for (const axis of grammar.axes) axisSets[axis.placeholder] = new Set();
    let hasMatch = false;
    const cats = componentCategories[c.name] ?? [];

    for (const ref of c.token_refs) {
      const segs = ref.split(".");
      if (!refMatches(segs, patternSegs)) continue;
      hasMatch = true;
      for (const axis of grammar.axes) {
        const v = segs[axis.position];
        const counts = usageMatrix[axis.placeholder];
        counts[v] = (counts[v] ?? 0) + 1;
        axisSets[axis.placeholder].add(v);
        if (hasCategories) {
          const axisMap = correlation[axis.placeholder];
          const valueSet = axisMap[v] ?? (axisMap[v] = new Set<string>());
          for (const cat of cats) valueSet.add(cat);
        }
      }
    }

    if (hasMatch) {
      const axisValues: Record<string, string[]> = {};
      for (const axis of grammar.axes) {
        axisValues[axis.placeholder] = [...axisSets[axis.placeholder]].sort();
      }
      perComponent.push({ component: c.name, axisValues });
    }
  }

  return {
    sparsity: computeSparsity(grammar),
    usageMatrix,
    perComponent,
    axisCategoryCorrelation: hasCategories
      ? freezeCorrelation(correlation)
      : {},
  };
}

function freezeCorrelation(
  src: Record<string, Record<string, Set<string>>>,
): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const [axis, valueMap] of Object.entries(src)) {
    const frozen: Record<string, string[]> = {};
    for (const [value, cats] of Object.entries(valueMap)) {
      frozen[value] = [...cats].sort();
    }
    out[axis] = frozen;
  }
  return out;
}

function computeSparsity(grammar: InferredGrammar): SparsityMetric {
  const totalSlots = grammar.axes.reduce(
    (acc, a) => acc * a.values.length,
    1,
  );
  if (grammar.axes.length === 0) {
    // A literal-only pattern is a single slot; bound iff any member exists.
    const boundSlots = grammar.members.length > 0 ? 1 : 0;
    return { boundSlots, totalSlots: 1, ratio: boundSlots };
  }
  const seen = new Set<string>();
  for (const t of grammar.members) {
    const segs = t.path.split(".");
    const key = grammar.axes.map((a) => segs[a.position]).join("\u0001");
    seen.add(key);
  }
  const boundSlots = seen.size;
  return {
    boundSlots,
    totalSlots,
    ratio: totalSlots === 0 ? 0 : boundSlots / totalSlots,
  };
}

function refMatches(refSegs: string[], patternSegs: string[]): boolean {
  if (refSegs.length !== patternSegs.length) return false;
  for (let i = 0; i < patternSegs.length; i++) {
    const p = patternSegs[i];
    if (p.startsWith("{") && p.endsWith("}")) continue;
    if (refSegs[i] !== p) return false;
  }
  return true;
}
