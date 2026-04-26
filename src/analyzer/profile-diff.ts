import { resolveExtends } from "../resolver/extends-resolver.js";
import { parseProfileFile } from "../parser/profile-parser.js";
import type {
  ProfileDiffResult,
  ProfileDiffChange,
  DiffImpact,
  DiffOptions,
} from "../types/profile-diff.js";

/**
 * Structural diff between two profiles.
 * Default raw:false merges extends on both sides before comparison.
 * raw:true diffs as-written YAML (useful for "what did this file change?").
 */
export function diffProfiles(
  beforePath: string,
  afterPath: string,
  opts: DiffOptions = {},
): ProfileDiffResult {
  const before = opts.raw
    ? parseProfileFile(beforePath)
    : resolveExtends(beforePath).merged;
  const after = opts.raw
    ? parseProfileFile(afterPath)
    : resolveExtends(afterPath).merged;

  const changes: ProfileDiffChange[] = [];
  const scope = opts.section
    ? {
        before: { [opts.section]: (before as unknown as Record<string, unknown>)[opts.section] },
        after: { [opts.section]: (after as unknown as Record<string, unknown>)[opts.section] },
      }
    : {
        before: before as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
      };

  diffObjects(scope.before, scope.after, "", changes);

  const impact: DiffImpact = {
    vocabularies_changed: changes.some((c) => c.path.startsWith("vocabularies")),
    token_grammar_changed: changes.some((c) => c.path.startsWith("token_grammar")),
    theming_changed: changes.some((c) => c.path.startsWith("theming")),
    interaction_patterns_changed: changes.some((c) => c.path.startsWith("interaction_patterns")),
    set_mapping_changed: changes.some((c) => c.path.startsWith("theming.set_mapping")),
    token_layers_changed: changes.some((c) => c.path.startsWith("token_layers")),
    extends_chain_changed: changes.some((c) => c.path === "extends"),
  };

  return { changes, impact };
}

function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix: string,
  changes: ProfileDiffChange[],
): void {
  const allKeys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const bVal = before?.[key];
    const aVal = after?.[key];

    if (bVal === undefined && aVal !== undefined) {
      changes.push({ type: "added", path, after: aVal });
    } else if (bVal !== undefined && aVal === undefined) {
      changes.push({ type: "removed", path, before: bVal });
    } else if (
      typeof bVal === "object" && typeof aVal === "object" &&
      bVal !== null && aVal !== null &&
      !Array.isArray(bVal) && !Array.isArray(aVal)
    ) {
      diffObjects(
        bVal as Record<string, unknown>,
        aVal as Record<string, unknown>,
        path,
        changes,
      );
    } else if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      changes.push({ type: "changed", path, before: bVal, after: aVal });
    }
  }
}
