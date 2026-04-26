import type { Issue } from "../../../types/cdf.js";
import { safeEntries, safeKeys } from "../../rules/safe-utils.js";

/**
 * L1–L4: structural rules for CDF Profile YAML.
 *
 * Operates on a loosely-typed `profile` (post-YAML, pre-DSProfile) so it
 * can report on garbage shapes that the typed parser would simply throw on.
 *
 * - L1  required top-level fields (extends-aware)
 * - L2  field types correct
 * - L3  schema baking — only known top-level keys
 * - L4  cross-field structural (theming.modes references valid axes, etc.)
 */
export function checkProfileStructural(
  profile: Record<string, unknown>,
): Issue[] {
  const issues: Issue[] = [];

  const hasExtends =
    typeof profile.extends === "string" && profile.extends.length > 0;

  // ── L1: required fields ────────────────────────────────────────────────
  // Per CDF-PROFILE-SPEC §3 + §15: when extends: is set, only `name` and
  // `version` stay required on the child; the rest flow in from the parent
  // via per-key REPLACE merge. Standalone Profiles need the full set.
  const required = hasExtends
    ? ["name", "version"]
    : ["name", "version", "vocabularies", "token_grammar", "theming", "naming"];
  for (const field of required) {
    if (profile[field] === undefined || profile[field] === null) {
      issues.push({
        severity: "error",
        path: field,
        message: `Required field '${field}' is missing.` +
          (hasExtends
            ? ""
            : " (Standalone Profiles must declare all six core fields. " +
              "If this Profile extends another, set `extends: <path>`.)"),
        rule: "profile-required-fields",
      });
    }
  }

  // ── L2: field types ────────────────────────────────────────────────────
  if (profile.name !== undefined && typeof profile.name !== "string") {
    issues.push({
      severity: "error",
      path: "name",
      message: `Field 'name' must be a string, got ${typeOf(profile.name)}.`,
      rule: "profile-field-type",
    });
  }
  if (profile.version !== undefined && typeof profile.version !== "string") {
    issues.push({
      severity: "error",
      path: "version",
      message: `Field 'version' must be a string, got ${typeOf(profile.version)}.`,
      rule: "profile-field-type",
    });
  }
  if (profile.extends !== undefined && typeof profile.extends !== "string") {
    issues.push({
      severity: "error",
      path: "extends",
      message: `Field 'extends' must be a string path, got ${typeOf(profile.extends)}.`,
      rule: "profile-field-type",
    });
  }
  if (profile.vocabularies !== undefined) {
    checkVocabularyShape(profile.vocabularies, issues);
  }
  if (profile.token_grammar !== undefined) {
    checkTokenGrammarShape(profile.token_grammar, issues);
  }
  if (profile.theming !== undefined) {
    checkThemingShape(profile.theming, issues);
  }
  if (profile.interaction_patterns !== undefined) {
    checkInteractionPatternsShape(profile.interaction_patterns, issues);
  }
  if (profile.naming !== undefined) {
    checkNamingShape(profile.naming, issues);
  }
  if (profile.standalone_tokens !== undefined) {
    checkStandaloneTokensShape(profile.standalone_tokens, issues);
  }

  // ── L3: schema baking — only known top-level keys ──────────────────────
  // Catches typos like `theme:` vs `theming:` early. Non-blocking warning
  // because the Profile spec is still evolving and overly-strict schema
  // baking would block legitimate experimentation.
  const knownKeys = new Set([
    "name", "version", "cdf_version", "dtcg_version", "description",
    "extends",
    "vocabularies", "token_grammar", "token_layers", "standalone_tokens",
    "interaction_patterns", "theming", "accessibility_defaults",
    "naming", "categories", "assets", "css_defaults",
    // Optional fields scaffold may emit — referenced by skill phase-7 §7.1
    "token_sources",
  ]);
  for (const key of Object.keys(profile)) {
    if (!knownKeys.has(key)) {
      const suggestion = suggestKey(key, knownKeys);
      issues.push({
        severity: "warning",
        path: key,
        message:
          `Unknown top-level field '${key}'.` +
          (suggestion ? ` Did you mean '${suggestion}'?` : "") +
          " (See CDF-PROFILE-SPEC §3 for the full field list.)",
        rule: "profile-unknown-field",
      });
    }
  }

  // ── L4: cross-field structural ─────────────────────────────────────────
  // theming.modifiers' axes-keys should be referenced consistently.
  // interaction_patterns.<p>.token_layer references a valid token layer.
  if (
    profile.token_layers !== undefined &&
    profile.interaction_patterns !== undefined &&
    Array.isArray(profile.token_layers) &&
    profile.token_layers.length > 0
  ) {
    const layerNames = new Set<string>();
    for (const layer of profile.token_layers as Array<Record<string, unknown>>) {
      if (typeof layer?.name === "string") layerNames.add(layer.name);
    }
    for (const [pName, p] of safeEntries<Record<string, unknown>>(
      profile.interaction_patterns,
      "interaction_patterns",
      issues,
    )) {
      const tl = p.token_layer;
      if (typeof tl === "string" && !layerNames.has(tl)) {
        issues.push({
          severity: "warning",
          path: `interaction_patterns.${pName}.token_layer`,
          message:
            `Pattern '${pName}' references token_layer '${tl}' but no such ` +
            `layer is declared in token_layers (declared: ${
              [...layerNames].sort().join(", ") || "none"
            }).`,
          rule: "profile-token-layer-ref",
        });
      }
    }
  }

  return issues;
}

// ── Per-section shape checks ────────────────────────────────────────────────

function checkVocabularyShape(value: unknown, issues: Issue[]): void {
  for (const [vName, vRaw] of safeEntries<Record<string, unknown>>(
    value,
    "vocabularies",
    issues,
  )) {
    const path = `vocabularies.${vName}`;
    const v = vRaw;
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      issues.push({
        severity: "error",
        path,
        message: `Vocabulary '${vName}' must be an object with 'description' and 'values'.`,
        rule: "profile-field-type",
      });
      continue;
    }
    if (!Array.isArray(v.values)) {
      issues.push({
        severity: "error",
        path: `${path}.values`,
        message: `Vocabulary '${vName}' field 'values' must be an array of strings.`,
        rule: "profile-field-type",
      });
      continue;
    }
    if (v.values.length === 0) {
      issues.push({
        severity: "warning",
        path: `${path}.values`,
        message: `Vocabulary '${vName}' has an empty 'values' array. Did you mean to omit it?`,
        rule: "profile-vocab-empty",
      });
    }
    for (let i = 0; i < v.values.length; i++) {
      if (typeof v.values[i] !== "string") {
        issues.push({
          severity: "error",
          path: `${path}.values[${i}]`,
          message: `Vocabulary '${vName}' values must all be strings; index ${i} is ${typeOf(v.values[i])}.`,
          rule: "profile-field-type",
        });
      }
    }
  }
}

function checkTokenGrammarShape(value: unknown, issues: Issue[]): void {
  for (const [gName, gRaw] of safeEntries<Record<string, unknown>>(
    value,
    "token_grammar",
    issues,
  )) {
    const path = `token_grammar.${gName}`;
    const g = gRaw;
    if (g === null || typeof g !== "object" || Array.isArray(g)) {
      issues.push({
        severity: "error",
        path,
        message: `Token grammar '${gName}' must be an object with 'pattern' and 'dtcg_type'.`,
        rule: "profile-field-type",
      });
      continue;
    }
    if (typeof g.pattern !== "string" || g.pattern.length === 0) {
      issues.push({
        severity: "error",
        path: `${path}.pattern`,
        message: `Token grammar '${gName}' requires a non-empty string 'pattern'.`,
        rule: "profile-field-type",
      });
    }
    if (typeof g.dtcg_type !== "string" || g.dtcg_type.length === 0) {
      issues.push({
        severity: "error",
        path: `${path}.dtcg_type`,
        message: `Token grammar '${gName}' requires a non-empty string 'dtcg_type'.`,
        rule: "profile-field-type",
      });
    }
  }
}

function checkThemingShape(value: unknown, issues: Issue[]): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    issues.push({
      severity: "error",
      path: "theming",
      message: `Field 'theming' must be an object with 'modifiers' and 'set_mapping'.`,
      rule: "profile-field-type",
    });
    return;
  }
  const t = value as Record<string, unknown>;
  // modifiers + set_mapping are both REQUIRED by the type, but we tolerate
  // either being omitted in extends-children (the parent supplies it).
  // Validation here is shape-only when present.
  if (t.modifiers !== undefined) {
    for (const [mName, mRaw] of safeEntries<Record<string, unknown>>(
      t.modifiers,
      "theming.modifiers",
      issues,
    )) {
      if (mRaw === null || typeof mRaw !== "object" || Array.isArray(mRaw)) {
        issues.push({
          severity: "error",
          path: `theming.modifiers.${mName}`,
          message: `Modifier '${mName}' must be an object.`,
          rule: "profile-field-type",
        });
        continue;
      }
      if (mRaw.contexts !== undefined && !Array.isArray(mRaw.contexts)) {
        issues.push({
          severity: "error",
          path: `theming.modifiers.${mName}.contexts`,
          message: `Modifier '${mName}' field 'contexts' must be an array.`,
          rule: "profile-field-type",
        });
      }
    }
  }
  if (t.set_mapping !== undefined) {
    for (const [_smKey, smRaw] of safeEntries<Record<string, unknown>>(
      t.set_mapping,
      "theming.set_mapping",
      issues,
    )) {
      if (smRaw === null || typeof smRaw !== "object" || Array.isArray(smRaw)) {
        issues.push({
          severity: "error",
          path: `theming.set_mapping.${_smKey}`,
          message: `set_mapping entry '${_smKey}' must be an object.`,
          rule: "profile-field-type",
        });
      }
    }
  }
}

function checkInteractionPatternsShape(value: unknown, issues: Issue[]): void {
  for (const [pName, pRaw] of safeEntries<Record<string, unknown>>(
    value,
    "interaction_patterns",
    issues,
  )) {
    const path = `interaction_patterns.${pName}`;
    if (pRaw === null || typeof pRaw !== "object" || Array.isArray(pRaw)) {
      issues.push({
        severity: "error",
        path,
        message: `Interaction pattern '${pName}' must be an object.`,
        rule: "profile-field-type",
      });
      continue;
    }
    if (pRaw.states !== undefined && !Array.isArray(pRaw.states)) {
      issues.push({
        severity: "error",
        path: `${path}.states`,
        message: `Pattern '${pName}' field 'states' must be an array of state names.`,
        rule: "profile-field-type",
      });
    }
    if (
      pRaw.token_mapping !== undefined &&
      (pRaw.token_mapping === null ||
        typeof pRaw.token_mapping !== "object" ||
        Array.isArray(pRaw.token_mapping))
    ) {
      issues.push({
        severity: "error",
        path: `${path}.token_mapping`,
        message: `Pattern '${pName}' field 'token_mapping' must be an object map.`,
        rule: "profile-field-type",
      });
    }
  }
}

function checkNamingShape(value: unknown, issues: Issue[]): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    issues.push({
      severity: "error",
      path: "naming",
      message: `Field 'naming' must be an object.`,
      rule: "profile-field-type",
    });
    return;
  }
  const n = value as Record<string, unknown>;
  for (const key of ["css_prefix", "token_prefix"] as const) {
    if (n[key] !== undefined && typeof n[key] !== "string") {
      issues.push({
        severity: "error",
        path: `naming.${key}`,
        message: `Field 'naming.${key}' must be a string.`,
        rule: "profile-field-type",
      });
    }
  }
}

/**
 * standalone_tokens shape check (CDF-PROFILE-SPEC §6.11.1).
 *
 * The spec is a map keyed by leaf path; each entry has REQUIRED
 * `dtcg_type` (non-empty string) + `description` (non-empty string).
 * Pre-N3 the validator accepted any shape and the Phase-7 template
 * even sanctioned a flat-list alternative — both gone now.
 *
 * The empty-string check on `dtcg_type` matters: a future `dtcg_type:
 * ""` would re-open the same scope-drift hole that the typed-shape
 * guard is meant to close.
 */
function checkStandaloneTokensShape(value: unknown, issues: Issue[]): void {
  // Reject the flat-list shape outright; the empty list `[]` is a
  // common idiom but no longer accepted — emit `{}` instead.
  if (Array.isArray(value)) {
    issues.push({
      severity: "error",
      path: "standalone_tokens",
      message:
        `Field 'standalone_tokens' must be a map of leaf-path → entry, not a list. ` +
        `See CDF-PROFILE-SPEC §6.11.1.`,
      rule: "profile-standalone-shape",
    });
    return;
  }
  if (value === null || typeof value !== "object") {
    issues.push({
      severity: "error",
      path: "standalone_tokens",
      message:
        `Field 'standalone_tokens' must be an object (map of leaf-path → entry). ` +
        `See CDF-PROFILE-SPEC §6.11.1.`,
      rule: "profile-standalone-shape",
    });
    return;
  }

  for (const [tName, tRaw] of Object.entries(value as Record<string, unknown>)) {
    const path = `standalone_tokens.${tName}`;
    if (tRaw === null || typeof tRaw !== "object" || Array.isArray(tRaw)) {
      issues.push({
        severity: "error",
        path,
        message:
          `Standalone token '${tName}' must be an object with 'dtcg_type' and 'description'. ` +
          `See CDF-PROFILE-SPEC §6.11.1.`,
        rule: "profile-standalone-shape",
      });
      continue;
    }
    const t = tRaw as Record<string, unknown>;
    if (typeof t.dtcg_type !== "string" || t.dtcg_type.length === 0) {
      issues.push({
        severity: "error",
        path: `${path}.dtcg_type`,
        message:
          `Standalone token '${tName}' requires a non-empty string 'dtcg_type'. ` +
          `See CDF-PROFILE-SPEC §6.11.1.`,
        rule: "profile-standalone-shape",
      });
    }
    if (typeof t.description !== "string" || t.description.length === 0) {
      issues.push({
        severity: "error",
        path: `${path}.description`,
        message:
          `Standalone token '${tName}' requires a non-empty string 'description'. ` +
          `See CDF-PROFILE-SPEC §6.11.1.`,
        rule: "profile-standalone-shape",
      });
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Return the closest known key by Levenshtein distance (≤2 char edits) to
 * help LLM-authors fix typos like `theme` → `theming`. Returns undefined
 * when no close match exists (so we don't suggest random unrelated keys).
 */
function suggestKey(input: string, known: Set<string>): string | undefined {
  let best: { key: string; dist: number; prefix: number } | undefined;
  for (const k of known) {
    const d = levenshtein(input, k);
    // Distance 3 catches common typos like `theme` → `theming` (3 edits)
    // without suggesting wildly unrelated keys.
    if (d > 3) continue;
    const prefix = commonPrefixLen(input, k);
    if (
      best === undefined ||
      d < best.dist ||
      // Tie-break: prefer suggestions that share a longer common prefix
      // (so `theme` → `theming`, not `theme` → `name`).
      (d === best.dist && prefix > best.prefix)
    ) {
      best = { key: k, dist: d, prefix };
    }
  }
  return best?.key;
}

function commonPrefixLen(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length, n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// Re-export so structural can compose with semantic via shared helpers.
export { safeKeys };
