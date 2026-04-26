import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfigFile } from "../src/parser/config-parser.js";

const MINIMAL_PROFILE_YAML = `
name: TestSystem
version: "1.0.0"
cdf_version: ">=0.3.0"
dtcg_version: "2025.10"
description: "Test profile"

vocabularies:
  hierarchy:
    description: "Visual emphasis"
    values: [primary, secondary]

token_grammar:
  color.controls:
    pattern: "color.controls.{hierarchy}.{element}"
    dtcg_type: color
    description: "Controls"
    axes:
      hierarchy:
        vocabulary: hierarchy
      element:
        values: [background, text]

token_layers:
  - name: Controls
    description: "Component-ready"
    grammars: [color.controls]

interaction_patterns:
  pressable:
    description: "Click targets"
    states: [enabled, hover]
    token_layer: Controls
    token_mapping:
      enabled: enabled
      hover: hover

theming:
  modifiers:
    semantic:
      description: "Color mood"
      contexts: [Light, Dark]
      required: true

naming:
  css_class_prefix: "tt-"
  token_prefix: "--tt-"
  pattern: "PascalCase"
`.trim();

describe("parseConfigFile", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "cdf-config-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("loads ds_profile when profile_path exists", () => {
    const profilePath = join(tmp, "test.profile.yaml");
    writeFileSync(profilePath, MINIMAL_PROFILE_YAML, "utf-8");

    const configPath = join(tmp, ".cdf.config.yaml");
    writeFileSync(
      configPath,
      `profile_path: ./test.profile.yaml\nspec_directories: [./specs]\n`,
      "utf-8",
    );

    const config = parseConfigFile(configPath);

    expect(config.profile_path).toBe("./test.profile.yaml");
    expect(config.ds_profile).toBeDefined();
    expect(config.ds_profile?.name).toBe("TestSystem");
  });

  it("skips ds_profile and warns to stderr when profile_path is set but file is missing (bootstrap state)", () => {
    // The /cdf:scaffold-profile bootstrap UX writes .cdf.config.yaml with
    // profile_path BEFORE the profile YAML exists. Eagerly throwing here would
    // brick any MCP server reading the config at startup; Option B is to
    // skip + emit one stderr line so misspellings are still surfaced.
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const configPath = join(tmp, ".cdf.config.yaml");
    writeFileSync(
      configPath,
      `profile_path: ./missing.profile.yaml\nspec_directories: [./specs]\n`,
      "utf-8",
    );

    const config = parseConfigFile(configPath);

    expect(config.profile_path).toBe("./missing.profile.yaml");
    expect(config.ds_profile).toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledOnce();
    const warning = stderrSpy.mock.calls[0]![0] as string;
    expect(warning).toContain("[cdf-core]");
    expect(warning).toContain("./missing.profile.yaml");
    expect(warning).toContain("does not exist");
    expect(warning).toContain("ds_profile not loaded");

    stderrSpy.mockRestore();
  });

  it("works without profile_path (no ds_profile, no warning)", () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const configPath = join(tmp, ".cdf.config.yaml");
    writeFileSync(configPath, `spec_directories: [./specs]\n`, "utf-8");

    const config = parseConfigFile(configPath);

    expect(config.profile_path).toBeUndefined();
    expect(config.ds_profile).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
  });

  it("resolves profile_path relative to the config file's directory", () => {
    // .cdf.config.yaml in subdir/ with profile_path: ../profile.yaml
    // should look for the profile at the parent of subdir/, not the cwd.
    const subdir = join(tmp, "nested");
    mkdirSync(subdir);
    const profilePath = join(tmp, "real.profile.yaml");
    writeFileSync(profilePath, MINIMAL_PROFILE_YAML, "utf-8");

    const configPath = join(subdir, ".cdf.config.yaml");
    writeFileSync(
      configPath,
      `profile_path: ../real.profile.yaml\nspec_directories: [../specs]\n`,
      "utf-8",
    );

    const config = parseConfigFile(configPath);

    expect(config.ds_profile).toBeDefined();
    expect(config.ds_profile?.name).toBe("TestSystem");
  });
});
