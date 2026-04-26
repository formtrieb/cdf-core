import { readFileSync } from "node:fs";
import { parse as parseYAML } from "yaml";
import type { CDFComponent } from "../types/cdf.js";

/**
 * Parse a YAML string into a CDFComponent.
 * Does NOT validate — use the validator for that.
 */
export function parseCDF(yamlContent: string): CDFComponent {
  const raw = parseYAML(yamlContent) as CDFComponent;
  return raw;
}

/**
 * Parse a .component.yaml or .spec.yaml file from disk.
 */
export function parseCDFFile(filePath: string): CDFComponent {
  const content = readFileSync(filePath, "utf-8");
  return parseCDF(content);
}
