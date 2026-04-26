import { readFileSync, existsSync } from "node:fs";
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
 *
 * If `profile_path` is set AND the referenced file exists, loads the Profile
 * YAML and attaches it as `ds_profile`. If the path is set but the file is
 * missing, skips loading and emits a one-line stderr warning — this is the
 * normal bootstrap state (`/cdf:scaffold-profile` writes the file mid-run),
 * so failing here would brick the MCP server before its tools could register.
 */
export function parseConfigFile(filePath: string): CDFConfig {
  const content = readFileSync(filePath, "utf-8");
  const config = parseConfig(content);

  if (config.profile_path) {
    const profileAbsPath = resolve(dirname(filePath), config.profile_path);
    if (existsSync(profileAbsPath)) {
      config.ds_profile = parseProfile(readFileSync(profileAbsPath, "utf-8"));
    } else {
      process.stderr.write(
        `[cdf-core] profile_path '${config.profile_path}' set in ${filePath} ` +
          `but file does not exist (${profileAbsPath}); ds_profile not loaded.\n`,
      );
    }
  }

  return config;
}
