// Types
export type {
  CDFComponent,
  CDFConfig,
  CDFProfile,
  Property,
  Constraint,
  SealedProperty,
  State,
  Event,
  DerivedValue,
  AnatomyPart,
  AnatomyOverride,
  Slot,
  TokenMapping,
  TokenValue,
  TokenOverride,
  DestructiveMapping,
  Behavior,
  Accessibility,
  AccessibilityOverride,
  CSSArchitecture,
  Reference,
  FigmaConfig,
  FigmaComponentProperty,
  FigmaNestedInstance,
  ThemeAxis,
  Severity,
  Issue,
  ValidationReport,
} from "./types/cdf.js";

// Profile types
export type {
  DSProfile,
  Vocabulary,
  TokenGrammar,
  GrammarAxis,
  TokenLayer,
  InteractionPattern,
  ThemingConfig,
  ThemeModifier,
  AccessibilityDefaults,
  NamingConventions,
  CategoryConfig,
  CSSDefaults,
  AssetsConfig,
  IconAssets,
  IconOrigin,
  FigmaIconOrigin,
  PackageIconOrigin,
  FilesystemIconOrigin,
  IconConsumption,
  TypescriptRegistryConsumption,
  PackageImportConsumption,
  SpriteHrefConsumption,
} from "./types/profile.js";

// Parser
export { parseCDF, parseCDFFile } from "./parser/yaml-parser.js";
export { parseConfig, parseConfigFile } from "./parser/config-parser.js";

// Profile parser
export { parseProfile, parseProfileFile } from "./parser/profile-parser.js";
export { parseFigmaUrl } from "./parser/figma-url.js";
export type { ParsedFigmaUrl } from "./parser/figma-url.js";

// Validator (component scope)
export { validate, validateFile, validateAll, filterBySeverity } from "./validator/index.js";
export type { ValidationContext } from "./validator/index.js";

// Validator (profile scope) — v1.5.0
export { validateProfile, validateProfileFile } from "./validator/profile/index.js";
export type { ProfileValidationOptions } from "./validator/profile/index.js";

// Resolver
export { expandTokenPath, extractPlaceholders, parseTokenKey } from "./resolver/token-expander.js";
export { resolveInheritance, resolveExtension } from "./resolver/inheritance.js";

// Analyzer
export { analyzeComponentCoverage, analyzeCoverage } from "./analyzer/coverage.js";
export type { CoverageReport, ComponentCoverage } from "./analyzer/coverage.js";
export { suggestImprovements } from "./analyzer/suggest.js";
export type { Suggestion } from "./analyzer/suggest.js";
export { detectVocabDivergences } from "./analyzer/vocab-divergence.js";
export type {
  Divergence,
  Recommendation,
  Evidence,
  ValueUsage,
  DetectOpts,
} from "./analyzer/vocab-divergence.js";
export { applyComponentRename } from "./analyzer/vocab-divergence-apply.js";
export type { ComponentRename } from "./analyzer/vocab-divergence-apply.js";
export { persistVocabDecision } from "./analyzer/vocab-divergence-persist.js";
export type { PersistArgs } from "./analyzer/vocab-divergence-persist.js";

// Profile Discovery — v1.6.0
export { findProfileFiles } from "./parser/profile-discovery.js";

// Profile Resolver — v1.6.0
export { resolveExtends } from "./resolver/extends-resolver.js";
export type {
  ResolveExtendsResult,
  ProvenanceEntry,
  ProvenanceAction,
} from "./types/extends-resolver.js";

// Profile Coverage Analyzer — v1.6.0
export { analyzeProfileCoverage } from "./analyzer/profile-coverage.js";
export type {
  ProfileCoverageResult,
  ProfileOrphan,
  OrphanType,
  OrphanScope,
  SkippedCheck,
  CoverageInput,
} from "./types/profile-coverage.js";

// Profile Diff Analyzer — v1.6.0
export { diffProfiles } from "./analyzer/profile-diff.js";
export type {
  ProfileDiffResult,
  ProfileDiffChange,
  DiffImpact,
  DiffOptions,
} from "./types/profile-diff.js";

// Scaffold (Component-level, from Figma analysis)
export { generateScaffold } from "./scaffold/generate.js";
export type { ScaffoldInput } from "./scaffold/generate.js";

// Profile Scaffold (DS-level, from ScaffoldInput JSON — v1.2.0)
export { scaffoldProfile } from "./analyzer/profile-scaffold/index.js";
export type {
  ScaffoldOptions,
  ScaffoldResult,
  ScaffoldDecision,
  ScaffoldSummary,
  VocabNamingMilestone,
  GrammarPatternMilestone,
  BaseStateMilestone,
} from "./analyzer/profile-scaffold/index.js";
export {
  aggregateRawMaterial,
  enrichRawMaterial,
} from "./analyzer/profile-scaffold/phase2-raw-material.js";
export type {
  Phase2RawMaterial,
  GrammarUsage,
  SparsityMetric,
  ComponentBinding,
  AggregateOptions,
} from "./analyzer/profile-scaffold/phase2-raw-material.js";
export { applyStructuralDeltas } from "./analyzer/profile-scaffold/phase2-structural-deltas.js";
export type { StructuralDelta } from "./analyzer/profile-scaffold/phase2-structural-deltas.js";
export { parseScaffoldInput } from "./analyzer/profile-scaffold/input-parser.js";
export type {
  ScaffoldInput as ProfileScaffoldInput,
  ParsedScaffoldInput,
  ScaffoldInputToken,
  ScaffoldInputComponent,
  ScaffoldInputProperty,
  ScaffoldInputMode,
  ScaffoldInputSource,
  TokenType,
  PropertyType,
} from "./analyzer/profile-scaffold/input-parser.js";
export {
  buildPriorArtIndex,
  loadPriorArtIndex,
} from "./analyzer/profile-scaffold/prior-art.js";
export type { PriorArtIndex } from "./analyzer/profile-scaffold/prior-art.js";

// Generic DTCG TokenTree (inlined 2026-04-26 from formtrieb-tokens-core).
// See R4.1 in docs/plans/active/2026-04-26-mvp-risk-backlog.md.
export { TokenTree } from "./types/token-tree.js";
export type {
  RawToken,
  TokenExtensions,
  ColorModifier,
} from "./types/token-tree.js";

// Figma Phase-1 extractor — v1.7.0 (Figma Access Modernization)
export { walkFigmaFile } from "./extractor/walker.js";
export { parseFigmaRestFile } from "./extractor/figma-rest-adapter.js";
export { fromRuntimeTree } from "./extractor/figma-runtime-adapter.js";
export { emitPhase1Yaml } from "./extractor/yaml-emit.js";
export type {
  FigmaFile,
  FigmaRestNode,
  ComponentPropertyDefinition,
  ComponentSetEntry,
  DocFrameEntry,
  StandaloneRole,
  Phase1Output,
  WalkerOptions,
  SeededFinding,
  RuntimeTree,
  RuntimePage,
  RuntimeNode,
  RuntimeAdapterOptions,
} from "./extractor/types.js";
export {
  DEFAULT_GENERATED_BY,
  DEFAULT_GENERATED_BY_RUNTIME,
} from "./extractor/types.js";

// Findings + snapshot renderers — v1.7.0
export {
  renderFindingsMd,
  renderHousekeepingMd,
  renderShipBlockers,
  renderConformanceYaml,
} from "./renderer/findings-renderer.js";
export { renderSnapshot } from "./renderer/snapshot-renderer.js";
export type { SnapshotRenderOptions } from "./renderer/snapshot-renderer.js";
export type {
  FindingsInput,
  Finding,
  FindingsSummary,
  FindingDecision,
  FindingDefaultIfUnsure,
  Cluster,
  SnapshotProfile,
  SnapshotFindings,
  SnapshotFinding,
  SnapshotBlindSpot,
  SnapshotBlindSpotObject,
} from "./renderer/types.js";
