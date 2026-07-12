import { readFileSync } from "node:fs";
import { parse as parseYAML } from "yaml";
import type { CDFComponent } from "../types/cdf.js";
import { expandTokenTables } from "../resolver/token-table-expander.js";

/**
 * Parse a YAML string into a CDFComponent.
 * Does NOT validate — use the validator for that.
 *
 * `token_table` blocks (§13.3.1) are expanded to flat §13.3 value-maps here, so
 * every downstream consumer (validator, coverage, generator) only sees the flat
 * form. No-op for specs without a token_table.
 */
export function parseCDF(yamlContent: string): CDFComponent {
  const raw = parseYAML(yamlContent) as CDFComponent;
  return expandTokenTables(raw);
}

/**
 * Parse a .component.yaml or .spec.yaml file from disk.
 */
export function parseCDFFile(filePath: string): CDFComponent {
  const content = readFileSync(filePath, "utf-8");
  return parseCDF(content);
}
