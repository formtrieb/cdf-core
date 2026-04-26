import type { CDFComponent } from "../types/cdf.js";
import { expandTokenPath, extractPlaceholders } from "../resolver/token-expander.js";

/**
 * Token keys that contain metadata rather than token path references.
 * These are skipped during expansion and coverage analysis.
 */
const METADATA_KEYS = new Set(["pattern", "applies_to"]);

/**
 * Values that are CSS literals or layout keywords, not token path references.
 * These should not be checked against the token tree.
 */
const CSS_LITERALS = new Set([
  // CSS display / sizing
  "hug", "auto", "inline-flex", "flex", "block", "inline", "none",
  // CSS border styles
  "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset",
  // CSS colors
  "currentColor", "transparent", "inherit",
  // CSS overflow / layout
  "scrollable", "hidden", "visible", "scroll", "horizontal-wrap", "vertical-wrap", "wrap",
  // CSS misc
  "round", "infinite",
]);

/**
 * Check if a value is a CSS literal rather than a token path reference.
 */
function isCSSLiteral(value: string): boolean {
  if (CSS_LITERALS.has(value)) return true;
  // Match patterns like "2px", "75% of circumference", "rotate(360deg)"
  if (/^\d/.test(value) || /^-?\d/.test(value)) return true;
  if (value.includes("(") && value.includes(")")) return true;
  if (value.includes("% ")) return true;
  return false;
}

/**
 * Token block names that contain metadata, not token path references.
 */
const METADATA_BLOCKS = new Set(["focus"]);

export interface CoverageReport {
  components: ComponentCoverage[];
  systemWidePaths: string[];
  unusedPaths: string[];
}

export interface ComponentCoverage {
  name: string;
  expandedPaths: string[];
  unexpandablePaths: string[];
  placeholderCount: number;
}

/**
 * Analyze token path coverage for a single component.
 * Expands all {placeholder} paths and reports which paths are used.
 *
 * When `allComponents` is provided, `extends` parents are resolved
 * so that parent properties/states are available for placeholder expansion.
 */
export function analyzeComponentCoverage(
  component: CDFComponent,
  allComponents?: CDFComponent[]
): ComponentCoverage {
  const expandedPaths: string[] = [];
  const unexpandablePaths: string[] = [];

  if (!component.tokens) {
    return { name: component.name, expandedPaths, unexpandablePaths, placeholderCount: 0 };
  }

  // Merge parent properties/states for extends components
  let properties = component.properties ?? {};
  let states = component.states ?? {};

  if (component.extends && allComponents) {
    const parentName = component.extends.replace(/\.spec\.yaml$/, "");
    const parent = allComponents.find(
      (c) => c.name.toLowerCase() === parentName.toLowerCase()
    );
    if (parent) {
      // Parent first, child overrides
      properties = { ...(parent.properties ?? {}), ...properties };
      states = { ...(parent.states ?? {}), ...states };
    }
  }

  for (const [partName, mapping] of Object.entries(component.tokens)) {
    // Skip metadata blocks (e.g. focus: { pattern, applies_to })
    if (METADATA_BLOCKS.has(partName)) continue;

    for (const [tokenKey, tokenValue] of Object.entries(mapping)) {
      // Skip metadata keys within token blocks
      if (METADATA_KEYS.has(tokenKey)) continue;

      if (typeof tokenValue !== "string") {
        // Size map or special value
        if (tokenValue && typeof tokenValue === "object") {
          for (const path of Object.values(tokenValue)) {
            if (typeof path === "string" && !isCSSLiteral(path)) {
              expandedPaths.push(path);
            }
          }
        }
        continue;
      }

      // Skip CSS literals (not token references)
      if (isCSSLiteral(tokenValue)) continue;

      const placeholders = extractPlaceholders(tokenValue);
      if (placeholders.length === 0) {
        expandedPaths.push(tokenValue);
        continue;
      }

      try {
        const expanded = expandTokenPath(tokenValue, properties, states);
        expandedPaths.push(...expanded.filter((p) => !isCSSLiteral(p)));
      } catch {
        unexpandablePaths.push(tokenValue);
      }
    }
  }

  return {
    name: component.name,
    expandedPaths,
    unexpandablePaths,
    placeholderCount: unexpandablePaths.length,
  };
}

/**
 * Analyze token coverage across multiple components.
 */
export function analyzeCoverage(components: CDFComponent[]): CoverageReport {
  const componentReports = components.map((c) => analyzeComponentCoverage(c, components));
  const allPaths = new Set<string>();

  for (const report of componentReports) {
    for (const path of report.expandedPaths) {
      allPaths.add(path);
    }
  }

  return {
    components: componentReports,
    systemWidePaths: [...allPaths].sort(),
    unusedPaths: [], // Populated when cross-referenced with actual token tree
  };
}
