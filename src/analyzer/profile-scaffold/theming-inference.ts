/**
 * Theming inference — turns `ScaffoldInput.modes[]` into
 * `theming.modifiers`. Low-ambiguity mapping; known collection names
 * (Theme, Density, Device, Shape) alias to their canonical Formtrieb-
 * conventional modifier names. Anything else passes through as its
 * lowercased name.
 *
 * No elicitation — per §3.4 "If the user needs to rename/merge
 * modifiers, they edit the generated YAML manually."
 *
 * Design §3.4.
 */

import type {
  ScaffoldInputMode,
} from "./input-parser.js";
import type { ThemingConfig, ThemeModifier } from "../../types/profile.js";

/** Known collection-name aliases (case-insensitive lookup). */
const COLLECTION_ALIASES: Record<string, string> = {
  theme: "semantic",
  semantic: "semantic",
  density: "density",
  device: "device",
  shape: "shape",
};

export function inferTheming(modes: ScaffoldInputMode[]): ThemingConfig {
  const modifiers: Record<string, ThemeModifier> = {};

  for (const mode of modes) {
    const canonicalName = aliasOrLowercase(mode.collection);
    modifiers[canonicalName] = {
      description: buildDescription(mode.collection, canonicalName),
      contexts: [...mode.values],
    };
  }

  return { modifiers, set_mapping: {} };
}

function aliasOrLowercase(collection: string): string {
  const key = collection.toLowerCase();
  return COLLECTION_ALIASES[key] ?? key;
}

function buildDescription(source: string, canonical: string): string {
  if (canonical !== source.toLowerCase()) {
    return `Scaffold-inferred from mode collection "${source}" (aliased to canonical "${canonical}").`;
  }
  return `Scaffold-inferred from mode collection "${source}".`;
}
