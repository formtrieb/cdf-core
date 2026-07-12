import type { CDFComponent, TokenMapping } from "../types/cdf.js";

/**
 * token_table (§13.3.1) — build-time matrix-compression for the
 * property × state × CSS-property token matrix.
 *
 * A part may declare a `token_table` block instead of hand-expanding every
 * `{css-prop}` and `{css-prop}--{state}` value-map. The table is expanded at
 * PARSE time into the canonical §13.3 value-maps, so validator, coverage, and
 * generator only ever see the flat form. This is pure build-time STRING
 * SUBSTITUTION over token NAMES — no arithmetic, no runtime composition — so it
 * is isomorphic to writing the value-maps by hand (Constitution Article I).
 *
 * Shape (inside `tokens.{part}`):
 *
 *   token_table:
 *     axis: variant                                  # the property axis = rows
 *     states: { hover: "{rest}-dark", active: "{rest}-darker" }   # optional step map
 *     background:                                    # a CSS-property column
 *       default:   color.primary                     #   row -> rest token (step-derived states)
 *       secondary: color.secondary
 *       accent:    { rest: color.accent, hover: color.accent-700 }  # explicit-cell fallback
 *
 * Expansion of the above yields, for part `container`:
 *   background:         { default: color.primary,      secondary: color.secondary, accent: color.accent }
 *   background--hover:  { default: color.primary-dark,  secondary: color.secondary-dark, accent: color.accent-700 }
 *   background--active: { default: color.primary-darker,secondary: color.secondary-darker }
 *
 * Hand-authored keys on the same part WIN over generated ones (per row), so a
 * spec can override individual cells alongside the table.
 */

const RESERVED_KEYS = new Set(["axis", "states"]);

/** Replace `{rest}` in a step template with the row's rest token name. */
function applyStep(restToken: string, template: string): string {
  return template.replaceAll("{rest}", restToken);
}

function expandPart(
  component: CDFComponent,
  partName: string,
  mapping: Record<string, unknown>,
  table: Record<string, unknown>
): TokenMapping {
  const axis = table.axis;
  if (typeof axis !== "string" || axis.length === 0) {
    throw new Error(`token_table in part '${partName}' MUST declare a string 'axis'.`);
  }
  if (!component.properties?.[axis] && !component.states?.[axis]) {
    throw new Error(
      `token_table axis '${axis}' in part '${partName}' names no declared property or state axis.`
    );
  }
  const states = (table.states ?? {}) as Record<string, string>;

  // Hand-authored keys (everything on the part except the table itself).
  const handAuthored: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mapping)) {
    if (k !== "token_table") handAuthored[k] = v;
  }

  // Generate value-maps from each CSS-property column.
  const generated: Record<string, Record<string, string>> = {};
  const addCell = (key: string, row: string, token: string) => {
    (generated[key] ??= {})[row] = token;
  };

  for (const [col, rowsRaw] of Object.entries(table)) {
    if (RESERVED_KEYS.has(col)) continue;
    if (rowsRaw == null || typeof rowsRaw !== "object") {
      throw new Error(`token_table column '${col}' in part '${partName}' must map rows to tokens.`);
    }
    for (const [row, cell] of Object.entries(rowsRaw as Record<string, unknown>)) {
      let restToken: string;
      const explicit: Record<string, string> = {};
      if (typeof cell === "string") {
        restToken = cell;
      } else if (cell && typeof cell === "object") {
        const obj = cell as Record<string, string>;
        if (typeof obj.rest !== "string") {
          throw new Error(
            `token_table cell '${col}.${row}' in part '${partName}' must be a token string or declare a 'rest' token.`
          );
        }
        restToken = obj.rest;
        for (const [s, t] of Object.entries(obj)) if (s !== "rest") explicit[s] = t;
      } else {
        throw new Error(`token_table cell '${col}.${row}' in part '${partName}' is malformed.`);
      }

      // Rest state → bare key.
      addCell(col, row, restToken);
      // Step-derived states.
      for (const [stateName, template] of Object.entries(states)) {
        addCell(`${col}--${stateName}`, row, explicit[stateName] ?? applyStep(restToken, template));
      }
      // Explicit-cell states not covered by the global step map.
      for (const [s, t] of Object.entries(explicit)) {
        if (!(s in states)) addCell(`${col}--${s}`, row, t);
      }
    }
  }

  // Merge — hand-authored wins per row over generated value-maps.
  const result: Record<string, unknown> = { ...handAuthored };
  for (const [key, genMap] of Object.entries(generated)) {
    const existing = result[key];
    if (existing == null) {
      result[key] = genMap;
    } else if (typeof existing === "object" && !Array.isArray(existing)) {
      result[key] = { ...genMap, ...(existing as Record<string, string>) };
    }
    // scalar existing → hand-authored override wins; leave as-is.
  }
  return result as TokenMapping;
}

/**
 * Expand every `token_table` block in a component to flat §13.3 value-maps.
 * Pure: returns the same component reference when no table is present.
 */
export function expandTokenTables(component: CDFComponent): CDFComponent {
  if (!component.tokens) return component;
  let changed = false;
  const newTokens: Record<string, TokenMapping> = {};
  for (const [partName, mapping] of Object.entries(component.tokens)) {
    const table = (mapping as Record<string, unknown> | null | undefined)?.token_table;
    if (!table || typeof table !== "object") {
      newTokens[partName] = mapping;
      continue;
    }
    changed = true;
    newTokens[partName] = expandPart(
      component,
      partName,
      mapping as unknown as Record<string, unknown>,
      table as Record<string, unknown>
    );
  }
  return changed ? { ...component, tokens: newTokens } : component;
}
