import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCDF } from "../parser/yaml-parser.js";
import { checkStructural } from "./rules/structural.js";
import { checkConsistency } from "./rules/consistency.js";
import { checkConvention } from "./rules/convention.js";
import type { CDFComponent, CDFConfig, Issue, Severity, ValidationReport } from "../types/cdf.js";
import type { DSProfile } from "../types/profile.js";

export interface ValidationContext {
  /** Fully parsed DS profile (from CDFConfig.ds_profile). When absent,
   * profile-dependent rules are skipped and an `info` issue is emitted. */
  profile?: DSProfile;
  /** Lookup map of known components by lowercase name — used by rules
   * that need to inspect a referenced component's surface (SEM-011, SEM-012). */
  components?: Map<string, CDFComponent>;
}

/**
 * Validate a parsed CDFComponent against all rules.
 */
export function validate(
  component: CDFComponent,
  config?: CDFConfig,
  fileName = "<inline>",
  context?: ValidationContext
): ValidationReport {
  const ctx: ValidationContext = context ?? {};
  if (!ctx.profile && config?.ds_profile) {
    ctx.profile = config.ds_profile;
  }

  const allIssues: Issue[] = [
    ...checkStructural(component, ctx),
    ...checkConsistency(component, ctx),
    ...checkConvention(component, config),
  ];

  if (!ctx.profile) {
    allIssues.push({
      severity: "info",
      path: "<context>",
      message:
        "Profile not loaded — profile-dependent rules skipped (CDF-SEM-002 grammar-slot placeholders, CDF-STR-011/012 reserved-vocabulary isolation, CDF-SEM-010 compound-states closure). Structural and component-local checks still ran. Set `profile_path:` in .cdf.config.yaml for full validation.",
      rule: "profile-not-loaded",
    });
  }

  const errors = allIssues.filter((i) => i.severity === "error");
  const warnings = allIssues.filter((i) => i.severity === "warning");
  const info = allIssues.filter((i) => i.severity === "info");

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

/**
 * Validate a single spec file from disk.
 */
export function validateFile(
  filePath: string,
  config?: CDFConfig,
  context?: ValidationContext
): ValidationReport {
  const content = readFileSync(filePath, "utf-8");
  const component = parseCDF(content);
  return validate(component, config, filePath, context);
}

/**
 * Validate all spec files in the given directories.
 * Builds a components map so cross-component rules can inspect parent/child specs.
 */
export function validateAll(specDirectories: string[], config?: CDFConfig): ValidationReport[] {
  const allFiles: string[] = [];
  for (const dir of specDirectories) {
    allFiles.push(...findSpecFiles(resolve(dir)));
  }

  const components = new Map<string, CDFComponent>();
  for (const file of allFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const component = parseCDF(content);
      if (component.name) {
        components.set(component.name.toLowerCase(), component);
      }
    } catch {
      // Skip unparseable files — they'll fail in validation
    }
  }

  const ctx: ValidationContext = {
    profile: config?.ds_profile,
    components,
  };

  const reports: ValidationReport[] = [];
  for (const file of allFiles) {
    reports.push(validateFile(file, config, ctx));
  }

  return reports;
}

/**
 * Recursively find all .spec.yaml and .component.yaml files.
 */
function findSpecFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...findSpecFiles(full));
    } else if (entry.endsWith(".spec.yaml") || entry.endsWith(".component.yaml")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Filter issues by minimum severity.
 */
export function filterBySeverity(issues: Issue[], minSeverity: Severity): Issue[] {
  const levels: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const min = levels[minSeverity];
  return issues.filter((i) => levels[i.severity] <= min);
}
