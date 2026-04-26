import { readFileSync } from "node:fs";
import { parse as parseYAML } from "yaml";
import type {
  DSProfile,
  GrammarAxis,
  IconAssets,
  IconConsumption,
  IconOrigin,
} from "../types/profile.js";
import { parseFigmaUrl } from "./figma-url.js";

/**
 * Parse a Profile YAML string into a typed DSProfile.
 * Resolves vocabulary references in grammar axes — if an axis has
 * `vocabulary: "hierarchy"`, its `values` are populated from
 * `vocabularies.hierarchy.values`.
 */
export function parseProfile(yamlContent: string): DSProfile {
  const raw = parseYAML(yamlContent) as DSProfile;

  // Per CDF-PROFILE-SPEC §3: only Identity + vocabularies + token_grammar +
  // theming + naming are REQUIRED. token_layers, interaction_patterns,
  // accessibility_defaults, categories are OPTIONAL (Headless DSes like
  // Radix legitimately omit them). Default-fill so downstream code keeps
  // a stable shape.
  //
  // When `extends:` is set, the child Profile inherits from a parent per
  // §15.1 merge semantics (per-key REPLACE at the smallest documented unit).
  // A child that doesn't diverge on `vocabularies` / `token_grammar` /
  // `theming` / `naming` omits them entirely — they flow in from the
  // parent. The parser accepts this shape; only `name` + `version` stay
  // mandatory on the child itself. Deep validation of the merged shape
  // is deferred to a future resolver pass.
  const hasExtends = typeof raw.extends === "string" && raw.extends.length > 0;
  const required: (keyof DSProfile)[] = hasExtends
    ? ["name", "version"]
    : ["name", "version", "vocabularies", "token_grammar", "theming", "naming"];
  for (const field of required) {
    if (raw[field] === undefined || raw[field] === null) {
      throw new Error(`Profile is missing required field: '${field}'`);
    }
  }

  raw.token_layers ??= [];
  raw.interaction_patterns ??= {};
  raw.categories ??= {};
  // accessibility_defaults is left as-is when omitted (becomes undefined).
  // Unlike the three above it is a structured block with required nested
  // fields (§11) — there is no honest "empty shape" to synthesize. Headless
  // DSes that delegate a11y to the consumer simply have no defaults block.

  // Vocabulary resolution only runs when both blocks are present on this
  // Profile. In an extends-child that inherits token_grammar unchanged,
  // the parent's axes will be resolved against the parent's vocabularies
  // at merge-time (future resolver). A child that overrides one grammar
  // but inherits vocabularies, or vice versa, may have unresolvable refs
  // until the merge — that's expected and surfaced by the resolver,
  // not this parser.
  if (raw.token_grammar && raw.vocabularies) {
    for (const [grammarName, grammar] of Object.entries(raw.token_grammar)) {
      if (!grammar.axes) continue;
      for (const [axisName, axis] of Object.entries(grammar.axes)) {
        if (axis.vocabulary) {
          const vocab = raw.vocabularies[axis.vocabulary];
          if (!vocab) {
            throw new Error(
              `Grammar '${grammarName}' axis '${axisName}' references unknown vocabulary '${axis.vocabulary}'`
            );
          }
          (axis as GrammarAxis).values = vocab.values;
        }
      }
    }
  }

  if (raw.assets?.icons) validateIconAssets(raw.assets.icons);

  return raw;
}

/**
 * Validate the shape of the icons block. We fail hard on bad configuration
 * because the Icon generator cannot recover from an invalid origin/consumption
 * combination — it wouldn't know what to emit.
 */
function validateIconAssets(icons: IconAssets): void {
  const validCases = ["snake", "kebab", "camel"] as const;
  if (!validCases.includes(icons.naming_case)) {
    throw new Error(
      `assets.icons.naming_case must be one of ${validCases.join(", ")} — got: ${icons.naming_case}`
    );
  }
  if (!Array.isArray(icons.sizes) || icons.sizes.length === 0) {
    throw new Error("assets.icons.sizes must be a non-empty array");
  }
  validateIconOrigin(icons.origin);
  validateIconConsumption(icons.consumption);
}

function validateIconOrigin(origin: IconOrigin): void {
  if (!origin || typeof origin !== "object") {
    throw new Error("assets.icons.origin is required");
  }
  switch (origin.type) {
    case "figma":
      // Eagerly parse the URL so bad input fails at profile load time.
      parseFigmaUrl(origin.url);
      return;
    case "package":
      if (!origin.package) {
        throw new Error("assets.icons.origin.package is required when type=package");
      }
      return;
    case "filesystem":
      if (!origin.path) {
        throw new Error("assets.icons.origin.path is required when type=filesystem");
      }
      return;
    default: {
      const t = (origin as { type?: string }).type;
      throw new Error(
        `assets.icons.origin.type must be one of figma, package, filesystem — got: ${t}`
      );
    }
  }
}

function validateIconConsumption(consumption: IconConsumption): void {
  if (!consumption || typeof consumption !== "object") {
    throw new Error("assets.icons.consumption is required");
  }
  switch (consumption.type) {
    case "typescript-registry":
      if (!consumption.registry_path || !consumption.registry_export || !consumption.name_type_export) {
        throw new Error(
          "assets.icons.consumption (typescript-registry) requires registry_path, registry_export, name_type_export"
        );
      }
      return;
    case "package-import":
      if (!consumption.import_package || !consumption.import_symbol) {
        throw new Error(
          "assets.icons.consumption (package-import) requires import_package and import_symbol"
        );
      }
      return;
    case "sprite-href":
      if (!consumption.sprite_path) {
        throw new Error("assets.icons.consumption (sprite-href) requires sprite_path");
      }
      return;
    default: {
      const t = (consumption as { type?: string }).type;
      throw new Error(
        `assets.icons.consumption.type must be one of typescript-registry, package-import, sprite-href — got: ${t}`
      );
    }
  }
}

/**
 * Parse a Profile YAML file from disk.
 */
export function parseProfileFile(filePath: string): DSProfile {
  const content = readFileSync(filePath, "utf-8");
  return parseProfile(content);
}
