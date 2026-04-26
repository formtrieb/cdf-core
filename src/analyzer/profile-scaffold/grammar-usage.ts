/**
 * Grammar-usage annotation (D2b) — the LLM-authoring-critical surface.
 *
 * For each inferred grammar:
 *   - `used_by`: component names whose `token_refs[]` resolve into the
 *     grammar's pattern (structural match, literals exact, placeholders
 *     wild).
 *   - Description: prior-art-seeded when a structurally-matching
 *     grammar exists in `cdf/examples/*.profile.yaml`; generic template
 *     otherwise.
 *
 * Warning emitted when no component supplies `token_refs` — LLMs
 * consuming the Profile will have less structural context.
 *
 * Design §3.6.
 */

import type { InferredGrammar } from "./token-inference.js";
import type { ScaffoldInputComponent } from "./input-parser.js";
import type { PriorArtIndex, PriorArtGrammar } from "./prior-art.js";

export interface GrammarUsageAnnotation {
  grammarName: string;
  used_by: string[];
  description: string;
}

export interface GrammarUsageResult {
  annotations: GrammarUsageAnnotation[];
  warnings: string[];
}

export function annotateGrammarUsage(
  grammars: InferredGrammar[],
  components: ScaffoldInputComponent[],
  priorArt: PriorArtIndex,
): GrammarUsageResult {
  const annotations: GrammarUsageAnnotation[] = [];
  const warnings: string[] = [];

  const anyRefs = components.some((c) => c.token_refs && c.token_refs.length > 0);
  if (!anyRefs && grammars.length > 0) {
    warnings.push(
      "No token_refs provided in ScaffoldInput.components — grammar-usage annotation skipped. " +
        "LLMs consuming this Profile will have less structural context when authoring " +
        "components; consider extracting token_refs via Figma Dev Mode / Code Connect.",
    );
  }

  for (const g of grammars) {
    const used_by = computeUsedBy(g, components);
    const priorMatch = findPriorArtMatch(g, priorArt);
    annotations.push({
      grammarName: g.name,
      used_by,
      description: priorMatch
        ? seedFromPriorArt(g, priorMatch)
        : genericDescription(g),
    });
  }

  return { annotations, warnings };
}

// ─── used_by computation ────────────────────────────────────────────────────

function computeUsedBy(
  grammar: InferredGrammar,
  components: ScaffoldInputComponent[],
): string[] {
  const out = new Set<string>();
  const patternSegs = grammar.pattern.split(".");

  for (const c of components) {
    if (!c.token_refs) continue;
    if (c.token_refs.some((ref) => matchesPattern(ref, patternSegs))) {
      out.add(c.name);
    }
  }
  return [...out].sort();
}

function matchesPattern(ref: string, patternSegs: string[]): boolean {
  const refSegs = ref.split(".");
  if (refSegs.length !== patternSegs.length) return false;
  for (let i = 0; i < patternSegs.length; i++) {
    if (isPlaceholder(patternSegs[i])) continue;
    if (refSegs[i] !== patternSegs[i]) return false;
  }
  return true;
}

function isPlaceholder(seg: string): boolean {
  return seg.startsWith("{") && seg.endsWith("}");
}

// ─── Prior-art seeding ──────────────────────────────────────────────────────

/**
 * A structural match ignores placeholder names — `color.{x}.{y}.{z}`
 * matches `color.{hierarchy}.{element}.{state}` because both have
 * depth 4, root literal "color", and three placeholders in the same
 * positions.
 */
function findPriorArtMatch(
  grammar: InferredGrammar,
  priorArt: PriorArtIndex,
): PriorArtGrammar | undefined {
  const selfShape = structuralShape(grammar.pattern);
  for (const candidate of priorArt.grammarPatterns) {
    if (structuralShape(candidate.pattern) === selfShape) return candidate;
  }
  return undefined;
}

/** Collapse a pattern into a placeholder-name-agnostic shape. */
function structuralShape(pattern: string): string {
  return pattern
    .split(".")
    .map((seg) => (isPlaceholder(seg) ? "{}" : seg))
    .join(".");
}

function seedFromPriorArt(
  grammar: InferredGrammar,
  match: PriorArtGrammar,
): string {
  const sources = match.usedInDSes.join(", ");
  const examples = placeholdersFromPattern(match.pattern);
  const hint =
    examples.length > 0
      ? ` (e.g. ${examples.map((n) => `\`{${n}}\``).join(", ")})`
      : "";
  return (
    `Scaffold-inferred grammar matching the structural shape of ${sources} ` +
    `(pattern \`${match.pattern}\`). Axes: ` +
    summariseAxes(grammar) +
    `. Review the description and rename axis placeholders to match your ` +
    `DS's vocabulary${hint}.`
  );
}

/** Extract `{name}` placeholders from a pattern string, in order. */
function placeholdersFromPattern(pattern: string): string[] {
  return [...pattern.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

function genericDescription(grammar: InferredGrammar): string {
  return (
    `Scaffold-inferred grammar for the \`${grammar.name}\` family. Axes: ` +
    summariseAxes(grammar) +
    ". Review and rename axis placeholders to match your DS's vocabulary."
  );
}

function summariseAxes(grammar: InferredGrammar): string {
  if (grammar.axes.length === 0) return "(none)";
  return grammar.axes
    .map(
      (a) =>
        `\`{${a.placeholder}}\` ∈ [${a.values.slice(0, 5).join(", ")}${
          a.values.length > 5 ? ", …" : ""
        }]`,
    )
    .join("; ");
}
