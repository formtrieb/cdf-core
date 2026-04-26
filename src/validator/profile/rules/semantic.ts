import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parse as parseYAML } from "yaml";
import type { Issue } from "../../../types/cdf.js";
import { safeEntries } from "../../rules/safe-utils.js";

/**
 * L5–L7: semantic rules for CDF Profile.
 *
 * - L5  Vocabulary Isolation Rule (Profile §5.5) — vocabulary values may
 *       only appear in axes that are bound to that vocabulary.
 * - L6  `extends:` resolution — target file exists, parses, no cycles.
 * - L7  `set_mapping` glob syntax + glob-target sanity.
 *
 * Operates on the loosely-typed post-YAML profile so it can survive
 * partial input. Each check is internally tolerant: missing prerequisite
 * fields cause the rule to skip silently rather than emit cascading errors.
 */
export function checkProfileSemantic(
  profile: Record<string, unknown>,
  baseDir: string | undefined,
  fileName: string,
): Issue[] {
  const issues: Issue[] = [];

  // ── L5: Vocabulary Isolation Rule ──────────────────────────────────────
  // For every grammar axis that declares `vocabulary: <name>`, the axis's
  // resolved values must come from that vocabulary. The parser already
  // enforces this at parse-time by replacing `values` with the vocab's
  // values, but a Profile may also declare standalone `values:` arrays in
  // axes that DON'T name a vocabulary. Those values must NOT collide with
  // any vocabulary's values (otherwise the value's binding is ambiguous).
  checkVocabularyIsolation(profile, issues);

  // ── L6: extends resolution ─────────────────────────────────────────────
  if (typeof profile.extends === "string" && profile.extends.length > 0) {
    checkExtendsResolution(profile.extends, baseDir, fileName, issues);
  }

  // ── L7: set_mapping glob syntax ────────────────────────────────────────
  checkSetMappingGlobs(profile, issues);

  return issues;
}

// ── L5 ─────────────────────────────────────────────────────────────────────

function checkVocabularyIsolation(
  profile: Record<string, unknown>,
  issues: Issue[],
): void {
  const vocabularies = profile.vocabularies;
  if (
    vocabularies === undefined ||
    vocabularies === null ||
    typeof vocabularies !== "object" ||
    Array.isArray(vocabularies)
  ) {
    return;
  }

  // Build value → vocab-name index for fast collision detection.
  const valueToVocab = new Map<string, string>();
  for (const [vName, vRaw] of Object.entries(vocabularies as Record<string, unknown>)) {
    if (vRaw === null || typeof vRaw !== "object" || Array.isArray(vRaw)) continue;
    const values = (vRaw as { values?: unknown }).values;
    if (!Array.isArray(values)) continue;
    for (const val of values) {
      if (typeof val !== "string") continue;
      // First-write wins; we'll surface collisions between vocabs as a
      // separate L5 finding below (cross-vocab value reuse is suspect).
      if (!valueToVocab.has(val)) valueToVocab.set(val, vName);
      else if (valueToVocab.get(val) !== vName) {
        issues.push({
          severity: "warning",
          path: `vocabularies.${vName}.values`,
          message:
            `Value '${val}' appears in both '${valueToVocab.get(val)}' and '${vName}'. ` +
            `Vocabulary Isolation Rule (Profile §5.5) recommends each vocabulary value ` +
            `is unique across vocabularies, so axis-bindings stay unambiguous.`,
          rule: "profile-vocab-isolation",
        });
      }
    }
  }

  // Inspect token_grammar axes that declare standalone `values:` (no
  // `vocabulary:` ref). Their values must not collide with any vocabulary —
  // if they do, the axis's binding to that vocabulary is implicit and
  // confusing.
  const tokenGrammar = profile.token_grammar;
  if (
    tokenGrammar === undefined ||
    tokenGrammar === null ||
    typeof tokenGrammar !== "object" ||
    Array.isArray(tokenGrammar)
  ) {
    return;
  }
  for (const [gName, gRaw] of Object.entries(tokenGrammar as Record<string, unknown>)) {
    if (gRaw === null || typeof gRaw !== "object" || Array.isArray(gRaw)) continue;
    const axes = (gRaw as { axes?: unknown }).axes;
    if (axes === null || axes === undefined || typeof axes !== "object") continue;
    for (const [axisName, axisRaw] of Object.entries(axes as Record<string, unknown>)) {
      if (axisRaw === null || typeof axisRaw !== "object" || Array.isArray(axisRaw)) continue;
      const axis = axisRaw as { vocabulary?: unknown; values?: unknown };
      if (typeof axis.vocabulary === "string") {
        // Vocabulary-bound axis: the parser will populate values; skip.
        // But surface if the named vocab doesn't exist (parser would throw,
        // but we can give a softer error from the validator).
        if (!Object.prototype.hasOwnProperty.call(vocabularies, axis.vocabulary)) {
          issues.push({
            severity: "error",
            path: `token_grammar.${gName}.axes.${axisName}.vocabulary`,
            message:
              `Axis '${axisName}' references vocabulary '${axis.vocabulary}' but ` +
              `that vocabulary is not declared.`,
            rule: "profile-vocab-ref",
          });
        }
        continue;
      }
      if (!Array.isArray(axis.values)) continue;
      for (const val of axis.values) {
        if (typeof val !== "string") continue;
        const ownerVocab = valueToVocab.get(val);
        if (ownerVocab !== undefined) {
          issues.push({
            severity: "warning",
            path: `token_grammar.${gName}.axes.${axisName}.values`,
            message:
              `Standalone axis value '${val}' is also a value of vocabulary '${ownerVocab}'. ` +
              `Per Profile §5.5 Vocabulary Isolation Rule, bind the axis explicitly via ` +
              `'vocabulary: ${ownerVocab}' instead of inlining the value.`,
            rule: "profile-vocab-isolation",
          });
        }
      }
    }
  }
}

// ── L6 ─────────────────────────────────────────────────────────────────────

function checkExtendsResolution(
  extendsPath: string,
  baseDir: string | undefined,
  fileName: string,
  issues: Issue[],
): void {
  const dir = baseDir ?? (fileName !== "<inline>" ? dirname(fileName) : process.cwd());
  const targetAbs = resolve(dir, extendsPath);
  if (!existsSync(targetAbs)) {
    issues.push({
      severity: "error",
      path: "extends",
      message:
        `Parent Profile not found at '${targetAbs}' (resolved from extends: '${extendsPath}'). ` +
        `Check the path is relative to the child Profile's directory.`,
      rule: "profile-extends-target",
    });
    return;
  }

  // Cycle + parseable check via single-step traversal. v1.0.0-draft is
  // single-level only (Profile §15.6) so we don't walk further than one
  // hop, but we DO refuse if the parent declares its own extends — that's
  // the cycle-prevention contract for v1.0.0.
  let parentRaw: unknown;
  try {
    parentRaw = parseYAML(readFileSync(targetAbs, "utf-8"));
  } catch (err) {
    issues.push({
      severity: "error",
      path: "extends",
      message: `Parent Profile at '${targetAbs}' is not parseable: ${(err as Error).message}`,
      rule: "profile-extends-parseable",
    });
    return;
  }
  if (parentRaw === null || typeof parentRaw !== "object" || Array.isArray(parentRaw)) {
    issues.push({
      severity: "error",
      path: "extends",
      message: `Parent Profile at '${targetAbs}' is not a YAML mapping.`,
      rule: "profile-extends-parseable",
    });
    return;
  }
  const parent = parentRaw as Record<string, unknown>;
  if (typeof parent.extends === "string" && parent.extends.length > 0) {
    issues.push({
      severity: "error",
      path: "extends",
      message:
        `Parent Profile at '${targetAbs}' itself declares 'extends:'. ` +
        `Single-level inheritance only in v1.0.0 (Profile §15.6).`,
      rule: "profile-extends-cycle",
    });
  }
}

// ── L7 ─────────────────────────────────────────────────────────────────────

function checkSetMappingGlobs(
  profile: Record<string, unknown>,
  issues: Issue[],
): void {
  const theming = profile.theming;
  if (
    theming === undefined ||
    theming === null ||
    typeof theming !== "object" ||
    Array.isArray(theming)
  ) return;
  const setMapping = (theming as Record<string, unknown>).set_mapping;
  if (
    setMapping === undefined ||
    setMapping === null ||
    typeof setMapping !== "object" ||
    Array.isArray(setMapping)
  ) return;

  for (const [key, _value] of safeEntries<unknown>(setMapping, "theming.set_mapping", issues)) {
    // Only `*` at the end (after a slash or as the whole key) is supported
    // as a wildcard — matches everything below the prefix. `**` and mid-key
    // wildcards aren't part of the v1.0.0 set_mapping syntax.
    const starCount = (key.match(/\*/g) ?? []).length;
    if (starCount === 0) continue;
    if (starCount > 1) {
      issues.push({
        severity: "error",
        path: `theming.set_mapping.${key}`,
        message:
          `Glob '${key}' contains ${starCount} wildcards. Only a single trailing '*' is supported in v1.0.0.`,
        rule: "profile-set-mapping-glob",
      });
      continue;
    }
    if (!key.endsWith("*")) {
      issues.push({
        severity: "error",
        path: `theming.set_mapping.${key}`,
        message:
          `Glob '${key}' has '*' in a non-trailing position. Only suffix wildcards are supported (e.g. 'Components/*').`,
        rule: "profile-set-mapping-glob",
      });
      continue;
    }
    if (key === "*") {
      issues.push({
        severity: "warning",
        path: `theming.set_mapping.${key}`,
        message:
          `Glob '*' matches every set_mapping target. Did you mean 'Prefix/*' for a category?`,
        rule: "profile-set-mapping-glob",
      });
    }
  }
}
