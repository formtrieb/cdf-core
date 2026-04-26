/**
 * Prior-art index — extracts structural signals from
 * `<examples>/*.profile.yaml` for recommendation-seeding and
 * pattern-recognition during profile scaffolding.
 *
 * Two layers:
 *   - `buildPriorArtIndex(profiles)` — pure; testable without disk I/O
 *   - `loadPriorArtIndex(examplesDir)` — filesystem convenience; reads
 *     a directory of `<ds>/<ds>.profile.yaml` files. The caller MUST
 *     pass the directory; there is no implicit walk-up to the
 *     repo-root `cdf/examples/` because that path doesn't exist
 *     post-extract for npm consumers.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProfile } from "../../parser/profile-parser.js";
import type { DSProfile } from "../../types/profile.js";

export interface PriorArtVocab {
  usedInDSes: string[];
  commonValues: Set<string>;
}

export interface PriorArtState {
  usedInDSes: string[];
}

export interface PriorArtThemingModifier {
  usedInDSes: string[];
  contexts: string[];
}

export interface PriorArtGrammar {
  pattern: string;
  usedInDSes: string[];
}

export interface PriorArtIndex {
  vocabularies: Map<string, PriorArtVocab>;
  interactionStates: Map<string, PriorArtState>;
  themingModifiers: Map<string, PriorArtThemingModifier>;
  grammarPatterns: PriorArtGrammar[];
}

export interface PriorArtSource {
  ds: string;
  profile: DSProfile;
}

export function buildPriorArtIndex(sources: PriorArtSource[]): PriorArtIndex {
  const vocabularies = new Map<string, PriorArtVocab>();
  const interactionStates = new Map<string, PriorArtState>();
  const themingModifiers = new Map<string, PriorArtThemingModifier>();
  const grammarByPattern = new Map<string, PriorArtGrammar>();

  for (const { ds, profile } of sources) {
    for (const [name, vocab] of Object.entries(profile.vocabularies ?? {})) {
      const entry = vocabularies.get(name) ?? {
        usedInDSes: [],
        commonValues: new Set<string>(),
      };
      pushUnique(entry.usedInDSes, ds);
      for (const v of vocab.values) entry.commonValues.add(v);
      vocabularies.set(name, entry);
    }

    for (const pattern of Object.values(profile.interaction_patterns ?? {})) {
      for (const state of pattern.states) {
        const entry = interactionStates.get(state) ?? { usedInDSes: [] };
        pushUnique(entry.usedInDSes, ds);
        interactionStates.set(state, entry);
      }
    }

    for (const [name, modifier] of Object.entries(
      profile.theming?.modifiers ?? {},
    )) {
      const entry = themingModifiers.get(name) ?? {
        usedInDSes: [],
        contexts: [],
      };
      pushUnique(entry.usedInDSes, ds);
      for (const ctx of modifier.contexts ?? []) pushUnique(entry.contexts, ctx);
      themingModifiers.set(name, entry);
    }

    for (const grammar of Object.values(profile.token_grammar ?? {})) {
      const pattern = grammar.pattern;
      if (!pattern) continue;
      const entry = grammarByPattern.get(pattern) ?? { pattern, usedInDSes: [] };
      pushUnique(entry.usedInDSes, ds);
      grammarByPattern.set(pattern, entry);
    }
  }

  return {
    vocabularies,
    interactionStates,
    themingModifiers,
    grammarPatterns: [...grammarByPattern.values()],
  };
}

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

// ─── Filesystem loader ──────────────────────────────────────────────────────

/**
 * Read every `<examplesDir>/<ds>/<ds>.profile.yaml` and build a
 * prior-art index from them. The caller owns the path: the Skill
 * (cdf-profile-scaffold) reads it from `.cdf.config.yaml` under
 * `scaffold.examples_dir`; tests pass an explicit fixture path.
 */
export function loadPriorArtIndex(examplesDir: string): PriorArtIndex {
  const sources: PriorArtSource[] = [];

  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const profilePath = join(examplesDir, entry.name, `${entry.name}.profile.yaml`);
    let yaml: string;
    try {
      yaml = readFileSync(profilePath, "utf8");
    } catch {
      continue; // subdir without a conventionally-named profile — skip
    }
    sources.push({ ds: entry.name, profile: parseProfile(yaml) });
  }

  return buildPriorArtIndex(sources);
}
