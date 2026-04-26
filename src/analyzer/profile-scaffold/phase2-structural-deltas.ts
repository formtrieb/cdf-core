/**
 * Phase-2 structural deltas — the applier that rewrites a token set
 * in response to user prose corrections surfaced during the interview.
 *
 * Three delta kinds are supported:
 *   - `rename-axis-value`: safe rename within an axis; doesn't affect
 *     cartesian shape. (D3 "Axis-value-rename" band.)
 *   - `remove-axis`: drops an axis entirely — collapses tokens along
 *     that position; survivors deduplicated by path. (D3 "Structural-
 *     invalidation" band.)
 *   - `rename-grammar`: renames the grammar's root segment.
 *
 * Deltas reference grammar + axis by name (the names the client LLM
 * sees in the Profile). Positions are resolved from the supplied
 * `grammars[]` snapshot. Pure function — no I/O.
 *
 * Per hard rule, the orchestrator that invokes this MUST NOT
 * re-trigger Phase-1 milestones on the resulting re-inference.
 */

import type { InferredGrammar } from "./token-inference.js";
import type { ScaffoldInputToken } from "./input-parser.js";

export type StructuralDelta =
  | {
      kind: "rename-axis-value";
      grammar: string;
      axis: string;
      from: string;
      to: string;
    }
  | { kind: "remove-axis"; grammar: string; axis: string }
  | { kind: "rename-grammar"; from: string; to: string };

export function applyStructuralDeltas(
  tokens: ScaffoldInputToken[],
  deltas: StructuralDelta[],
  grammars: InferredGrammar[],
): ScaffoldInputToken[] {
  let out = tokens.map((t) => ({ ...t }));
  for (const delta of deltas) {
    out = applyOne(out, delta, grammars);
  }
  return out;
}

function applyOne(
  tokens: ScaffoldInputToken[],
  delta: StructuralDelta,
  grammars: InferredGrammar[],
): ScaffoldInputToken[] {
  if (delta.kind === "rename-axis-value") {
    const { grammar, axis, from, to } = delta;
    const g = grammars.find((x) => x.name === grammar);
    if (!g) return tokens;
    const a = g.axes.find((x) => x.placeholder === axis);
    if (!a) return tokens;
    const patternSegs = g.pattern.split(".");
    return tokens.map((t) => {
      const segs = t.path.split(".");
      if (!pathMatchesGrammar(segs, patternSegs)) return t;
      if (segs[a.position] !== from) return t;
      const next = [...segs];
      next[a.position] = to;
      return { ...t, path: next.join(".") };
    });
  }
  if (delta.kind === "rename-grammar") {
    const { from, to } = delta;
    const g = grammars.find((x) => x.name === from);
    if (!g) return tokens;
    const patternSegs = g.pattern.split(".");
    return tokens.map((t) => {
      const segs = t.path.split(".");
      if (!pathMatchesGrammar(segs, patternSegs)) return t;
      const next = [to, ...segs.slice(1)];
      return { ...t, path: next.join(".") };
    });
  }
  if (delta.kind === "remove-axis") {
    const { grammar, axis } = delta;
    const g = grammars.find((x) => x.name === grammar);
    if (!g) return tokens;
    const a = g.axes.find((x) => x.placeholder === axis);
    if (!a) return tokens;
    const patternSegs = g.pattern.split(".");
    const seen = new Set<string>();
    const out: ScaffoldInputToken[] = [];
    for (const t of tokens) {
      const segs = t.path.split(".");
      if (!pathMatchesGrammar(segs, patternSegs)) {
        out.push(t);
        continue;
      }
      const next = segs.filter((_, i) => i !== a.position).join(".");
      if (seen.has(next)) continue;
      seen.add(next);
      out.push({ ...t, path: next });
    }
    return out;
  }
  return tokens;
}

function pathMatchesGrammar(segs: string[], patternSegs: string[]): boolean {
  if (segs.length !== patternSegs.length) return false;
  for (let i = 0; i < patternSegs.length; i++) {
    const p = patternSegs[i];
    if (p.startsWith("{") && p.endsWith("}")) continue;
    if (segs[i] !== p) return false;
  }
  return true;
}
