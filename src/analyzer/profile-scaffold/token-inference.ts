/**
 * Token inference — decide per root-segment whether a group is flat
 * (→ standalone_tokens) or grammar (→ token_grammar). Borderline groups
 * are surfaced as Milestone-2 candidates for elicitation.
 *
 * Design §3.2.
 */

import type { ScaffoldInputToken, TokenType } from "./input-parser.js";

export interface InferredGrammarAxis {
  /** Generic placeholder name, e.g. "axis0", "axis1". Renamed downstream
   *  when a vocabulary match is found (D2). */
  placeholder: string;
  /** 1-indexed position within the pattern (position 0 is the root literal). */
  position: number;
  /** Distinct values observed at this position, sorted alphabetically. */
  values: string[];
}

export interface InferredGrammar {
  /** Root segment (e.g. "color", "spacing") — used as the grammar key
   *  in the emitted Profile. */
  name: string;
  /** Concrete pattern with literal segments and `{placeholder}` slots. */
  pattern: string;
  /** Majority token type in the group; maps 1:1 to DTCG type. */
  dtcg_type: string;
  axes: InferredGrammarAxis[];
  /** Tokens belonging to this grammar — preserved for downstream
   *  grammar-usage annotation (D2b). */
  members: ScaffoldInputToken[];
}

export interface InferredStandaloneToken {
  path: string;
  dtcg_type: string;
  value: string | number;
}

export interface BorderlineGroup {
  root: string;
  memberCount: number;
  depthConsistent: boolean;
  proposedAction: "flat" | "grammar";
  reason: string;
  /** Tokens in the group — retained so the orchestrator can promote the
   *  group into a grammar when the Milestone-2 resolution chooses so. */
  members: ScaffoldInputToken[];
  /** Consistent depth of the group; undefined when depths differ. */
  depth: number | undefined;
}

export interface TokenInferenceResult {
  grammars: InferredGrammar[];
  standaloneTokens: InferredStandaloneToken[];
  borderline: BorderlineGroup[];
}

const GRAMMAR_MIN_TOKENS = 10;
const FLAT_MAX_TOKENS = 5;
const GRAMMAR_MIN_DEPTH = 3;
/** Large mixed-depth root groups (≥ this count) trigger a sub-group pass
 *  keyed by (root + next-segment) so a consistent-depth family nested
 *  inside doesn't get dumped wholesale to standalone_tokens. (M-1) */
const SUBGROUP_MIN_TOKENS = GRAMMAR_MIN_TOKENS * 2;

export function inferTokenStructure(
  tokens: ScaffoldInputToken[],
): TokenInferenceResult {
  if (tokens.length === 0) {
    return { grammars: [], standaloneTokens: [], borderline: [] };
  }

  const groupsByRoot = groupByRoot(tokens);

  const grammars: InferredGrammar[] = [];
  const standaloneTokens: InferredStandaloneToken[] = [];
  const borderline: BorderlineGroup[] = [];

  for (const [root, group] of groupsByRoot) {
    classifyGroup(root, group, grammars, standaloneTokens, borderline);
  }

  return { grammars, standaloneTokens, borderline };
}

/**
 * Classify a group (rooted at `rootKey`, which may be one or multiple
 * dotted segments) into one of flat / grammar / borderline / recurse.
 * Mutates the three output arrays in place. Recurses when a large root
 * group has inconsistent depths — splits by the segment immediately
 * after `rootKey` and re-classifies each sub-group. (M-1)
 */
function classifyGroup(
  rootKey: string,
  group: ScaffoldInputToken[],
  grammars: InferredGrammar[],
  standaloneTokens: InferredStandaloneToken[],
  borderline: BorderlineGroup[],
): void {
  const depths = group.map((t) => t.path.split(".").length);
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  const depthConsistent = minDepth === maxDepth;
  const depth = minDepth;

  if (group.length <= FLAT_MAX_TOKENS) {
    standaloneTokens.push(...group.map(toStandaloneToken));
    return;
  }

  if (!depthConsistent && group.length >= SUBGROUP_MIN_TOKENS) {
    const subGroups = subGroupByNextSegment(rootKey, group);
    // Recurse only if partitioning actually split the group — a single
    // bucket means every token shares the next segment, so re-running
    // would loop with the same input.
    if (subGroups.size > 1) {
      for (const [subKey, subGroup] of subGroups) {
        classifyGroup(subKey, subGroup, grammars, standaloneTokens, borderline);
      }
      return;
    }
  }

  if (!depthConsistent) {
    standaloneTokens.push(...group.map(toStandaloneToken));
    return;
  }

  if (group.length >= GRAMMAR_MIN_TOKENS && depth >= GRAMMAR_MIN_DEPTH) {
    grammars.push(extractGrammar(rootKey, group, depth));
    return;
  }

  // Borderline: 6–9 tokens, consistent depth ≥3, OR ≥10 but shallow.
  // Default proposal is "flat" (conservative — only upgrade to grammar
  // on explicit elicitation resolution).
  borderline.push({
    root: rootKey,
    memberCount: group.length,
    depthConsistent,
    proposedAction: "flat",
    reason:
      depth < GRAMMAR_MIN_DEPTH
        ? `depth ${depth} < minimum ${GRAMMAR_MIN_DEPTH} — too shallow to pattern`
        : `${group.length} tokens in the 6-9 borderline window — could go either way`,
    members: [...group],
    depth: depthConsistent ? depth : undefined,
  });
  // Emit as flat by default so output is always complete; the
  // borderline entry tells the caller to elicit if desired.
  standaloneTokens.push(...group.map(toStandaloneToken));
}

/**
 * Convert a borderline group into a grammar by force — used when the
 * Milestone-2 resolution is `accept-grammar`. Returns `undefined` for
 * groups that lack a consistent depth ≥2 (no axis to place).
 */
export function promoteBorderlineToGrammar(
  group: BorderlineGroup,
): InferredGrammar | undefined {
  if (group.depth === undefined || group.depth < 2) return undefined;
  return extractGrammar(group.root, group.members, group.depth);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function groupByRoot(tokens: ScaffoldInputToken[]): Map<string, ScaffoldInputToken[]> {
  const out = new Map<string, ScaffoldInputToken[]>();
  for (const t of tokens) {
    const root = t.path.split(".")[0];
    const list = out.get(root) ?? [];
    list.push(t);
    out.set(root, list);
  }
  return out;
}

/**
 * Partition `tokens` by the segment immediately after the `rootKey`
 * prefix — i.e. position `rootKey.split(".").length`. Tokens that end
 * AT the rootKey level (no further segment) go to a synthetic `""`
 * bucket so the caller's flat-path handler can emit them as standalone.
 */
function subGroupByNextSegment(
  rootKey: string,
  tokens: ScaffoldInputToken[],
): Map<string, ScaffoldInputToken[]> {
  const prefixSegCount = rootKey.split(".").length;
  const out = new Map<string, ScaffoldInputToken[]>();
  for (const t of tokens) {
    const segs = t.path.split(".");
    const key =
      segs.length > prefixSegCount ? `${rootKey}.${segs[prefixSegCount]}` : rootKey;
    const list = out.get(key) ?? [];
    list.push(t);
    out.set(key, list);
  }
  return out;
}

function extractGrammar(
  root: string,
  tokens: ScaffoldInputToken[],
  depth: number,
): InferredGrammar {
  // `root` may be one or multiple dotted segments (e.g. "color" at the
  // top level, "color.controls" inside a recursive sub-group pass). For
  // each position beyond the root prefix, collect the distinct values:
  // positions with exactly one value stay as literals, multi-value ones
  // become placeholders.
  const rootSegCount = root.split(".").length;
  const segmentsPerPos: Set<string>[] = [];
  for (let i = 0; i < depth; i++) segmentsPerPos.push(new Set<string>());

  for (const t of tokens) {
    const segs = t.path.split(".");
    for (let i = 0; i < depth; i++) segmentsPerPos[i].add(segs[i]);
  }

  const patternParts: string[] = [root];
  const axes: InferredGrammarAxis[] = [];
  let axisCounter = 0;

  for (let i = rootSegCount; i < depth; i++) {
    const values = [...segmentsPerPos[i]].sort();
    if (values.length === 1) {
      patternParts.push(values[0]);
    } else {
      const placeholder = `axis${axisCounter++}`;
      patternParts.push(`{${placeholder}}`);
      axes.push({ placeholder, position: i, values });
    }
  }

  return {
    name: root,
    pattern: patternParts.join("."),
    dtcg_type: majorityType(tokens),
    axes,
    members: tokens,
  };
}

function majorityType(tokens: ScaffoldInputToken[]): string {
  const counts = new Map<TokenType, number>();
  for (const t of tokens) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
  let best: TokenType | undefined;
  let bestCount = -1;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best ?? "string";
}

function toStandaloneToken(t: ScaffoldInputToken): InferredStandaloneToken {
  return { path: t.path, dtcg_type: t.type, value: t.value };
}
