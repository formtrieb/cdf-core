import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import type { Issue } from "../../../types/cdf.js";

/**
 * L8 (opt-in) — token-reference resolution.
 *
 * Walks `interaction_patterns.<p>.token_mapping` paths and verifies each
 * one exists in the DTCG token files declared in `token_sources`. When
 * `token_sources` isn't declared or the files aren't reachable, emits a
 * single `warning` and exits — degrades gracefully so callers can run
 * L8 opportunistically without preflight checks.
 *
 * The DTCG resolution strategy is intentionally lightweight: we walk the
 * full set of source files into one merged token tree (later writes win,
 * matching DTCG's documented merge), then check each `pattern → token-path`
 * resolves to a leaf with a `$value`. A future pass could integrate the
 * tokens-core resolver for full alias chasing; today we only check the
 * direct-target path resolves.
 */
export function checkProfileReferences(
  profile: Record<string, unknown>,
  baseDir: string | undefined,
  fileName: string,
): Issue[] {
  const issues: Issue[] = [];
  const dir = baseDir ?? (fileName !== "<inline>" ? dirname(fileName) : process.cwd());

  // ── Locate token_sources block ─────────────────────────────────────────
  const tokenSources = profile.token_sources;
  if (
    tokenSources === undefined ||
    tokenSources === null ||
    typeof tokenSources !== "object" ||
    Array.isArray(tokenSources)
  ) {
    issues.push({
      severity: "warning",
      path: "<context>",
      message:
        "L8 (resolveTokens) requested but Profile has no 'token_sources' block. " +
        "L8 skipped — declare token_sources to enable token-reference resolution.",
      rule: "profile-l8-skipped",
    });
    return issues;
  }

  const ts = tokenSources as Record<string, unknown>;
  const tsDir = typeof ts.directory === "string" ? ts.directory : ".";
  const sets = ts.sets;
  if (sets === null || sets === undefined || typeof sets !== "object" || Array.isArray(sets)) {
    issues.push({
      severity: "warning",
      path: "token_sources.sets",
      message:
        "token_sources.sets is missing or malformed. L8 skipped — sets must be a map of " +
        "set-name to filename for token-reference resolution.",
      rule: "profile-l8-skipped",
    });
    return issues;
  }

  // ── Load DTCG sources ──────────────────────────────────────────────────
  const tokenTree: Record<string, unknown> = {};
  const sourcesDir = resolve(dir, tsDir);
  if (!existsSync(sourcesDir) || !statSync(sourcesDir).isDirectory()) {
    issues.push({
      severity: "warning",
      path: "token_sources.directory",
      message:
        `Token sources directory '${sourcesDir}' not found or not a directory. ` +
        "L8 skipped.",
      rule: "profile-l8-skipped",
    });
    return issues;
  }

  let loadedAny = false;
  for (const [setName, fileName] of Object.entries(sets as Record<string, unknown>)) {
    if (typeof fileName !== "string") {
      issues.push({
        severity: "error",
        path: `token_sources.sets.${setName}`,
        message: `Set '${setName}' file must be a string filename, got ${typeof fileName}.`,
        rule: "profile-token-sources-shape",
      });
      continue;
    }
    const filePath = join(sourcesDir, fileName);
    if (!existsSync(filePath)) {
      issues.push({
        severity: "warning",
        path: `token_sources.sets.${setName}`,
        message:
          `Token file '${filePath}' for set '${setName}' not found. ` +
          "Skipping this set in L8 resolution.",
        rule: "profile-token-source-missing",
      });
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        deepMerge(tokenTree, parsed);
        loadedAny = true;
      }
    } catch (err) {
      issues.push({
        severity: "error",
        path: `token_sources.sets.${setName}`,
        message: `Cannot parse token file '${filePath}': ${(err as Error).message}`,
        rule: "profile-token-source-parseable",
      });
    }
  }

  if (!loadedAny) {
    issues.push({
      severity: "warning",
      path: "<context>",
      message: "L8: no token files were successfully loaded — references not resolved.",
      rule: "profile-l8-skipped",
    });
    return issues;
  }

  // ── Walk interaction_patterns.<p>.token_mapping references ─────────────
  const patterns = profile.interaction_patterns;
  if (
    patterns === undefined ||
    patterns === null ||
    typeof patterns !== "object" ||
    Array.isArray(patterns)
  ) {
    return issues;
  }

  for (const [pName, pRaw] of Object.entries(patterns as Record<string, unknown>)) {
    if (pRaw === null || typeof pRaw !== "object" || Array.isArray(pRaw)) continue;
    const tm = (pRaw as { token_mapping?: unknown }).token_mapping;
    if (tm === null || tm === undefined || typeof tm !== "object" || Array.isArray(tm)) continue;
    for (const [stateOrSlot, refRaw] of Object.entries(tm as Record<string, unknown>)) {
      if (typeof refRaw !== "string") continue;
      // Strip the {} surrounding curly braces if present (DTCG alias style).
      const ref = refRaw.replace(/^\{|\}$/g, "");
      // Skip refs containing template placeholders ({hierarchy}, {state})
      // — those are pattern-references that resolve at component-bind time,
      // not at Profile-validation time.
      if (ref.includes("{")) continue;
      if (!resolveTokenPath(tokenTree, ref)) {
        issues.push({
          severity: "warning",
          path: `interaction_patterns.${pName}.token_mapping.${stateOrSlot}`,
          message:
            `Token reference '${refRaw}' does not resolve in token_sources. ` +
            "Check the path matches a token-tree leaf with a $value.",
          rule: "profile-token-ref-unresolved",
        });
      }
    }
  }

  return issues;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(source)) {
    const existing = target[k];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      target[k] = v;
    }
  }
}

/**
 * Walk a dotted token path (e.g. "color.controls.primary.background.default")
 * and return true if it lands on a leaf with `$value`. Tolerates DTCG groups
 * (intermediate objects) and explicit leaves alike.
 */
function resolveTokenPath(tree: Record<string, unknown>, path: string): boolean {
  const parts = path.split(".");
  let cursor: unknown = tree;
  for (const p of parts) {
    if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) return false;
    cursor = (cursor as Record<string, unknown>)[p];
    if (cursor === undefined) return false;
  }
  if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) return false;
  return Object.prototype.hasOwnProperty.call(cursor, "$value");
}
