import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYAML } from "yaml";
import type { DSProfile } from "../../types/profile.js";
import type { Issue, ValidationReport } from "../../types/cdf.js";
import { checkProfileStructural } from "./rules/structural.js";
import { checkProfileSemantic } from "./rules/semantic.js";
import { checkProfileReferences } from "./rules/references.js";

/**
 * Profile-validator options. The default validation is "L0–L7" — fast,
 * deterministic, no filesystem reach beyond `extends:` resolution. L8
 * (token-reference resolution) is opt-in because it requires the DS's
 * DTCG token files to be mounted relative to `baseDir`.
 */
export interface ProfileValidationOptions {
  /**
   * L8 — resolve `interaction_patterns.<p>.token_mapping` paths against
   * the DTCG files declared in `token_sources`. Off by default. When on
   * and token sources are not reachable, a warning is emitted and L8 is
   * skipped (does not block the rest of the report).
   */
  resolveTokens?: boolean;
  /**
   * Profile-relative base for resolving `extends:` and `token_sources`
   * paths. Defaults to the directory of `fileName` if validateProfileFile
   * is used, otherwise the current working directory.
   */
  baseDir?: string;
}

/**
 * Validate a CDF Profile YAML string. Never throws — every error surfaces
 * as an Issue in the returned report. Designed to be called from MCP tools
 * and skill phases where structured feedback matters more than fail-fast.
 *
 * Levels:
 *   L0  Parseable YAML
 *   L1  Required top-level fields (extends-aware)
 *   L2  Field types correct (vocabularies = map<string, string[]>, etc.)
 *   L3  Schema baking — only known top-level keys
 *   L4  Cross-field structural (theming.modes references valid axes, etc.)
 *   L5  Vocabulary Isolation Rule (Profile §5.5)
 *   L6  `extends:` resolution (target exists, parseable, no cycles)
 *   L7  `set_mapping` glob syntax + targets
 *   L8  Token reference resolution (opt-in via `resolveTokens: true`)
 */
export function validateProfile(
  yamlContent: string,
  options?: ProfileValidationOptions,
  fileName = "<inline>",
): ValidationReport {
  const issues: Issue[] = [];
  const opts = options ?? {};

  // ── L0: parse ──────────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = parseYAML(yamlContent);
  } catch (err) {
    issues.push({
      severity: "error",
      path: "<root>",
      message: `Profile YAML is not parseable: ${(err as Error).message}`,
      rule: "profile-parseable",
    });
    return finalize(fileName, issues);
  }
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push({
      severity: "error",
      path: "<root>",
      message: "Profile root must be a YAML mapping (object), got " +
        (Array.isArray(raw) ? "array" : typeof raw) + ".",
      rule: "profile-parseable",
    });
    return finalize(fileName, issues);
  }
  const profile = raw as Partial<DSProfile> & Record<string, unknown>;

  // ── L1–L4: structural ──────────────────────────────────────────────────
  issues.push(...checkProfileStructural(profile));

  // ── L5–L7: semantic (only run if structural didn't catastrophically fail) ─
  // We allow semantic rules to run even when individual structural errors
  // exist — they handle missing fields gracefully. The early-exit gate is
  // only "is `profile` an object at all", which we already verified above.
  issues.push(...checkProfileSemantic(profile, opts.baseDir, fileName));

  // ── L8: references (opt-in) ────────────────────────────────────────────
  if (opts.resolveTokens) {
    issues.push(...checkProfileReferences(profile, opts.baseDir, fileName));
  }

  return finalize(fileName, issues, opts.resolveTokens ?? false);
}

/**
 * Validate a Profile file from disk. Sets `baseDir` from the file's
 * directory so that `extends:` and `token_sources` paths resolve correctly.
 */
export function validateProfileFile(
  filePath: string,
  options?: ProfileValidationOptions,
): ValidationReport {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    return finalize(filePath, [{
      severity: "error",
      path: "<file>",
      message: `Cannot read profile file: ${(err as Error).message}`,
      rule: "profile-file-readable",
    }]);
  }
  const merged: ProfileValidationOptions = {
    ...options,
    baseDir: options?.baseDir ?? dirname(filePath),
  };
  return validateProfile(content, merged, filePath);
}

function finalize(
  fileName: string,
  issues: Issue[],
  l8Run = false,
): ValidationReport {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const info = issues.filter((i) => i.severity === "info");

  // Surface which levels ran so callers can advertise the validation depth.
  // L0–L7 always run; L8 is opt-in. Synthesize an info issue rather than
  // mutating the ValidationReport shape (consumer-stable).
  const levels = l8Run ? "L0-L8" : "L0-L7";
  info.unshift({
    severity: "info",
    path: "<context>",
    message: `Profile validation depth: ${levels}.`,
    rule: "profile-validation-depth",
  });

  return {
    file: fileName,
    valid: errors.length === 0,
    errors,
    warnings,
    info,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      info: info.length,
    },
  };
}
