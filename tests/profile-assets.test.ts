import { describe, it, expect } from "vitest";
import { parseProfile } from "../src/parser/profile-parser.js";

// Minimal anonymous Profile body used as the host for `assets:` field
// validation. Kept self-contained so the test suite has no dependency on
// any private-DS Profile that lives outside the package.
const baseProfile = `
name: AssetsTestSystem
version: "1.0.0"
cdf_version: ">=0.3.0"
dtcg_version: "2025.10"
description: "Anonymous profile for assets-section tests"

vocabularies:
  hierarchy:
    description: "Visual emphasis"
    values: [primary, secondary]

token_grammar:
  color.controls:
    pattern: "color.controls.{hierarchy}.{element}.{state}"
    dtcg_type: color
    description: "Controls"
    axes:
      hierarchy: { vocabulary: hierarchy }
      element: { values: [background, text] }
      state: { values: [enabled, disabled] }

theming:
  modifiers: {}
  set_mapping: {}

naming:
  css_prefix: "ts-"
  token_prefix: "--ts-"
  methodology: BEM
  pattern: "{prefix}{component}--{modifier}__{child}"
  casing:
    properties: camelCase
    component_names: PascalCase
    css_selectors: kebab-case
  reserved_names: {}
`;

function withAssets(body: string): string {
  return baseProfile + "\n" + body;
}

describe("parseProfile — assets.icons validation", () => {
  it("accepts a figma origin with a typescript-registry consumption", () => {
    const profile = parseProfile(
      withAssets(`
assets:
  icons:
    naming_case: snake
    sizes: [xsmall, small, base, large]
    origin:
      type: figma
      url: "https://www.figma.com/design/abc/foo?node-id=1-2"
    consumption:
      type: typescript-registry
      registry_path: "./icon-registry"
      registry_export: icons
      name_type_export: IconName
`)
    );
    expect(profile.assets?.icons?.origin.type).toBe("figma");
    const c = profile.assets?.icons?.consumption;
    expect(c?.type).toBe("typescript-registry");
  });

  it("accepts a package origin with package-import consumption", () => {
    const profile = parseProfile(
      withAssets(`
assets:
  icons:
    naming_case: kebab
    sizes: [base]
    origin:
      type: package
      package: lucide
      version: ">=0.577"
    consumption:
      type: package-import
      import_package: lucide-angular
      import_symbol: LucideAngularModule
`)
    );
    expect(profile.assets?.icons?.origin.type).toBe("package");
  });

  it("fails hard on a malformed Figma URL", () => {
    expect(() =>
      parseProfile(
        withAssets(`
assets:
  icons:
    naming_case: snake
    sizes: [base]
    origin:
      type: figma
      url: "https://example.com/not-figma"
    consumption:
      type: typescript-registry
      registry_path: "./icon-registry"
      registry_export: icons
      name_type_export: IconName
`)
      )
    ).toThrow(/figma\.com/i);
  });

  it("fails on unknown origin type", () => {
    expect(() =>
      parseProfile(
        withAssets(`
assets:
  icons:
    naming_case: snake
    sizes: [base]
    origin:
      type: wat
    consumption:
      type: sprite-href
      sprite_path: "./foo.svg"
`)
      )
    ).toThrow(/origin\.type/);
  });

  it("fails on unknown naming_case", () => {
    expect(() =>
      parseProfile(
        withAssets(`
assets:
  icons:
    naming_case: PascalCase
    sizes: [base]
    origin:
      type: filesystem
      path: "./icons/"
    consumption:
      type: sprite-href
      sprite_path: "./foo.svg"
`)
      )
    ).toThrow(/naming_case/);
  });

  it("fails when typescript-registry consumption is missing required fields", () => {
    expect(() =>
      parseProfile(
        withAssets(`
assets:
  icons:
    naming_case: snake
    sizes: [base]
    origin:
      type: filesystem
      path: "./icons/"
    consumption:
      type: typescript-registry
      registry_path: "./icon-registry"
`)
      )
    ).toThrow(/registry_export|name_type_export/);
  });
});
