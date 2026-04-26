/**
 * Vocabulary inference — scan component properties across all components,
 * group by property-name, and decide per group: single merged vocabulary
 * (≥50% value overlap) or clash (disjoint-enough to need Milestone 1
 * resolution).
 *
 * Design §3.3. D1 (prior-art cascade) happens in the scaffoldProfile()
 * caller, not here — inference stays side-effect-free and prior-art-blind.
 */

import type { ScaffoldInputComponent } from "./input-parser.js";

export interface VocabularySource {
  component: string;
  property: string;
  values: string[];
}

export interface InferredVocabulary {
  name: string;
  values: string[];
  sources: VocabularySource[];
}

export interface ClashGroup {
  components: string[];
  values: string[];
}

export interface VocabularyClashCandidate {
  propertyName: string;
  groups: ClashGroup[];
  /** Max pairwise Jaccard overlap across groups (0 = fully disjoint). */
  overlapRatio: number;
}

export interface VocabInferenceResult {
  vocabularies: InferredVocabulary[];
  clashes: VocabularyClashCandidate[];
}

/** Two value-sets are considered the same concept above this overlap. */
const MERGE_THRESHOLD = 0.5;

export function inferVocabularies(
  components: ScaffoldInputComponent[],
): VocabInferenceResult {
  const byPropName = collectVariantProperties(components);
  const vocabularies: InferredVocabulary[] = [];
  const clashes: VocabularyClashCandidate[] = [];

  for (const [propName, sources] of byPropName) {
    const groups = clusterByOverlap(sources);

    if (groups.length === 1) {
      vocabularies.push(toVocabulary(propName, groups[0]));
      continue;
    }

    // Multiple groups — clash. Record per-group component + value sets.
    const clashGroups: ClashGroup[] = groups.map((group) => ({
      components: group.map((s) => s.component),
      values: unionValues(group),
    }));

    clashes.push({
      propertyName: propName,
      groups: clashGroups,
      overlapRatio: maxPairwiseOverlap(clashGroups),
    });
  }

  return { vocabularies, clashes };
}

// ─── Collection ─────────────────────────────────────────────────────────────

function collectVariantProperties(
  components: ScaffoldInputComponent[],
): Map<string, VocabularySource[]> {
  const byName = new Map<string, VocabularySource[]>();
  for (const c of components) {
    for (const p of c.properties) {
      if (p.type !== "variant") continue;
      if (!p.values || p.values.length === 0) continue;
      const list = byName.get(p.name) ?? [];
      list.push({ component: c.name, property: p.name, values: p.values });
      byName.set(p.name, list);
    }
  }
  return byName;
}

// ─── Overlap clustering ─────────────────────────────────────────────────────

/**
 * Greedy agglomerative cluster: place each source in the first group
 * whose union shares ≥ MERGE_THRESHOLD of values (by smaller-set
 * Jaccard-like overlap); otherwise start a new group.
 */
function clusterByOverlap(sources: VocabularySource[]): VocabularySource[][] {
  const groups: VocabularySource[][] = [];
  for (const src of sources) {
    let placed = false;
    for (const group of groups) {
      const groupValues = new Set(unionValues(group));
      const srcValues = new Set(src.values);
      if (overlapRatio(groupValues, srcValues) >= MERGE_THRESHOLD) {
        group.push(src);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([src]);
  }
  return groups;
}

/** Overlap = |A ∩ B| / min(|A|, |B|). Empty sets → 0. */
function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const v of a) if (b.has(v)) intersection++;
  return intersection / Math.min(a.size, b.size);
}

function maxPairwiseOverlap(groups: ClashGroup[]): number {
  let max = 0;
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const ratio = overlapRatio(
        new Set(groups[i].values),
        new Set(groups[j].values),
      );
      if (ratio > max) max = ratio;
    }
  }
  return max;
}

// ─── Shape helpers ──────────────────────────────────────────────────────────

function unionValues(sources: VocabularySource[]): string[] {
  const out = new Set<string>();
  for (const s of sources) for (const v of s.values) out.add(v);
  return [...out];
}

function toVocabulary(name: string, sources: VocabularySource[]): InferredVocabulary {
  return {
    name,
    values: unionValues(sources),
    sources,
  };
}
