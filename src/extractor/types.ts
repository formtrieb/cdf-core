/**
 * Types for the Figma Phase-1 extractor.
 * Mirrors the YAML shape produced by `scripts/extract-to-yaml.sh`
 * (schema_version: phase-1-output-v1).
 */

export interface ComponentPropertyDefinition {
  type?: string;
  defaultValue?: unknown;
  variantOptions?: string[];
  // `preferredValues` is intentionally stripped during walk.
  [key: string]: unknown;
}

export interface FigmaRestNode {
  id?: string;
  name?: string;
  type?: string;
  children?: FigmaRestNode[];
  componentPropertyDefinitions?: Record<string, ComponentPropertyDefinition>;
}

export interface FigmaComponentSetMeta {
  name?: string;
  description?: string;
}

export interface FigmaFile {
  name?: string;
  document: { children: FigmaRestNode[] };
  componentSets?: Record<string, FigmaComponentSetMeta>;
}

export interface ComponentSetEntry {
  id: string;
  name: string;
  page: string;
  variantCount: number;
  propertyDefinitions: Record<string, ComponentPropertyDefinition>;
}

export interface DocFrameEntry {
  id: string;
  name: string;
  type: string;
  page: string;
}

export type StandaloneRole = "utility" | "documentation" | "widget" | "asset";

export interface DefaultIfUnsure {
  decision: string;
  rationale: string;
}

export interface SeededFinding {
  id: string;
  cluster: string;
  title: string;
  observation: string;
  threshold_met: string;
  sot_recommendation: string;
  user_decision: "pending";
  plain_language?: string;
  concrete_example?: string;
  default_if_unsure?: DefaultIfUnsure;
  instances?: string[];
}

export interface Phase1Output {
  schema_version: "phase-1-output-v1";
  generated_at: string;
  generated_by: { walker: string; transformer: string; tier: string };
  figma_file: { file_key: string | null; file_name: string | null };
  ds_inventory: {
    pages: { total: number; content: number; separator_or_meta: number };
    component_sets: {
      total: number;
      tree_unique_count: number;
      remote_only_count: number;
      by_page: Array<{ name: string; count: number }>;
      entries: ComponentSetEntry[];
    };
    standalone_components: Record<StandaloneRole, string[]>;
    figma_component_descriptions: {
      with_description: number;
      without_description: number;
      ratio: number;
    };
    doc_frames_info: { count: number; samples: DocFrameEntry[] };
  };
  libraries: { linked: unknown[]; remote_components: null };
  token_regime: { detected: null; evidence: unknown[] };
  theming_matrix: { collections: unknown[] };
  seeded_findings: SeededFinding[];
  interpretation: unknown[];
}

export interface WalkerOptions {
  /** ISO 8601 timestamp; defaults to `new Date().toISOString()` w/o ms. */
  generatedAt?: string;
  generatedBy?: { walker: string; transformer: string; tier: string };
  fileKey?: string | null;
}

export const DEFAULT_GENERATED_BY = {
  walker: "packages/cdf-core/src/extractor/walker.ts",
  transformer: "packages/cdf-core/src/extractor/walker.ts",
  tier: "T1",
} as const;

/**
 * Plugin-API node shape returned by `figma_execute` walking
 * `figma.root.children` recursively. Mirrors the public Plugin API
 * (`SceneNode` minimal slice) — fields the walker actually consumes.
 *
 * Differences from `FigmaRestNode`:
 *  - PAGE wrapper has `type: "PAGE"` (REST: `"CANVAS"`); walker treats both as
 *    parent-types for standalone-COMPONENT classification, so the literal value
 *    doesn't matter — we keep it as recorded for fidelity.
 *  - COMPONENT_SET nodes carry a `description` string (Plugin-API getter).
 *    REST surfaces this through the file-level `componentSets` dict instead.
 */
export interface RuntimeNode {
  id: string;
  name?: string;
  type?: string;
  children?: RuntimeNode[];
  componentPropertyDefinitions?: Record<string, ComponentPropertyDefinition>;
  /** Only set on COMPONENT / COMPONENT_SET nodes via the Plugin API getter. */
  description?: string;
}

export interface RuntimePage {
  id: string;
  name: string;
  type?: string;
  children: RuntimeNode[];
}

/**
 * Top-level `figma_execute` Raw-Tree shape. The fixture-recorder is expected
 * to wrap a `figma.root.children.map(serializePage)` call into this object.
 * `selectionPath` is informational only — the walker does not read it.
 */
export interface RuntimeTree {
  fileName?: string;
  pages: RuntimePage[];
  selectionPath?: string | null;
}

/**
 * Options for `fromRuntimeTree` — file-level metadata that the Plugin API
 * does not surface in a single tree dump. The MCP tool passes these down
 * from the `cdf_extract_figma_file` arguments.
 */
export interface RuntimeAdapterOptions {
  /**
   * Override `tree.fileName` if the caller knows the canonical Figma file
   * name (e.g. recorded out-of-band via `figma_get_file_data`). Useful when
   * the live tree dump did not include `figma.root.name`.
   */
  fileName?: string;
}

export const DEFAULT_GENERATED_BY_RUNTIME = {
  walker: "packages/cdf-core/src/extractor/walker.ts",
  transformer: "packages/cdf-core/src/extractor/figma-runtime-adapter.ts",
  tier: "T0",
} as const;
