/**
 * TypeScript types for the Component Description Format (CDF).
 * Derived from CDF-SPEC v0.2.1 and the 11 existing .spec.yaml files.
 */

// ── Identity ──────────────────────────────────────────────────────────────────

export interface CDFComponent {
  name: string;
  category: string;
  description: string;

  // Composition
  extends?: string;
  inherits?: string;
  composition_strategy?: string;

  // Cascade context
  theme_axes?: Record<string, ThemeAxis>;

  // API surface
  properties?: Record<string, Property>;
  properties_removed?: string[];
  properties_added?: Record<string, Property>;
  properties_sealed?: Record<string, SealedProperty>;
  states?: Record<string, State>;
  events?: Record<string, Event> | Record<string, never>;
  derived?: Record<string, DerivedValue>;

  // Structure
  anatomy: Record<string, AnatomyPart>;
  anatomy_overrides?: Record<string, AnatomyOverride>;
  slots?: Record<string, Slot>;

  // Visual contract
  tokens: Record<string, TokenMapping>;
  tokens_overrides?: Record<string, TokenOverride>;
  token_gaps?: string[];
  destructive_mapping?: DestructiveMapping;

  // Compound state declarations (§8.8) — per-cell overrides over the
  // Cartesian product of state axes.
  compound_states?: CompoundStateRule[];

  // Behavioral contract
  behavior?: Record<string, Behavior>;
  accessibility: Accessibility;
  accessibility_overrides?: AccessibilityOverride;

  // Implementation guidance
  // Renamed from `css_architecture` in Phase 7a.1 (2026-04-12):
  // state-guard DEFAULTS now live in profile.css_defaults.state_guards;
  // what appears here is only the spec-specific wiring (selector,
  // private properties, modifiers, and per-component state-guard overrides).
  css?: CSSArchitecture;
  references?: Reference[];

  // Design tool representation
  figma?: FigmaConfig;
}

// ── Theme Axes ────────────────────────────────────────────────────────────────

export interface ThemeAxis {
  values: string[];
  data_attribute: string;
  affects: string;
}

// ── Properties ────────────────────────────────────────────────────────────────

export interface Property {
  type: "enum" | "boolean" | "string" | "IconName" | string;
  values?: string[];
  default?: unknown;
  required?: boolean;
  optional?: boolean;
  description: string;
  constraints?: Constraint[];
  mutual_exclusion?: string;
  token_mapping?: Record<string, string>;
  mirrors_state?: string;
  binds_to?: string;
  bindable?: string;
  target_only?: boolean;
}

export interface Constraint {
  requires: Record<string, string | string[]>;
}

export interface SealedProperty {
  fixed_value: unknown;
  description: string;
}

// ── States ────────────────────────────────────────────────────────────────────

export interface State {
  values: string[];
  runtime?: boolean;
  token_expandable?: boolean;
  default?: string | boolean;
  description: string;
  token_mapping?: Record<string, string>;
  binds_to?: string;
}

// ── Events ────────────────────────────────────────────────────────────────────

export interface Event {
  type: string;
  description: string;
  trigger?: string;
  prevented_when?: string;
}

// ── Derived Values ────────────────────────────────────────────────────────────

export interface CompoundStateRule {
  when: Record<string, string | boolean>;
  tokens?: Record<string, Record<string, unknown>>;
  description?: string;
}

export interface DerivedValue {
  // §10.1 single-source: a property/state axis name.
  // §10.2 multi-source: a list of axis names.
  from?: string | string[];
  // §10.1 single-source: value → value map.
  // §10.2 multi-source: ordered rule list, last entry MUST be `default:`.
  mapping?: Record<string, string> | MultiSourceRule[];
  expression?: string;
  description: string;
  consumed_by: string[];
}

export type MultiSourceRule =
  | { when: Record<string, string | boolean>; value: string }
  | { default: string };

// ── Anatomy ───────────────────────────────────────────────────────────────────

export interface AnatomyPart {
  element?: string;
  component?: string;
  description: string;
  conditional?: string;
  locked?: Record<string, unknown>;
  exposed?: Record<string, unknown>;
  children?: unknown[];
  bindings?: Record<string, string>;
  visually_hidden?: boolean;
}

export interface AnatomyOverride {
  removed?: boolean;
  renamed?: string;
  conditional?: string | null;
  description?: string;
  element?: string;
  component?: string;
  locked?: Record<string, unknown>;
}

// ── Slots ─────────────────────────────────────────────────────────────────────

export interface Slot {
  description: string;
  required?: boolean;
  accepts?: string | string[];
  conditional?: string;
  layout?: string;
}

// ── Tokens ────────────────────────────────────────────────────────────────────

/**
 * Token mapping for an anatomy part.
 * Keys are CSS property names (or special keys like `pattern`, `applies_to`, `sizing`).
 * Values are token paths (string), size maps (Record<string, string>),
 * or `null` (for removal in overrides).
 *
 * State-qualified tokens use `--` suffixes: `color--tertiary`, `color--readonly`.
 */
export type TokenMapping = Record<string, TokenValue>;

export type TokenValue = string | Record<string, string> | null;

export interface TokenOverride {
  removed?: boolean;
  [key: string]: TokenValue | boolean | undefined;
}

export interface DestructiveMapping {
  description: string;
  token_override: string;
}

// ── Behavior ──────────────────────────────────────────────────────────────────

export interface Behavior {
  transition?: {
    property: string;
    duration: string;
    easing: string;
  };
  transforms?: Record<string, string>;
  animation?: {
    name: string;
    duration: string;
    easing: string;
    iteration: string;
    keyframes: Record<string, Record<string, string>>;
  };
  reduced_motion?: string;
  states?: Record<string, Record<string, Record<string, string>>>;
  description: string;
}

// ── Accessibility ─────────────────────────────────────────────────────────────

export interface Accessibility {
  element: string;
  "focus-visible": boolean;
  keyboard: Record<string, string>;
  aria: string[];
  roles?: string[];
  "min-target-size"?: string;
  contrast?: string;
  motion?: string[];
}

export interface AccessibilityOverride {
  element?: string;
  "focus-visible"?: boolean;
  keyboard?: Record<string, string>;
  aria?: string[];
  roles?: string[];
  "min-target-size"?: string;
  contrast?: string;
  motion?: string[];
}

// ── CSS Architecture ──────────────────────────────────────────────────────────

export interface CSSArchitecture {
  class_pattern?: string;
  prefix?: string;
  methodology?: string;
  private_properties?: Record<string, CSSPrivateProperty>;
  mixins?: Record<string, CSSMixin>;
  host_selector_strategy?: string;
}

export interface CSSPrivateProperty {
  description?: string;
  set_by: string;
  consumed_by: string;
}

export interface CSSMixin {
  description: string;
  usage?: string;
  parameters?: Record<string, string>;
  expands_to?: string[];
}

// ── References ────────────────────────────────────────────────────────────────

export interface Reference {
  name: string;
  url: string;
  use: string;
}

// ── Figma ─────────────────────────────────────────────────────────────────────

export interface FigmaConfig {
  component_set_name: string;
  architecture?: string;
  variant_properties?: Record<string, string[] | null>;
  component_properties?: Record<string, FigmaComponentProperty>;
  nested_instances?: Record<string, FigmaNestedInstance>;
  excluded_combinations?: Record<string, unknown>[];
  total_variants?: number;
  sub_components?: FigmaSubComponent[];
  layout?: Record<string, unknown>;
  notes?: string;
}

export interface FigmaSubComponent {
  name: string;
  maps_to?: string;
  variant_properties?: Record<string, string[]>;
  component_properties?: Record<string, string>;
  interaction_audit?: InteractionAudit;
}

export interface InteractionAudit {
  classification: "interactive" | "decorative";
  states?: string[];
  triggers?: InteractionTrigger[];
  cdf_impact?: CDFImpact;
}

export interface InteractionTrigger {
  type: "overlay" | "state-change" | "navigate";
  opens?: string;
  action?: string;
}

export interface CDFImpact {
  element_change?: string | null;
  aria_additions?: string[];
  anatomy_additions?: string[];
  behavior_additions?: string[];
  note?: string | null;
}

export interface FigmaComponentProperty {
  type: "text" | "boolean" | "instance_swap";
  default?: string;
  description?: string;
}

export interface FigmaNestedInstance {
  component: string;
  description?: string;
  conditional?: string;
  locked?: Record<string, unknown>;
}

// ── Validation ────────────────────────────────────────────────────────────────

export type Severity = "error" | "warning" | "info";

export interface Issue {
  severity: Severity;
  path: string;
  message: string;
  rule: string;
}

export interface ValidationReport {
  file: string;
  valid: boolean;
  errors: Issue[];
  warnings: Issue[];
  info: Issue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

// ── Config ────────────────────────────────────────────────────────────────────

import type { DSProfile } from "./profile.js";

export interface CDFConfig {
  spec_directories: string[];
  token_sources: string[];
  glossary?: string;
  profile_path?: string;
  profile?: CDFProfile;
  ds_profile?: DSProfile;
}

/** @deprecated — use DSProfile via ds_profile. Kept for backward compatibility. */
export interface CDFProfile {
  prefix: string;
  token_pattern_interactive?: string;
  token_pattern_status?: string;
  theme_axes?: Record<string, string[]>;
  placeholder_values?: string[];
}
