// packages/cdf-core/src/types/profile.ts

/**
 * CDF Design System Profile — TypeScript types.
 * Matches the structure defined in formtrieb.profile.yaml.
 */

// ── Identity ─────────────────────────────────────────────────────────────────

export interface DSProfile {
  name: string;
  version: string;
  cdf_version: string;
  dtcg_version: string;
  description: string;
  // CDF-PROFILE-SPEC §4.5 + §15 — optional path to a parent Profile.
  // When set, the child inherits all top-level sections via per-key REPLACE
  // merge semantics (§15.1). The parser relaxes its required-field check
  // for extends-children: only `name` + `version` stay mandatory on the
  // child itself; the other sections flow in from the parent at merge-time.
  // Single-level only in v1.0.0-draft (§15.6).
  extends?: string;

  vocabularies: Record<string, Vocabulary>;
  token_grammar: Record<string, TokenGrammar>;
  // Per CDF-PROFILE-SPEC §3 these are OPTIONAL. The parser default-fills the
  // three collection fields to an empty shape, so consumers see them as
  // always-present. accessibility_defaults has no honest empty shape and may
  // legitimately be undefined for Headless DSes.
  token_layers: TokenLayer[];
  standalone_tokens?: Record<string, StandaloneToken>;
  interaction_patterns: Record<string, InteractionPattern>;
  theming: ThemingConfig;
  accessibility_defaults?: AccessibilityDefaults;
  naming: NamingConventions;
  categories: Record<string, CategoryConfig>;
  assets?: AssetsConfig;
  css_defaults?: CSSDefaults;
}

// ── Vocabularies ─────────────────────────────────────────────────────────────

export interface Vocabulary {
  description: string;
  values: string[];
  casing?: string;
}

// ── Token Grammar ────────────────────────────────────────────────────────────

export interface TokenGrammar {
  pattern: string;
  dtcg_type: string;
  description: string;
  axes?: Record<string, GrammarAxis>;
  tiers?: Record<string, GrammarTier>;
  text_transforms?: Record<string, string[]>;
  responsive?: ResponsiveConfig;
  contrast_guarantee?: string;
  layer?: string;
}

export interface GrammarAxis {
  description?: string;
  values?: string[];
  vocabulary?: string;
  per_category?: Record<string, string[]>;
  notes?: Record<string, string>;
}

export interface GrammarTier {
  description: string;
  values: string[];
}

export interface ResponsiveConfig {
  description: string;
  overridden_by: string;
  affected_properties: string[];
}

// ── Token Layers ─────────────────────────────────────────────────────────────

export interface TokenLayer {
  name: string;
  description: string;
  grammars: string[];
  references?: string[];
}

// ── Standalone Tokens ────────────────────────────────────────────────────────

export interface StandaloneToken {
  dtcg_type: string;
  description: string;
  values?: string[];
}

// ── Interaction Patterns ─────────────────────────────────────────────────────

export interface InteractionPattern {
  description: string;
  states: string[];
  token_layer?: string;
  token_mapping?: Record<string, string>;
  orthogonal_to?: string[];
  notes?: Record<string, string>;
}

// ── Theming ──────────────────────────────────────────────────────────────────

export interface ThemingConfig {
  modifiers: Record<string, ThemeModifier>;
  set_mapping: Record<string, SetMappingEntry>;
}

export interface ThemeModifier {
  description: string;
  contexts: string[];
  required?: boolean;
  data_attribute?: string;
  affects?: string[];
}

export interface SetMappingEntry {
  always_enabled?: boolean;
  modifier?: string;
  context?: string;
}

// ── Accessibility Defaults ───────────────────────────────────────────────────

export interface AccessibilityDefaults {
  focus_ring: {
    description: string;
    pattern: string;
    token_group: string;
  };
  min_target_size: {
    token: string;
    wcag_level: string;
    description: string;
  };
  contrast_requirements: ContrastRequirements;
  keyboard_defaults: Record<string, Record<string, string>>;
  category_defaults: Record<string, CategoryAccessibilityDefaults>;
}

export interface ContrastRequirements {
  description: string;
  controls_internal: {
    description: string;
    pairs: ContrastPair[];
  };
  text_on_surfaces: {
    description: string;
    pairs: ContrastPair[];
  };
  state_self_consistency: {
    description: string;
  };
}

export interface ContrastPair {
  foreground: string;
  background: string;
  ratio: string;
  wcag: string;
  description?: string;
}

export interface CategoryAccessibilityDefaults {
  focus_visible: boolean;
  element?: string;
  keyboard?: string;
  aria?: string[];
  aria_extensions?: string[];
  roles?: string[];
  description?: string;
}

// ── Naming ───────────────────────────────────────────────────────────────────

export interface NamingConventions {
  css_prefix: string;
  token_prefix: string;
  methodology: string;
  pattern: string;
  casing: Record<string, string>;
  reserved_names: Record<string, string>;
}

// ── Categories ───────────────────────────────────────────────────────────────

export interface CategoryConfig {
  description: string;
  interaction: string;
  token_grammar?: string;
  examples?: string[];
}

// ── CSS Defaults ─────────────────────────────────────────────────────────────

/**
 * DS-wide CSS conventions inherited by every component spec in this profile.
 * A component spec may override any key under `css.states` (see CDFComponent);
 * what stays here is the common shape that does NOT vary per component.
 *
 * We keep this minimal on purpose (Phase 7a.1 — Layer Cleanup). The fuller
 * set of CSS conventions lives in the CDF-PROFILE-SPEC v1.0.0-draft doc.
 */
export interface CSSDefaults {
  /**
   * Baseline state guards that apply when a spec does not override them.
   * Values are CSS selector fragments appended to `:host(...)`.
   *
   * Example:
   *   hover:     ":hover:not([disabled])"
   *   focused:   ":focus-visible"
   *   disabled:  "[disabled], [aria-disabled='true']"
   *
   * Components that need additional inhibitors (Button excludes `.pending`,
   * InputCore excludes `.readonly`) override individual keys in their own
   * spec's `css.states` map.
   */
  state_guards?: Record<string, string>;
}

// ── Assets ───────────────────────────────────────────────────────────────────

/**
 * External / generated assets the DS relies on (icons today, fonts + illustrations later).
 * Origin = where the truth lives. Consumption = how the generated code accesses it.
 * These are independent dimensions — Figma origin + registry consumption is a
 * perfectly normal combination (export tool bridges them).
 */
export interface AssetsConfig {
  icons?: IconAssets;
}

export interface IconAssets {
  /** Naming convention icon names in component specs MUST follow. */
  naming_case: "snake" | "kebab" | "camel";
  /** The set of valid size values icon consumers can select. */
  sizes: string[];
  /** Where the icons come from. */
  origin: IconOrigin;
  /** How the generated component accesses icons at runtime. */
  consumption: IconConsumption;
}

export type IconOrigin =
  | FigmaIconOrigin
  | PackageIconOrigin
  | FilesystemIconOrigin;

export interface FigmaIconOrigin {
  type: "figma";
  /**
   * Canonical Figma URL (the one you get from "Copy link" in Figma).
   * Parsed into { fileKey, nodeId } by the profile parser.
   */
  url: string;
  /** Name of the skill/command responsible for exporting — purely documentation. */
  export_tool?: string;
}

export interface PackageIconOrigin {
  type: "package";
  package: string;
  version?: string;
}

export interface FilesystemIconOrigin {
  type: "filesystem";
  path: string;
}

export type IconConsumption =
  | TypescriptRegistryConsumption
  | PackageImportConsumption
  | SpriteHrefConsumption;

/**
 * Icons live in a generated TypeScript module that exports a `Record<Name, pathData>`.
 * The component imports the record + name-type and renders `<path d="...">`.
 */
export interface TypescriptRegistryConsumption {
  type: "typescript-registry";
  /** Import path used by generated components, e.g. "./icon-registry". */
  registry_path: string;
  /** Named export of the record, e.g. "icons". */
  registry_export: string;
  /** Named export of the string-union / branded type, e.g. "IconName". */
  name_type_export: string;
  /** SVG viewBox the generated template should use. Defaults to "0 0 20 20" when omitted. */
  viewbox?: string;
}

/** Icons come from a framework-integrated package; render that package's own component. */
export interface PackageImportConsumption {
  type: "package-import";
  import_package: string;
  import_symbol: string;
  render_template?: string;
}

/** Icons are an external sprite; render `<svg><use href="#icon-..." /></svg>`. */
export interface SpriteHrefConsumption {
  type: "sprite-href";
  sprite_path: string;
  href_prefix?: string;
}
