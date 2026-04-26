import type {
  CoverageInput,
  ProfileCoverageResult,
  ProfileOrphan,
  OrphanType,
  SkippedCheck,
} from "../types/profile-coverage.js";

/**
 * Analyze orphan coverage for a profile. Three orphan classes:
 * - vocab-orphan (profile-internal): always runs.
 * - grammar-orphan (cross-layer): runs only if components provided.
 * - pattern-orphan (cross-layer): runs only if components provided.
 *
 * Strict vocab-orphan: grammar-template placeholders do NOT count as
 * explicit references. A value must appear in theming modifier contexts,
 * set_mapping lists, or interaction_pattern bindings to be "referenced".
 */
export function analyzeProfileCoverage(input: CoverageInput): ProfileCoverageResult {
  const orphans: ProfileOrphan[] = [];
  const checks_run: OrphanType[] = [];
  const checks_skipped: SkippedCheck[] = [];

  // vocab-orphan always runs.
  orphans.push(...checkVocabOrphans(input));
  checks_run.push("vocab-orphan");

  if (input.components.length === 0) {
    checks_skipped.push({
      check: "grammar-orphan",
      reason: "0 components in spec_directories; cross-layer check requires ≥1 component",
    });
    checks_skipped.push({
      check: "pattern-orphan",
      reason: "0 components in spec_directories; cross-layer check requires ≥1 component",
    });
  } else {
    orphans.push(...checkGrammarOrphans(input));
    checks_run.push("grammar-orphan");
    orphans.push(...checkPatternOrphans(input));
    checks_run.push("pattern-orphan");
  }

  return {
    profile: input.profilePath ?? "<inline>",
    components_considered: input.components.length,
    checks_run,
    checks_skipped,
    orphans,
  };
}

function checkVocabOrphans(input: CoverageInput): ProfileOrphan[] {
  const orphans: ProfileOrphan[] = [];
  const refs = collectInternalReferences(input.profile);

  for (const [axisName, vocab] of Object.entries(input.profile.vocabularies ?? {})) {
    const values = vocab?.values ?? [];
    for (const value of values) {
      if (!refs.has(value)) {
        orphans.push({
          type: "vocab-orphan",
          scope: "profile-internal",
          path: `vocabularies.${axisName}.${value}`,
          file: input.profilePath,
          checked_against: [
            "theming.modifiers.*.contexts",
            "theming.set_mapping.*",
            "interaction_patterns.*.bindings",
          ],
          reason:
            `Value '${value}' is declared in vocabularies.${axisName} but never named in ` +
            `any theming modifier context-list, set_mapping value, or interaction_pattern ` +
            `binding within this profile. Grammar-template placeholders do NOT count as ` +
            `explicit references (strict definition, v1.6.0 design §2.4).`,
        });
      }
    }
  }

  return orphans;
}

/** Collect every vocabulary-value reference present anywhere in the profile
 *  EXCEPT grammar templates (which are placeholder-based, not value-explicit). */
function collectInternalReferences(profile: unknown): Set<string> {
  const refs = new Set<string>();
  const p = profile as Record<string, unknown>;

  // theming.modifiers.<name>.contexts: [...]
  const theming = p.theming as Record<string, unknown> | undefined;
  const modifiers = theming?.modifiers as Record<string, unknown> | undefined;
  for (const mod of Object.values(modifiers ?? {})) {
    const contexts = (mod as Record<string, unknown>)?.contexts;
    if (Array.isArray(contexts)) {
      for (const v of contexts) refs.add(String(v));
    }
  }

  // theming.set_mapping.* — glob-ish string values treated as explicit refs.
  const setMapping = theming?.set_mapping as Record<string, unknown> | undefined;
  for (const v of Object.values(setMapping ?? {})) {
    if (typeof v === "string") refs.add(v);
    else if (Array.isArray(v)) for (const x of v) refs.add(String(x));
  }

  // interaction_patterns.*.bindings — if present as explicit value references.
  const patterns = p.interaction_patterns as Record<string, unknown> | undefined;
  for (const pat of Object.values(patterns ?? {})) {
    const bindings = (pat as Record<string, unknown>)?.bindings;
    if (typeof bindings === "object" && bindings !== null) {
      for (const v of Object.values(bindings as Record<string, unknown>)) {
        if (typeof v === "string") refs.add(v);
      }
    }
  }

  return refs;
}

/** A grammar is orphan if no component's token_mapping consumes a path
 *  matching the grammar's pattern prefix. Matching is string-prefix-based
 *  (grammar prefix up to the first `{placeholder}`), which is sufficient
 *  for the common case and avoids fragile placeholder-expansion logic. */
function checkGrammarOrphans(input: CoverageInput): ProfileOrphan[] {
  const orphans: ProfileOrphan[] = [];
  const allTokenPaths = new Set<string>();
  for (const comp of input.components) {
    const tm = (comp as unknown as { tokens?: { token_mapping?: Record<string, string> } })
      .tokens?.token_mapping ?? {};
    for (const path of Object.values(tm)) {
      if (typeof path === "string") allTokenPaths.add(path);
    }
  }

  const grammars = (input.profile as unknown as {
    token_grammar?: Record<string, { pattern?: string }>;
  }).token_grammar ?? {};
  for (const [name, g] of Object.entries(grammars)) {
    const pattern = g?.pattern;
    if (typeof pattern !== "string") continue;
    const prefix = pattern.split("{")[0].replace(/\.$/, "");
    const consumed = [...allTokenPaths].some((p) => p === prefix || p.startsWith(prefix + "."));
    if (!consumed) {
      orphans.push({
        type: "grammar-orphan",
        scope: "cross-layer",
        path: `token_grammar.${name}`,
        file: input.profilePath,
        checked_against: ["components[].tokens.token_mapping"],
        reason:
          `Grammar '${name}' (pattern '${pattern}') produces token paths under '${prefix}.*', ` +
          `but no component's token_mapping consumes any such path. Consider removing the grammar or ` +
          `binding it from at least one component.`,
      });
    }
  }
  return orphans;
}

/** A pattern is orphan if no component state's interaction_pattern field names it. */
function checkPatternOrphans(input: CoverageInput): ProfileOrphan[] {
  const orphans: ProfileOrphan[] = [];
  const referencedPatterns = new Set<string>();
  for (const comp of input.components) {
    const states = (comp as unknown as {
      states?: Record<string, { interaction_pattern?: string }>;
    }).states ?? {};
    for (const state of Object.values(states)) {
      if (state?.interaction_pattern) {
        referencedPatterns.add(state.interaction_pattern);
      }
    }
  }

  const patterns = (input.profile as unknown as {
    interaction_patterns?: Record<string, unknown>;
  }).interaction_patterns ?? {};
  for (const name of Object.keys(patterns)) {
    if (!referencedPatterns.has(name)) {
      orphans.push({
        type: "pattern-orphan",
        scope: "cross-layer",
        path: `interaction_patterns.${name}`,
        file: input.profilePath,
        checked_against: ["components[].states.*.interaction_pattern"],
        reason:
          `Interaction pattern '${name}' is declared but no component state references it ` +
          `via 'interaction_pattern:'. Consider removing the pattern or binding it from at ` +
          `least one component state.`,
      });
    }
  }
  return orphans;
}
