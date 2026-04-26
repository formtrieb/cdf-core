/**
 * `scaffoldProfile()` — Core orchestrator for `cdf_profile_scaffold`.
 *
 * Takes a ParsedScaffoldInput + options, runs all inference modules,
 * prepares milestone data (vocab-naming / grammar-pattern / base-state),
 * applies the three resolutions (user-supplied or default), assembles
 * a DSProfile, and emits comment-annotated YAML.
 *
 * The MCP adapter (Session 2) wraps this with elicitation: it calls
 * scaffoldProfile() once to get milestone data, elicits resolutions,
 * then calls it again with resolutions filled in. Pure core layer —
 * no filesystem writes, no elicitation, no MCP coupling.
 *
 * Design §3.
 */

import type { DSProfile, Vocabulary, TokenGrammar, StandaloneToken } from "../../types/profile.js";
import type {
  ParsedScaffoldInput,
  ScaffoldInputComponent,
  ScaffoldInputToken,
} from "./input-parser.js";
import { inferTokenStructure, promoteBorderlineToGrammar } from "./token-inference.js";
import type {
  InferredGrammar,
  InferredStandaloneToken,
  BorderlineGroup,
} from "./token-inference.js";
import { inferVocabularies } from "./vocab-inference.js";
import type {
  InferredVocabulary,
  VocabularyClashCandidate,
} from "./vocab-inference.js";
import { inferTheming } from "./theming-inference.js";
import { annotateGrammarUsage } from "./grammar-usage.js";
import type { PriorArtIndex } from "./prior-art.js";
import { emitProfileYaml } from "./emit.js";
import type { EmitDecision } from "./emit.js";
import { aggregateRawMaterial } from "./phase2-raw-material.js";
import type { Phase2RawMaterial } from "./phase2-raw-material.js";
import { applyStructuralDeltas } from "./phase2-structural-deltas.js";
import type { StructuralDelta } from "./phase2-structural-deltas.js";

// ─── Public types ───────────────────────────────────────────────────────────

export interface ScaffoldOptions {
  ds_name: string;
  ds_identifier: string;
  priorArt: PriorArtIndex;
  date?: string;
  /** Resolutions keyed by milestone_id. Unspecified -> default. */
  resolutions?: Record<string, unknown>;
  cdf_version?: string;
  dtcg_version?: string;
  sourceDescription?: string;
  /** Phase-2 re-inference trigger. When present and non-empty, the
   *  orchestrator applies the deltas to input tokens, re-runs inference,
   *  and SKIPS Phase-1 milestone preparation (hard loop-prevention rule
   *  — see Phase-2 design-doc §Architectural shift). */
  structuralDeltas?: StructuralDelta[];
}

export interface ScaffoldDecision {
  milestone_id: string;
  source: "user" | "auto" | "default";
  summary: string;
  rationale: string;
}

export interface VocabNamingMilestone {
  propertyName: string;
  groups: Array<{ components: string[]; values: string[] }>;
  overlapRatio: number;
  /** Recommended split names — first entry keeps propertyName; later entries
   *  prefer a prior-art vocab match, fall back to `propertyName_N` suffix. */
  recommendedNames: string[];
}

export interface GrammarPatternMilestone {
  root: string;
  memberCount: number;
  proposedAction: "flat" | "grammar";
  reason: string;
}

export interface BaseStateMilestone {
  tokenBaseState: string;
  propertyBaseState: string;
  recommendation: "align-to-default" | "align-to-rest" | "align-to-enabled";
  priorArtRatios: { default: number; rest: number; enabled: number };
}

export interface ScaffoldSummary {
  tokens_inferred: number;
  vocabularies_inferred: number;
  grammars_inferred: number;
  theming_modifiers_inferred: number;
}

export interface ScaffoldResult {
  profile: DSProfile;
  profileYaml: string;
  decisions: ScaffoldDecision[];
  milestones: {
    vocabNaming?: VocabNamingMilestone;
    grammarPattern?: GrammarPatternMilestone;
    baseState?: BaseStateMilestone;
  };
  warnings: string[];
  summary: ScaffoldSummary;
  /** Phase-2 raw material — aggregated usage data per grammar, consumed
   *  by the MCP adapter to seed the prose-interview phase. See
   *  `phase2-raw-material.ts` and the Phase-2 design-doc (D1 Medium). */
  rawMaterial: Phase2RawMaterial;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

const BASE_STATE_CANDIDATES = ["rest", "default", "enabled"] as const;

export function scaffoldProfile(
  input: ParsedScaffoldInput,
  options: ScaffoldOptions,
): ScaffoldResult {
  const warnings = [...input.warnings];
  const date = options.date ?? new Date().toISOString().slice(0, 10);

  // ─── Phase-2 re-inference: apply structural deltas, if any ────────────
  const hasDeltas =
    options.structuralDeltas !== undefined &&
    options.structuralDeltas.length > 0;
  let workingTokens = input.tokens;
  if (hasDeltas) {
    const priorInf = inferTokenStructure(input.tokens);
    workingTokens = applyStructuralDeltas(
      input.tokens,
      options.structuralDeltas!,
      priorInf.grammars,
    );
  }

  // ─── Inference passes ─────────────────────────────────────────────────
  const tokenInf = inferTokenStructure(workingTokens);
  const vocabInf = inferVocabularies(input.components);
  const theming = inferTheming(input.modes);

  if (input.components.length === 0) {
    warnings.push(
      "No components provided in ScaffoldInput — generated Profile has no vocabularies. " +
        "Declare vocabularies by hand or re-scaffold after authoring components.",
    );
  }

  // ─── Milestone preparation ────────────────────────────────────────────
  // Hard rule: Phase-2 re-runs (hasDeltas) MUST NOT re-populate Phase-1
  // milestones — this is the loop-prevention guardrail.
  const milestones: ScaffoldResult["milestones"] = {};
  // Every vocab clash becomes a milestone so later resolution can split
  // them all. Only the first surfaces via `milestones.vocabNaming` for
  // MCP elicitation (backward-compat); additional clashes apply default
  // resolution silently so they still reach the emitted Profile. (M-2)
  const vocabMilestones: VocabNamingMilestone[] = hasDeltas
    ? []
    : vocabInf.clashes.map((c) => buildVocabMilestone(c, options.priorArt));
  if (!hasDeltas) {
    if (vocabMilestones.length > 0) {
      milestones.vocabNaming = vocabMilestones[0];
    }
    if (tokenInf.borderline.length > 0) {
      milestones.grammarPattern = buildGrammarMilestone(tokenInf.borderline[0]);
    }
    const baseStateMs = detectBaseStateMismatch(
      workingTokens,
      input.components,
      options.priorArt,
    );
    if (baseStateMs) milestones.baseState = baseStateMs;
  }

  // ─── Resolve milestones ───────────────────────────────────────────────
  const decisions: ScaffoldDecision[] = [];
  const resolvedVocabs = applyVocabNamingResolutions(
    vocabInf.vocabularies,
    vocabMilestones,
    options.resolutions?.["vocab-naming"],
    options.priorArt,
    decisions,
  );

  // F2: grammar-pattern resolution is resolution-reactive. `accept-grammar`
  // promotes the borderline group from standalone_tokens into
  // token_grammar on the second pass; `flatten-standalone` keeps it flat.
  let finalGrammars: InferredGrammar[] = [...tokenInf.grammars];
  let finalStandalones: InferredStandaloneToken[] = [...tokenInf.standaloneTokens];
  if (milestones.grammarPattern && tokenInf.borderline.length > 0) {
    const borderline = tokenInf.borderline[0];
    const action = applyGrammarPatternResolution(
      options.resolutions?.["grammar-pattern"],
      milestones.grammarPattern,
      decisions,
    );
    if (action === "accept-grammar") {
      const promoted = promoteBorderlineToGrammar(borderline);
      if (promoted) {
        finalGrammars = [...finalGrammars, promoted];
        const rootPrefix = `${borderline.root}.`;
        finalStandalones = finalStandalones.filter(
          (s) => !s.path.startsWith(rootPrefix),
        );
      } else {
        warnings.push(
          `grammar-pattern resolution "accept-grammar" requested for root ` +
            `\`${borderline.root}\` but the group has no consistent depth ≥2 — ` +
            `cannot extract a pattern. Kept in standalone_tokens.`,
        );
      }
    }
  }
  if (milestones.baseState) {
    applyBaseStateResolution(
      options.resolutions?.["base-state"],
      milestones.baseState,
      decisions,
    );
  }

  // Annotate grammar-usage AFTER the borderline-promotion step so promoted
  // grammars receive their `used_by:` list + prior-art-seeded description.
  const usage = annotateGrammarUsage(
    finalGrammars,
    input.components,
    options.priorArt,
  );
  warnings.push(...usage.warnings);

  // ─── Assemble DSProfile ───────────────────────────────────────────────
  const profile: DSProfile = {
    name: options.ds_name,
    version: "1.0.0",
    cdf_version: options.cdf_version ?? ">=1.0.0 <2.0.0",
    dtcg_version: options.dtcg_version ?? "2025.10",
    description:
      `${options.ds_name} design system. Scaffold — review vocabularies, ` +
      `grammars, and descriptions; fill in placeholder values as needed.`,
    vocabularies: toProfileVocabularies(resolvedVocabs),
    token_grammar: toProfileGrammars(finalGrammars, usage.annotations),
    token_layers: [],
    standalone_tokens: toStandaloneTokens(finalStandalones),
    interaction_patterns: {},
    theming,
    naming: {
      css_prefix: `${options.ds_identifier}-`,
      token_prefix: `--${options.ds_identifier}-`,
      methodology: "BEM",
      pattern: "{prefix}{component}",
      casing: { component_names: "PascalCase", properties: "camelCase" },
      reserved_names: {},
    },
    categories: {},
  };

  // ─── Summary + emit ───────────────────────────────────────────────────
  const summary: ScaffoldSummary = {
    tokens_inferred: input.tokens.length,
    vocabularies_inferred: Object.keys(profile.vocabularies).length,
    grammars_inferred: Object.keys(profile.token_grammar).length,
    theming_modifiers_inferred: Object.keys(profile.theming.modifiers).length,
  };

  const profileYaml = emitProfileYaml(profile, {
    date,
    sourceDescription: options.sourceDescription,
    summary: buildSectionSummary(summary, {
      grammars: finalGrammars,
      standaloneTokens: finalStandalones,
    }),
    decisions: decisions.map(toEmitDecision),
  });

  const rawMaterial = aggregateRawMaterial(finalGrammars, input.components);

  return {
    profile,
    profileYaml,
    decisions,
    milestones,
    warnings,
    summary,
    rawMaterial,
  };
}

// ─── Milestone 1: vocab-naming ──────────────────────────────────────────────

function buildVocabMilestone(
  clash: VocabularyClashCandidate,
  priorArt: PriorArtIndex,
): VocabNamingMilestone {
  const recommendedNames: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < clash.groups.length; i++) {
    const group = clash.groups[i];
    if (i === 0) {
      recommendedNames.push(clash.propertyName);
      used.add(clash.propertyName);
      continue;
    }
    const priorArtName = findPriorArtVocabName(group.values, priorArt, used);
    if (priorArtName) {
      recommendedNames.push(priorArtName);
      used.add(priorArtName);
    } else {
      recommendedNames.push(`${clash.propertyName}_${i + 1}`);
    }
  }
  return {
    propertyName: clash.propertyName,
    groups: clash.groups,
    overlapRatio: clash.overlapRatio,
    recommendedNames,
  };
}

function findPriorArtVocabName(
  values: string[],
  priorArt: PriorArtIndex,
  exclude: Set<string>,
): string | undefined {
  const needle = new Set(values);
  let best: { name: string; overlap: number } | undefined;
  for (const [name, entry] of priorArt.vocabularies) {
    if (exclude.has(name)) continue;
    const overlap = countIntersection(needle, entry.commonValues);
    if (overlap === 0) continue;
    const ratio = overlap / Math.min(needle.size, entry.commonValues.size);
    if (!best || ratio > best.overlap) best = { name, overlap: ratio };
  }
  return best && best.overlap >= 0.5 ? best.name : undefined;
}

function countIntersection<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const v of a) if (b.has(v)) n++;
  return n;
}

/**
 * Resolve every vocab-naming milestone in sequence. Only the first
 * milestone (the one surfaced for MCP elicitation) receives the
 * user-provided `resolution`; subsequent clashes fall back to the
 * default action (`split-recommended`) so every clash still reaches
 * the emitted Profile. (M-2)
 */
function applyVocabNamingResolutions(
  vocabularies: InferredVocabulary[],
  milestones: VocabNamingMilestone[],
  resolution: unknown,
  priorArt: PriorArtIndex,
  decisions: ScaffoldDecision[],
): InferredVocabulary[] {
  let expanded = vocabularies;
  milestones.forEach((milestone, i) => {
    expanded = applyVocabNamingResolution(
      expanded,
      milestone,
      i === 0 ? resolution : undefined,
      priorArt,
      decisions,
    );
  });
  return expanded;
}

function applyVocabNamingResolution(
  vocabularies: InferredVocabulary[],
  milestone: VocabNamingMilestone | undefined,
  resolution: unknown,
  priorArt: PriorArtIndex,
  decisions: ScaffoldDecision[],
): InferredVocabulary[] {
  if (!milestone) return vocabularies;

  const resolved = (resolution as { action?: string } | undefined) ?? undefined;
  const action = resolved?.action ?? "split-recommended";
  const source: ScaffoldDecision["source"] = resolved ? "user" : "default";

  const expanded: InferredVocabulary[] = [...vocabularies];

  if (action === "split-recommended" || action === "split-custom") {
    const names =
      action === "split-custom" && Array.isArray((resolved as { names?: string[] })?.names)
        ? (resolved as { names: string[] }).names
        : milestone.recommendedNames;
    milestone.groups.forEach((group, i) => {
      const name = names[i] ?? `${milestone.propertyName}_${i + 1}`;
      expanded.push({
        name,
        values: group.values,
        sources: group.components.map((component) => ({
          component,
          property: milestone.propertyName,
          values: group.values,
        })),
      });
    });
    decisions.push({
      milestone_id: "vocab-naming",
      source,
      summary: `Split \`${milestone.propertyName}\` into [${names.slice(0, milestone.groups.length).join(", ")}]`,
      rationale:
        `Value-sets across components were disjoint (max pairwise overlap ` +
        `${(milestone.overlapRatio * 100).toFixed(0)}%). Recommended split ` +
        `uses prior-art vocab names where value-overlap ≥50%, else ` +
        `\`${milestone.propertyName}_N\` suffix.`,
    });
  } else if (action === "merge-all") {
    const merged: InferredVocabulary = {
      name: milestone.propertyName,
      values: dedupe(milestone.groups.flatMap((g) => g.values)),
      sources: milestone.groups.flatMap((g) =>
        g.components.map((c) => ({
          component: c,
          property: milestone.propertyName,
          values: g.values,
        })),
      ),
    };
    expanded.push(merged);
    decisions.push({
      milestone_id: "vocab-naming",
      source,
      summary: `Merged \`${milestone.propertyName}\` across all groups`,
      rationale:
        `User chose to treat divergent values as one concept despite ` +
        `${(milestone.overlapRatio * 100).toFixed(0)}% overlap.`,
    });
  }
  // Silence unused-var
  void priorArt;

  return expanded;
}

// ─── Milestone 2: grammar-pattern ───────────────────────────────────────────

function buildGrammarMilestone(
  borderline: BorderlineGroup,
): GrammarPatternMilestone {
  return {
    root: borderline.root,
    memberCount: borderline.memberCount,
    proposedAction: borderline.proposedAction,
    reason: borderline.reason,
  };
}

/**
 * Resolve the grammar-pattern milestone. Returns the chosen action so the
 * orchestrator can reshape grammars/standalones accordingly (F2 fix).
 */
function applyGrammarPatternResolution(
  resolution: unknown,
  milestone: GrammarPatternMilestone,
  decisions: ScaffoldDecision[],
): "accept-grammar" | "flatten-standalone" | "custom-depth" {
  const resolved = (resolution as { action?: string } | undefined) ?? undefined;
  const defaultAction =
    milestone.proposedAction === "grammar" ? "accept-grammar" : "flatten-standalone";
  const action = (resolved?.action ?? defaultAction) as
    | "accept-grammar"
    | "flatten-standalone"
    | "custom-depth";
  const source: ScaffoldDecision["source"] = resolved ? "user" : "default";
  decisions.push({
    milestone_id: "grammar-pattern",
    source,
    summary: `Borderline group \`${milestone.root}\` resolved as ${action}`,
    rationale:
      milestone.reason +
      `. Default action preserves the proposal (${milestone.proposedAction}); ` +
      `override via auto_resolutions["grammar-pattern"].`,
  });
  return action;
}

// ─── Milestone 3: base-state ────────────────────────────────────────────────

function detectBaseStateMismatch(
  tokens: ScaffoldInputToken[],
  components: ScaffoldInputComponent[],
  priorArt: PriorArtIndex,
): BaseStateMilestone | undefined {
  const tokenBases = pickBaseState(
    tokens.flatMap((t) => [t.path.split(".").pop()!]),
  );
  const propBases = pickBaseState(
    components.flatMap((c) =>
      c.properties.flatMap((p) => p.values ?? []),
    ),
  );
  if (!tokenBases || !propBases || tokenBases === propBases) return undefined;

  const totalDSes = Math.max(priorArt.interactionStates.size > 0 ? countDSes(priorArt) : 1, 1);
  const priorArtRatios = {
    default: (priorArt.interactionStates.get("default")?.usedInDSes.length ?? 0) / totalDSes,
    rest: (priorArt.interactionStates.get("rest")?.usedInDSes.length ?? 0) / totalDSes,
    enabled: (priorArt.interactionStates.get("enabled")?.usedInDSes.length ?? 0) / totalDSes,
  };
  const recommendation = recommendBaseState(priorArtRatios);

  return {
    tokenBaseState: tokenBases,
    propertyBaseState: propBases,
    recommendation,
    priorArtRatios,
  };
}

function pickBaseState(values: string[]): string | undefined {
  for (const candidate of BASE_STATE_CANDIDATES) {
    if (values.includes(candidate)) return candidate;
  }
  return undefined;
}

function countDSes(priorArt: PriorArtIndex): number {
  const dses = new Set<string>();
  for (const entry of priorArt.interactionStates.values()) {
    for (const ds of entry.usedInDSes) dses.add(ds);
  }
  return dses.size;
}

function recommendBaseState(
  ratios: BaseStateMilestone["priorArtRatios"],
): BaseStateMilestone["recommendation"] {
  const sorted = (Object.entries(ratios) as Array<[keyof typeof ratios, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const winner = sorted[0]?.[0] ?? "default";
  return (`align-to-${winner}`) as BaseStateMilestone["recommendation"];
}

function applyBaseStateResolution(
  resolution: unknown,
  milestone: BaseStateMilestone,
  decisions: ScaffoldDecision[],
): void {
  const resolved = (resolution as { action?: string } | undefined) ?? undefined;
  const action = resolved?.action ?? milestone.recommendation;
  const source: ScaffoldDecision["source"] = resolved ? "user" : "default";
  decisions.push({
    milestone_id: "base-state",
    source,
    summary: `Base-state resolution: ${action}`,
    rationale:
      `Tokens use \`${milestone.tokenBaseState}\`; properties use ` +
      `\`${milestone.propertyBaseState}\`. Prior-art ratios — default: ` +
      `${(milestone.priorArtRatios.default * 100).toFixed(0)}%, rest: ` +
      `${(milestone.priorArtRatios.rest * 100).toFixed(0)}%, enabled: ` +
      `${(milestone.priorArtRatios.enabled * 100).toFixed(0)}%.`,
  });
}

// ─── DSProfile assembly helpers ─────────────────────────────────────────────

function toProfileVocabularies(
  vocabs: InferredVocabulary[],
): Record<string, Vocabulary> {
  const out: Record<string, Vocabulary> = {};
  for (const v of vocabs) {
    const usedIn = dedupe(v.sources.map((s) => s.component)).join(", ");
    out[v.name] = {
      description: `Scaffold-inferred from ${usedIn || "component properties"}.`,
      values: v.values,
    };
  }
  return out;
}

function toProfileGrammars(
  grammars: InferredGrammar[],
  annotations: ReturnType<typeof annotateGrammarUsage>["annotations"],
): Record<string, TokenGrammar> {
  const out: Record<string, TokenGrammar> = {};
  for (const g of grammars) {
    const ann = annotations.find((a) => a.grammarName === g.name);
    const axes: Record<string, { values: string[] }> = {};
    for (const axis of g.axes) {
      axes[axis.placeholder] = { values: axis.values };
    }
    const grammar: TokenGrammar = {
      pattern: g.pattern,
      dtcg_type: g.dtcg_type,
      description: ann?.description ?? "Scaffold-inferred grammar.",
      axes,
    };
    // Extension field for D2b used_by list — stored under `axes` is wrong;
    // CDF Profile Spec puts this under a description-prose convention in v1.0.0
    // (see §6.11). We attach it to the description so emitted YAML surfaces
    // it to LLM readers.
    if (ann && ann.used_by.length > 0) {
      grammar.description =
        `${grammar.description}\n\nUsed by: ${ann.used_by.join(", ")}.`;
    }
    out[g.name] = grammar;
  }
  return out;
}

function toStandaloneTokens(
  tokens: InferredStandaloneToken[],
): Record<string, StandaloneToken> | undefined {
  if (tokens.length === 0) return undefined;
  const out: Record<string, StandaloneToken> = {};
  for (const t of tokens) {
    out[t.path] = {
      dtcg_type: t.dtcg_type,
      description: `Scaffold-inferred token. Value at scaffold time: \`${t.value}\`.`,
    };
  }
  return out;
}

function buildSectionSummary(
  summary: ScaffoldSummary,
  tokenInf: { grammars: InferredGrammar[]; standaloneTokens: InferredStandaloneToken[] },
): Record<string, string> {
  const out: Record<string, string> = {};
  out.vocabularies = `${summary.vocabularies_inferred} vocabularies inferred from component properties.`;
  if (tokenInf.grammars.length > 0) {
    out.token_grammar = `${tokenInf.grammars.length} grammars inferred; ${tokenInf.standaloneTokens.length} standalone tokens emitted for flat groups.`;
  } else if (tokenInf.standaloneTokens.length > 0) {
    out.token_grammar = `No grammars inferred — ${tokenInf.standaloneTokens.length} tokens emitted as standalone_tokens.`;
  }
  if (summary.theming_modifiers_inferred > 0) {
    out.theming = `${summary.theming_modifiers_inferred} theming modifiers inferred from mode collections.`;
  }
  return out;
}

function toEmitDecision(d: ScaffoldDecision): EmitDecision {
  return { milestone_id: d.milestone_id, source: d.source, summary: d.summary };
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
