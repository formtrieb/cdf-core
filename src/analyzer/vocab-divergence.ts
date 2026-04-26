import type { CDFComponent } from "../types/cdf.js";
import type { DSProfile } from "../types/profile.js";

export interface ValueUsage {
  value: string;
  used_in: Array<{ component: string; path: string }>;
  count: number;
}

export interface Evidence {
  self_usage_majority?: { value: string; ratio: string };
  prior_art?: { value: string; ratio: string; sources: string[] };
  profile_declared?: string;
  spec_preference?: string;
}

export interface Recommendation {
  /**
   * v1.1.0 A2 scope: only `rename` or `skip`. `alias` was reserved for
   * case (c) synonym-table detection (A4) and is deliberately absent
   * until that path ships. Re-widen explicitly if / when it does —
   * see docs/plans/2026-04-18-cdf-vocab-diverge-design.md §2.3.
   */
  action: "rename" | "skip";
  canonical: string;
  rename?: string[];
  rationale: string;
  evidence: Evidence;
}

export interface Divergence {
  id: string;
  concept: string;
  severity: "high" | "medium" | "low";
  values: ValueUsage[];
  recommendation: Recommendation;
}

export interface DetectOpts {
  conceptFilter?: string;
  /** Max Levenshtein distance to consider two values near-misses. */
  maxDistance?: number;
}

const DEFAULT_MAX_DISTANCE = 2;

export function detectVocabDivergences(
  profile: DSProfile,
  components: CDFComponent[],
  opts: DetectOpts = {},
): Divergence[] {
  const maxDistance = opts.maxDistance ?? DEFAULT_MAX_DISTANCE;
  return [
    ...detectVocabDrift(profile, components, maxDistance, opts.conceptFilter),
    ...detectStatesDrift(profile, components, maxDistance, opts.conceptFilter),
  ];
}

// ─── Case (a) — Profile vocabulary drift ────────────────────────────────────

function detectVocabDrift(
  profile: DSProfile,
  components: CDFComponent[],
  maxDistance: number,
  conceptFilter: string | undefined,
): Divergence[] {
  const divergences: Divergence[] = [];

  for (const [vocabName, vocab] of Object.entries(profile.vocabularies)) {
    const conceptPath = `vocabularies.${vocabName}`;
    if (conceptFilter && conceptFilter !== conceptPath) continue;

    const declared = new Set(vocab.values);
    const usagesByValue = collectVocabUsages(components, vocabName);

    for (const [value, usages] of usagesByValue) {
      if (declared.has(value)) continue;
      const canonical = nearestDeclared(value, vocab.values, maxDistance);
      if (!canonical) continue;

      divergences.push(
        buildDivergence(conceptPath, canonical, value, usagesByValue, maxDistance),
      );
    }
  }

  return divergences;
}

// ─── Case (b) — interaction-pattern states drift ────────────────────────────

function detectStatesDrift(
  profile: DSProfile,
  components: CDFComponent[],
  maxDistance: number,
  conceptFilter: string | undefined,
): Divergence[] {
  const divergences: Divergence[] = [];
  const patterns = Object.entries(profile.interaction_patterns ?? {});
  if (patterns.length === 0) return divergences;

  // Union of all declared states across all patterns — used to skip
  // component state keys that are valid in at least one pattern.
  const declaredUnion = new Set<string>();
  for (const [, pattern] of patterns) for (const s of pattern.states) declaredUnion.add(s);

  const usagesByKey = collectStateKeyUsages(components);

  for (const [stateKey, usages] of usagesByKey) {
    if (declaredUnion.has(stateKey)) continue;

    // Find the pattern whose declared states have the closest match.
    let bestMatch: { patternName: string; canonical: string; distance: number } | undefined;
    for (const [patternName, pattern] of patterns) {
      const canonical = nearestDeclared(stateKey, pattern.states, maxDistance);
      if (!canonical) continue;
      const distance = levenshtein(stateKey, canonical);
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { patternName, canonical, distance };
      }
    }
    if (!bestMatch) continue;

    const conceptPath = `interaction_patterns.${bestMatch.patternName}.states`;
    if (conceptFilter && conceptFilter !== conceptPath) continue;

    divergences.push(
      buildDivergence(conceptPath, bestMatch.canonical, stateKey, usagesByKey, maxDistance),
    );
  }

  return divergences;
}

// ─── Shared divergence builder ──────────────────────────────────────────────

function buildDivergence(
  conceptPath: string,
  canonical: string,
  outlier: string,
  usagesByValue: Map<string, Array<{ component: string; path: string }>>,
  maxDistance: number,
): Divergence {
  const canonicalUsages = usagesByValue.get(canonical) ?? [];
  const outlierUsages = usagesByValue.get(outlier) ?? [];
  const values: ValueUsage[] = [
    { value: canonical, used_in: canonicalUsages, count: canonicalUsages.length },
    { value: outlier, used_in: outlierUsages, count: outlierUsages.length },
  ];

  const evidence: Evidence = { profile_declared: canonical };
  if (canonicalUsages.length > 0) {
    const total = canonicalUsages.length + outlierUsages.length;
    evidence.self_usage_majority = {
      value: canonical,
      ratio: `${canonicalUsages.length}/${total}`,
    };
  }

  return {
    id: divergenceId(conceptPath, [canonical, outlier]),
    concept: conceptPath,
    severity: gradeSeverity(canonicalUsages.length, outlierUsages.length),
    values,
    recommendation: {
      action: "rename",
      canonical,
      rename: [outlier],
      rationale:
        `Profile declares \`${canonical}\` in ${conceptPath}; ` +
        `\`${outlier}\` is not declared and is a near-miss (Levenshtein ≤${maxDistance}).`,
      evidence,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Collect every observed value for `vocabName` across components, along with
 * the path where it was referenced. A value is attributed to `vocabName` when
 * it appears in `component.properties[propName].values` AND the property's
 * `type` field names the vocab (Profile-vocabulary type shorthand per §7.11
 * of CDF-COMPONENT-SPEC).
 */
function collectVocabUsages(
  components: CDFComponent[],
  vocabName: string,
): Map<string, Array<{ component: string; path: string }>> {
  const out = new Map<string, Array<{ component: string; path: string }>>();
  for (const comp of components) {
    const props = comp.properties ?? {};
    for (const [propName, prop] of Object.entries(props)) {
      if (prop.type !== vocabName) continue;
      for (const value of prop.values ?? []) {
        const list = out.get(value) ?? [];
        list.push({ component: comp.name, path: `properties.${propName}.values[${value}]` });
        out.set(value, list);
      }
    }
  }
  return out;
}

/**
 * Collect every component state-key (the key of `component.states`) along
 * with where it was declared. Used for case (b) interaction-pattern drift.
 */
function collectStateKeyUsages(
  components: CDFComponent[],
): Map<string, Array<{ component: string; path: string }>> {
  const out = new Map<string, Array<{ component: string; path: string }>>();
  for (const comp of components) {
    const states = comp.states ?? {};
    for (const key of Object.keys(states)) {
      const list = out.get(key) ?? [];
      list.push({ component: comp.name, path: `states.${key}` });
      out.set(key, list);
    }
  }
  return out;
}

function nearestDeclared(value: string, declared: string[], maxDistance: number): string | undefined {
  let best: { value: string; distance: number } | undefined;
  for (const candidate of declared) {
    const d = levenshtein(value, candidate);
    if (d === 0) return candidate;
    if (d > maxDistance) continue;
    if (!best || d < best.distance) best = { value: candidate, distance: d };
  }
  return best?.value;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function divergenceId(concept: string, sortedValues: string[]): string {
  const sorted = [...sortedValues].sort().join("|");
  return `${concept}::${sorted}`;
}

/**
 * Severity grading — evidence-strength of the divergence claim.
 *
 * - `high`: outlier is a lone dissenter (count 1) AND canonical has ≥1
 *   peer usage. Classic "everyone agrees except one" pattern.
 * - `medium`: strong majority (≥80%) agrees, but outlier occurs more than
 *   once — drift has spread.
 * - `low`: contested (<80%), OR canonical has zero self-usage (Profile-
 *   declared only, no peer evidence of the canonical in practice).
 *
 * Consumers can filter or prioritise elicitation by severity — highest
 * first, within the P1 cap-of-3.
 */
function gradeSeverity(
  canonicalCount: number,
  outlierCount: number,
): "high" | "medium" | "low" {
  if (canonicalCount === 0) return "low";
  if (outlierCount === 1) return "high";
  const ratio = canonicalCount / (canonicalCount + outlierCount);
  return ratio >= 0.8 ? "medium" : "low";
}
