import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parse as parseYAML } from "yaml";
import type { CDFConfig } from "../types/cdf.js";
import { parseProfile } from "./profile-parser.js";

/**
 * Parse a .cdf.config.yaml string.
 */
export function parseConfig(yamlContent: string): CDFConfig {
  return parseYAML(yamlContent) as CDFConfig;
}

/**
 * Parse a .cdf.config.yaml file from disk.
 * If `profile_path` is set, loads the Profile YAML and attaches it as `ds_profile`.
 */
export function parseConfigFile(filePath: string): CDFConfig {
  const content = readFileSync(filePath, "utf-8");
  const config = parseConfig(content);

  if (config.profile_path) {
    const profileAbsPath = resolve(dirname(filePath), config.profile_path);
    config.ds_profile = parseProfile(readFileSync(profileAbsPath, "utf-8"));
  }

  return config;
}
