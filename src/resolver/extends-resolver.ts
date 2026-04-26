import { resolve as resolvePath, dirname } from "node:path";
import { parseProfileFile } from "../parser/profile-parser.js";
import type { DSProfile } from "../types/profile.js";
import type { ResolveExtendsResult, ProvenanceEntry } from "../types/extends-resolver.js";

/**
 * Resolve a profile's extends: chain (§4.5 + §15 of CDF-PROFILE-SPEC).
 * Returns merged form + provenance. Single-level is validated; N>1 level
 * works by construction and is exercised by tests.
 */
export function resolveExtends(profilePath: string): ResolveExtendsResult {
  const abs = resolvePath(profilePath);
  const chain = collectChain(abs);
  const merged = mergeChain(chain);
  const provenance = buildProvenance(chain);
  return {
    profile: abs,
    extends_chain: chain.map((p) => p.path),
    merged,
    provenance,
  };
}

interface LoadedProfile {
  path: string;
  profile: DSProfile;
}

function collectChain(leafPath: string, seen: Set<string> = new Set()): LoadedProfile[] {
  if (seen.has(leafPath)) {
    throw new Error(`Circular extends detected: ${[...seen, leafPath].join(" → ")}`);
  }
  seen.add(leafPath);
  const profile = parseProfileFile(leafPath);
  if (!profile.extends) {
    return [{ path: leafPath, profile }];
  }
  const parentPath = resolvePath(dirname(leafPath), profile.extends);
  const parentChain = collectChain(parentPath, seen);
  return [...parentChain, { path: leafPath, profile }];
}

function mergeChain(chain: LoadedProfile[]): DSProfile {
  // Start from root (first), merge each next on top per REPLACE semantics.
  let merged: DSProfile = { ...chain[0].profile };
  for (let i = 1; i < chain.length; i++) {
    merged = replaceMerge(merged, chain[i].profile);
  }
  return merged;
}

/** Per-key REPLACE merge (§15.1): child keys fully replace parent keys at top level,
 * except nested-record sections which are deep-merged per §15.1. For v1.6.0 we
 * deep-merge all top-level record-shaped fields (vocabularies, token_grammar,
 * interaction_patterns, theming, naming, categories, standalone_tokens). Scalar
 * top-level fields (name, version, description, extends) take child value. */
function replaceMerge(parent: DSProfile, child: DSProfile): DSProfile {
  const result = { ...parent };
  for (const key of Object.keys(child) as Array<keyof DSProfile>) {
    const cv = child[key];
    const pv = parent[key];
    if (
      typeof cv === "object" && cv !== null && !Array.isArray(cv) &&
      typeof pv === "object" && pv !== null && !Array.isArray(pv)
    ) {
      // Deep merge record-shaped fields
      (result[key] as Record<string, unknown>) = {
        ...(pv as Record<string, unknown>),
        ...(cv as Record<string, unknown>),
      };
    } else {
      // Replace non-record fields (scalars, arrays, undefined)
      (result[key] as unknown) = cv;
    }
  }
  return result as DSProfile;
}

function buildProvenance(chain: LoadedProfile[]): Record<string, ProvenanceEntry> {
  if (chain.length < 2) return {};
  const provenance: Record<string, ProvenanceEntry> = {};

  // Compare each layer against the previous (merged) state.
  let acc: DSProfile = { ...chain[0].profile };
  for (let i = 1; i < chain.length; i++) {
    const own = chain[i].profile;
    const ownSource = chain[i].path;
    const parentSource = chain[i - 1].path;
    for (const key of Object.keys(own) as Array<keyof DSProfile>) {
      // Skip the `extends:` field itself — it's structural, not semantic.
      if (key === "extends") continue;

      const ownVal = own[key];
      if (ownVal === undefined) continue;
      const parentVal = acc[key];

      if (parentVal === undefined) {
        provenance[String(key)] = { action: "added", source: ownSource };
      } else if (
        typeof ownVal === "object" && ownVal !== null && !Array.isArray(ownVal) &&
        typeof parentVal === "object" && parentVal !== null && !Array.isArray(parentVal)
      ) {
        // Deep-merge: check each nested key.
        for (const nk of Object.keys(ownVal as Record<string, unknown>)) {
          const nestedOwn = (ownVal as Record<string, unknown>)[nk];
          if (nestedOwn === undefined) continue;
          const nestedParent = (parentVal as Record<string, unknown>)[nk];
          const path = `${String(key)}.${nk}`;
          if (nestedParent === undefined) {
            provenance[path] = { action: "added", source: ownSource };
          } else if (!deepEqual(nestedOwn, nestedParent)) {
            provenance[path] = {
              action: "overridden",
              source: ownSource,
              parent_source: parentSource,
              parent_value: nestedParent,
              own_value: nestedOwn,
            };
          }
        }
      } else if (!deepEqual(ownVal, parentVal)) {
        provenance[String(key)] = {
          action: "overridden",
          source: ownSource,
          parent_source: parentSource,
          parent_value: parentVal,
          own_value: ownVal,
        };
      }
    }
    acc = replaceMerge(acc, own);
  }
  return provenance;
}

function deepEqual(a: unknown, b: unknown): boolean {
  // Safe for profile values: plain objects, no undefined/Date/Symbol/circular refs.
  return JSON.stringify(a) === JSON.stringify(b);
}
