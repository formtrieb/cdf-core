import type { Property, State } from "../types/cdf.js";

/**
 * Expand {placeholder} values in a token path into all concrete paths.
 *
 * Example:
 *   path: "color.controls.{hierarchy}.background.{interaction}"
 *   properties: { hierarchy: { values: [brand, primary, secondary, tertiary] } }
 *   states: { interaction: { values: [enabled, hover, pressed, disabled] } }
 *   → 16 concrete paths (4 × 4)
 */
export function expandTokenPath(
  path: string,
  properties: Record<string, Property>,
  states: Record<string, State>
): string[] {
  const placeholders = path.match(/\{(\w+)\}/g);
  if (!placeholders) return [path];

  let paths = [path];

  for (const placeholder of placeholders) {
    const name = placeholder.slice(1, -1);
    const prop = properties[name];
    const state = states[name];
    const rawValues =
      prop?.values ??
      state?.values ??
      [];

    if (rawValues.length === 0) {
      throw new Error(`Placeholder {${name}} not found in properties or states`);
    }

    // Apply token_mapping if the property or state defines one
    // Properties: intent: success → color.*.positive.* → "positive"
    // States: focused → "active" (direct value mapping)
    const tokenMapping = prop?.token_mapping ?? state?.token_mapping;
    const values = tokenMapping
      ? rawValues.map((v) => extractTokenName(tokenMapping[v]) ?? v)
      : rawValues;

    paths = paths.flatMap((p) => values.map((v) => p.replace(placeholder, v)));
  }

  return paths;
}

/**
 * Extract the semantic token name from a token_mapping value.
 *
 * token_mapping values use patterns like:
 *   "color.*.positive.*"  → extracts "positive"
 *   "color.*.neutral.* / color.text.primary" → extracts "neutral"
 *
 * The relevant name is the segment that differs from the key.
 */
function extractTokenName(mapping: string | undefined): string | undefined {
  if (!mapping) return undefined;
  // Take first alternative (before " / ")
  const primary = mapping.split(" / ")[0].trim();
  // Extract segments between wildcards: "color.*.positive.*" → ["positive"]
  const segments = primary.split(".").filter((s) => s !== "*" && s !== "color");
  // Return the last meaningful segment
  return segments[segments.length - 1];
}

/**
 * Extract all placeholders from a token path.
 */
export function extractPlaceholders(path: string): string[] {
  const matches = path.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Parse state-qualified token keys.
 *
 * "color" → { base: "color", qualifiers: [] }
 * "color--tertiary" → { base: "color", qualifiers: ["tertiary"] }
 * "color--unselected--hover" → { base: "color", qualifiers: ["unselected", "hover"] }
 */
export function parseTokenKey(key: string): { base: string; qualifiers: string[] } {
  const parts = key.split("--");
  return {
    base: parts[0],
    qualifiers: parts.slice(1),
  };
}
