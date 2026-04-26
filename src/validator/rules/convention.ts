import type { CDFComponent, CDFConfig, Issue } from "../../types/cdf.js";
import type { DSProfile } from "../../types/profile.js";
import { safeEntries } from "./safe-utils.js";

/**
 * Convention validation rules — info severity.
 * Reads from DSProfile (ds_profile) if available, falls back to legacy
 * inline CDFProfile (profile) for backward compatibility.
 */
export function checkConvention(component: CDFComponent, config?: CDFConfig): Issue[] {
  const dsProfile = config?.ds_profile;
  const legacyProfile = config?.profile;

  if (!dsProfile && !legacyProfile) return [];
  if (dsProfile) return checkWithDSProfile(component, dsProfile);
  return checkWithLegacyProfile(component, legacyProfile!, config!);
}

function checkWithDSProfile(component: CDFComponent, profile: DSProfile): Issue[] {
  const issues: Issue[] = [];

  // ── category-known ──────────────────────────────────────────────────────────
  if (component.category) {
    const knownCategories = Object.keys(profile.categories);
    if (!knownCategories.includes(component.category)) {
      issues.push({
        severity: "info", path: "category",
        message: `Category '${component.category}' is not defined in the Profile [${knownCategories.join(", ")}].`,
        rule: "category-known",
      });
    }
  }

  // ── theme-axes-match ────────────────────────────────────────────────────────
  if (component.theme_axes && profile.theming?.modifiers) {
    for (const [axisName, axis] of safeEntries<NonNullable<CDFComponent["theme_axes"]>[string]>(
      component.theme_axes, "theme_axes", issues
    )) {
      const modifier = profile.theming.modifiers[axisName];
      if (!modifier) {
        issues.push({
          severity: "info", path: `theme_axes.${axisName}`,
          message: `Theme axis '${axisName}' is not defined in the Profile modifiers.`,
          rule: "theme-axes-match",
        });
        continue;
      }
      for (const value of axis.values) {
        if (!modifier.contexts.includes(value)) {
          issues.push({
            severity: "info", path: `theme_axes.${axisName}.values`,
            message: `Theme axis value '${value}' is not in the Profile contexts [${modifier.contexts.join(", ")}].`,
            rule: "theme-axes-match",
          });
        }
      }
    }
  }

  // ── token-pattern-match ─────────────────────────────────────────────────────
  if (component.tokens && profile.token_grammar) {
    for (const [partName, mapping] of safeEntries<Record<string, unknown>>(
      component.tokens, "tokens", issues
    )) {
      for (const [tokenKey, tokenValue] of safeEntries(mapping, `tokens.${partName}`, issues)) {
        if (typeof tokenValue !== "string" || !tokenValue.includes(".")) continue;

        for (const [grammarName, grammar] of Object.entries(profile.token_grammar)) {
          const patternPrefix = grammar.pattern.split(".{")[0];
          if (tokenValue.startsWith(patternPrefix + ".")) {
            if (!matchesPattern(tokenValue, grammar.pattern)) {
              issues.push({
                severity: "info", path: `tokens.${partName}.${tokenKey}`,
                message: `Token path '${tokenValue}' does not match grammar '${grammarName}' pattern '${grammar.pattern}'.`,
                rule: "token-pattern-match",
              });
            }
          }
        }
      }
    }
  }

  // ── prefix-consistent ───────────────────────────────────────────────────────
  if (profile.naming?.css_prefix && component.css) {
    const prefix = profile.naming.css_prefix;
    if (component.css.prefix && component.css.prefix !== prefix) {
      issues.push({
        severity: "info", path: "css.prefix",
        message: `CSS prefix '${component.css.prefix}' does not match Profile prefix '${prefix}'.`,
        rule: "prefix-consistent",
      });
    }
    if (component.css.class_pattern && !component.css.class_pattern.includes(prefix)) {
      issues.push({
        severity: "info", path: "css.class_pattern",
        message: `Class pattern does not include Profile prefix '${prefix}'.`,
        rule: "prefix-consistent",
      });
    }
  }

  // ── naming-convention ───────────────────────────────────────────────────────
  if (component.properties && profile.naming?.reserved_names) {
    const reserved = profile.naming.reserved_names;
    for (const [name] of safeEntries(component.properties, "properties", issues)) {
      for (const [reservedName] of Object.entries(reserved)) {
        if (name === reservedName) continue;
        if (reservedName === "interaction" && (name === "state" || name === "status" || name === "mode")) {
          issues.push({
            severity: "info", path: `properties.${name}`,
            message: `Property '${name}' should be named '${reservedName}' per Profile convention.`,
            rule: "naming-convention",
          });
        }
        if (reservedName === "hierarchy" && (name === "emphasis" || name === "priority" || name === "level")) {
          issues.push({
            severity: "info", path: `properties.${name}`,
            message: `Property '${name}' should be named '${reservedName}' per Profile convention.`,
            rule: "naming-convention",
          });
        }
      }
    }
  }

  return issues;
}

// ── Legacy fallback (existing behavior, unchanged) ────────────────────────────

function checkWithLegacyProfile(
  component: CDFComponent,
  profile: NonNullable<CDFConfig["profile"]>,
  _config: CDFConfig,
): Issue[] {
  const issues: Issue[] = [];

  if (component.category) {
    const knownCategories = ["Primitives", "Actions", "Inputs", "Status", "Layout"];
    if (!knownCategories.includes(component.category)) {
      issues.push({ severity: "info", path: "category", message: `Category '${component.category}' is not a standard category [${knownCategories.join(", ")}].`, rule: "category-known" });
    }
  }

  if (component.theme_axes && profile.theme_axes) {
    for (const [axisName, axis] of safeEntries<NonNullable<CDFComponent["theme_axes"]>[string]>(component.theme_axes, "theme_axes", issues)) {
      const profileValues = profile.theme_axes[axisName];
      if (!profileValues) {
        issues.push({ severity: "info", path: `theme_axes.${axisName}`, message: `Theme axis '${axisName}' is not defined in the DS profile.`, rule: "theme-axes-match" });
        continue;
      }
      for (const value of axis.values) {
        if (!profileValues.includes(value)) {
          issues.push({ severity: "info", path: `theme_axes.${axisName}.values`, message: `Theme axis value '${value}' is not in the profile's values [${profileValues.join(", ")}].`, rule: "theme-axes-match" });
        }
      }
    }
  }

  if (component.tokens && (profile.token_pattern_interactive || profile.token_pattern_status)) {
    for (const [partName, mapping] of safeEntries<Record<string, unknown>>(component.tokens, "tokens", issues)) {
      for (const [tokenKey, tokenValue] of safeEntries(mapping, `tokens.${partName}`, issues)) {
        if (typeof tokenValue !== "string" || !tokenValue.includes(".")) continue;
        if (profile.token_pattern_interactive && tokenValue.startsWith("color.controls.")) {
          if (!matchesPattern(tokenValue, profile.token_pattern_interactive)) {
            issues.push({ severity: "info", path: `tokens.${partName}.${tokenKey}`, message: `Token path '${tokenValue}' does not match interactive pattern '${profile.token_pattern_interactive}'.`, rule: "token-pattern-match" });
          }
        }
        if (profile.token_pattern_status && tokenValue.startsWith("color.system-status.")) {
          if (!matchesPattern(tokenValue, profile.token_pattern_status)) {
            issues.push({ severity: "info", path: `tokens.${partName}.${tokenKey}`, message: `Token path '${tokenValue}' does not match status pattern '${profile.token_pattern_status}'.`, rule: "token-pattern-match" });
          }
        }
      }
    }
  }

  if (profile.prefix && component.css) {
    if (component.css.prefix && component.css.prefix !== profile.prefix) {
      issues.push({ severity: "info", path: "css.prefix", message: `CSS prefix '${component.css.prefix}' does not match profile prefix '${profile.prefix}'.`, rule: "prefix-consistent" });
    }
    if (component.css.class_pattern && !component.css.class_pattern.includes(profile.prefix)) {
      issues.push({ severity: "info", path: "css.class_pattern", message: `Class pattern does not include profile prefix '${profile.prefix}'.`, rule: "prefix-consistent" });
    }
  }

  if (component.properties) {
    for (const [name] of safeEntries(component.properties, "properties", issues)) {
      if (name === "emphasis" || name === "priority" || name === "level") {
        issues.push({ severity: "info", path: `properties.${name}`, message: `Property '${name}' might be better named 'hierarchy' or 'weight' per glossary conventions.`, rule: "naming-convention" });
      }
      if (name === "status" || name === "severity" || name === "type") {
        issues.push({ severity: "info", path: `properties.${name}`, message: `Property '${name}' might be better named 'intent' per glossary conventions.`, rule: "naming-convention" });
      }
    }
  }

  return issues;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function matchesPattern(path: string, pattern: string): boolean {
  const pathParts = path.split(".");
  const patternParts = pattern.split(".");
  if (pathParts.length !== patternParts.length) return false;
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    if (pp.startsWith("{") && pp.endsWith("}")) continue;
    if (pathParts[i].startsWith("{") && pathParts[i].endsWith("}")) continue;
    if (pathParts[i] !== pp) return false;
  }
  return true;
}
