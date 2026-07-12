# Changelog

All notable changes to `@formtrieb/cdf-core` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-07-12

Rolls up everything merged to `main` since the last published release,
[1.0.4]. Version `1.1.0` was assigned in-repo but never published to
npm — its scope (the Snapshot library, below) ships here instead.

### Added — De-collapse engine (`decollapse()`)

New `src/decollapse/` module + top-level export. Takes a crammed
property or token-suffix enum (declared values taken verbatim, e.g.
from a Figma component set's variant list) and recovers the
independent axes it was flattened from, surfacing the
implied-but-undeclared combinations as questions for the spec author
to confirm or reject.

- **Tokenizer** splits each declared value into candidate atoms
  (compound-atom map for multi-word concepts like `read-only`).
- **Axis priors** (proto-vocabulary) map atoms onto the near-universal
  interactive axes — interaction, validation, content, selection,
  readonly, disclosure. Unknown atoms send their value to `residue`;
  nothing is guessed.
- **Clustering** turns the mapped atoms into candidate axes: ≥2
  observed atoms form an enum axis, a single non-default atom forms a
  boolean-presence axis (`false`/`true`).
- **Cell mapping + missing-cell detection** lays declared values into
  the axis-product grid and reports the empty cells as questions; a
  product-size guard (512 cells) returns `truncated` instead of
  enumerating degenerate grids.
- **Token cross-check** (optional) matches each observed value's
  non-default atoms against a supplied token-name list to flag enum
  values with no backing token (default-alias values are vacuously
  backed).
- **Sibling-gate** — when token names are supplied, a missing cell is
  only reported if every non-default part of its coordinate has at
  least one token-backed observed sibling on that axis; heuristic-only
  findings are suppressed by construction.
- Golden fixtures cover the full facade end-to-end.

Public surface: `decollapse()`, plus `CandidateAxis`, `CellCoord`,
`ObservedCell`, `MissingCell`, `DecollapseResult` types.

### Added — Snapshot library (`src/snapshot/`)

New subpackage backing the mechanical (Synthesis-as-Code) half of DS
Snapshot evaluation — previously bash/LLM-policy, now a pure,
testable pipeline. Top-level export: `produceSnapshot()`.

- **Stage-A adapters** — `fetch.ts` (Figma REST + `.cdf-cache`),
  `tokens-loader` (filesystem read, graceful when absent), and a
  walker-adapter that lifts `Phase1Output` into the analyzer's input
  shape (lossy by design).
- **Analyzers** — vocabulary extractor, theming-modifier extractor,
  token-layer detector (groups token sets by prefix), inventory-stats
  (8-field summary), a Figma-name normalizer (trim + collapse
  whitespace), and a `set_mapping` populator that derives
  `theming.set_mapping` from `$themes`.
- **Findings detectors** — collision detector (Jaccard ≥ 0.7 +
  casing-collision), outlier detector (modal-value deviation, with
  raw-name citation when it differs from the normalized form), and a
  blind-spot detector (4 diagnostic conditions).
- **Cross-validators** — Cv-A (vocab-token-gap) and Cv-B
  (orphan-modifier-context), wired into a dedicated "Cross
  Validations" render section.
- **Renderers** — profile renderer (MCP-first hints, mixed-shape
  tolerant) and findings renderer, both driven by the same analyzer
  output the orchestrator produces.
- Windows-portable cache directory handling.

Public types: `SnapshotInput`, `SnapshotResult`, `HintContext`,
`SnapshotVocabulary`, `SnapshotTokenLayer`, `SnapshotThemingModifier`,
`SnapshotAnalyzerOutput`, `SetMappingEntry`. Distinct from the
existing `renderSnapshot` (in `renderer/snapshot-renderer.ts`, live
since before 1.0.4) — that renderer formats a hand/LLM-assembled
snapshot profile; this library derives the profile's structural
content mechanically.

### Added — `emitDesignMd()` Profile emitter

New `src/emitter/` module: `emitDesignMd(profile, opts?)` converts a
parsed `DSProfile` into [DESIGN.md](https://github.com/google-labs-code/design.md)
— a public, provider-neutral agent-context format. First concrete
proof of the Profile-as-compiler direction: one Profile, multiple
downstream renderings.

- Fixed section order: Overview (name + description) · Colors /
  Typography / Layout / Elevation / Shapes (token-driven via
  `opts.tokens`, omitted with an explanatory comment when no matching
  tokens are supplied — the Profile itself holds semantic vocabularies,
  not literal token values) · Components (one `###` subsection per
  vocabulary, canonical values rendered as a backtick-wrapped list) ·
  Do's and Don'ts (one pair per interaction pattern, plus a verbatim
  `notes` bullet where present).
- Optional YAML frontmatter carries the machine-readable token map.
- `packages/cdf-core/scripts/emit-design-md.ts` — standalone CLI
  runner (`tsx scripts/emit-design-md.ts <profile.yaml>`); prepends a
  provenance header sourced only from the CLI arg so re-running the
  same command reproduces byte-identical output.

Public surface: `emitDesignMd`, `EmitDesignMdOptions` type.

### Changed — Format Diet: `description` REQUIRED → RECOMMENDED

Missing `description` is now the Tier-3 warning
`description-recommended` (runs unconditionally) instead of a
blocking `required-fields` error — an unambiguous PascalCase name may
stand in for prose. Non-breaking (strict loosening). Spec: §4.4,
[ADR-007](https://github.com/formtrieb/cdf/blob/main/specs/adrs/007-loosen-required-fields.md).

### Changed — Format Diet: `tokens` / `accessibility` REQUIRED → optional

Headless/decorative components may omit `tokens` (declaring "owns no
paint"; `{}` remains valid); components inheriting category
accessibility defaults may omit `accessibility` (§15.2). `anatomy`
stays hard-required. Non-breaking. Spec: §3, §4.4, §13, §18.3,
CDF-CON-009, [ADR-007](https://github.com/formtrieb/cdf/blob/main/specs/adrs/007-loosen-required-fields.md).

### Added — `prefer-value-map-for-property-modifier` warning

New non-blocking Tier-3 warning (CDF-CON-010): a `{css-prop}--{value}`
suffix whose value is a PROPERTY value should use the canonical §13.3
value-map instead. Conservative exemptions preserve every existing
spelling — state values, boolean `true`/`false`, axis-qualified
dotted forms, hybrid object entries, and property/state value overlaps
(state takes precedence). Removal of the older spellings is deferred
to a future major behind multi-DS evidence + a codemod. Spec: §13.2,
§13.3, [ADR-008](https://github.com/formtrieb/cdf/blob/main/specs/adrs/008-modifier-spelling-canonicalization.md).

### Added — `token_table` matrix-compression primitive

New optional `token_table` block (§13.3.1) under a part; a pure
`expandTokenTables` function is wired into `parseCDF` so the
validator, coverage, and generator only ever see flat §13.3
value-maps. Targets flat-token DSes (USWDS-shaped) whose
variant × state × css-property matrix would otherwise be hand-expanded
line by line. Row axis names the varying property; an optional
`states` step map substitutes over the rest-token name; CSS-property
columns map to a rest token or an explicit per-state cell;
hand-authored keys win per row. Additive, non-breaking — build-time
string substitution only, no runtime math.
Spec: §13.3.1, [ADR-009](https://github.com/formtrieb/cdf/blob/main/specs/adrs/009-token-table-compression.md).

### Housekeeping

- Foreign-DS example specs (`radix`/`shadcn`/`primer`/`uswds`/`material3`)
  migrated 15 properties to the §7.2 vocab-shorthand (`type: <vocab-key>`
  instead of duplicating the Profile vocabulary inline); stale
  "validator rejects the shorthand" comments removed.
- Tests: 429 (1.0.4) → 614 passed / 3 skipped.

## [1.0.4] — 2026-04-27

### Added — `renderSnapshot` emits "What this snapshot surfaced" block between BANNER and FINDINGS

The snapshot renderer now surfaces structural counts the profile drafted
(vocabularies, token grammars, theming modifiers, interaction patterns)
in a dedicated block between the DRAFT banner and the findings list.
Origin: V1+V3 Material 3 retro item 10 — readers of `findings.md`
previously saw only "14 findings → 11 blind-spots" and missed that the
companion `profile.yaml` carried 8 vocabs / 5 grammars / 2 modifiers /
2 patterns. That false-negative trust signal is now counterbalanced by
showing what the snapshot *captured*.

- `formatSurfacedSummary(profile)` counts top-level keys per section,
  excluding any starting with `_` (`_quality: draft` markers).
- Vocabularies + grammars list the first three keys with an ellipsis
  if more exist; modifiers + patterns emit count only.
- Profiles where every counted section is empty (or holds only
  `_`-prefixed keys) collapse back to the pre-1.0.4 byte-layout — no
  misleading empty header.

The bash reference renderer (`scripts/render-snapshot.sh`) was updated
in lockstep so the `golden-parity` test stays byte-identical. Tests
went from 427 → 429 (two new snapshot.test.ts cases — happy-path
Material-3-shape + all-empty suppression).

Public surface unchanged: `renderSnapshot` keeps the same signature,
the `SnapshotProfile` type already permitted arbitrary top-level keys
via `[key: string]: unknown`, and the new `formatSurfacedSummary`
helper is module-private.

## [1.0.3] — 2026-04-26

### Fixed — `parseConfigFile` crashes when `profile_path` set but file missing

The MCP server (and any tool calling `parseConfigFile`) used to crash on
startup with `ENOENT` when `.cdf.config.yaml` declared a `profile_path:`
that didn't exist yet. This is the **normal bootstrap state** — the
`/cdf:scaffold-profile` skill writes the profile YAML mid-run, so the
config validly references a file that won't exist until after the
scaffold completes.

`parseConfigFile` now checks `existsSync(profileAbsPath)` before
attempting the read. If the file is missing it leaves `ds_profile`
undefined and emits one stderr line:

```
[cdf-core] profile_path './my-ds.profile.yaml' set in /path/.cdf.config.yaml but file does not exist (...); ds_profile not loaded.
```

The warning preserves the diagnostic signal for genuine misconfigurations
(typos, wrong relative paths) while letting bootstrap states proceed.
Downstream consumers already check `config.ds_profile` for `undefined`
so no cascading changes are needed.

Affected: any caller of `parseConfigFile` — most visibly
[`@formtrieb/cdf-mcp`](https://www.npmjs.com/package/@formtrieb/cdf-mcp)
v1.7.0–1.7.1 (where this manifested as
`MCP error -32000: Connection closed` in the
[`cdf` Claude Code plugin](https://github.com/formtrieb/cdf-plugin)).
v1.7.2 of cdf-mcp pins `^1.0.3` to force a clean dep refresh.

### Tests

- 4 new `test/config-parser.test.ts` tests: existing-profile happy
  path, missing-profile skip+warn, no-profile_path quiet path,
  relative-path resolution from config dir
- 427/427 total tests green (423 → 427)

## [1.0.2] — 2026-04-26

Release-mechanism only — no code changes. First Trusted-Publishing (OIDC) release: published from GitHub Actions via `npm publish --provenance --access public` with no NPM_TOKEN. From this version onward every tag push (`v1.0.3`, …) auto-publishes via OIDC; the bootstrap token used for v1.0.1 has been revoked.

## [1.0.1] — 2026-04-26

First usable public release. v1.0.0 was published earlier the same day
without compiled output (a stale incremental-build cache shipped an empty
tarball); it has been unpublished from the registry. v1.0.1 ships the
intended initial-release contents and is byte-equivalent to what v1.0.0
should have been; future releases will use Trusted Publishing (OIDC) via
GitHub Actions.

The library shipped under `workspace:*` inside the Formtrieb monorepo for
~6 weeks; this version strips the monorepo-internal coupling and re-
publishes it as a standalone npm package, paired with the v1.0.0 release
of the [`formtrieb/cdf`](https://github.com/formtrieb/cdf) spec repository.

### Surface

| Area | Symbols |
|---|---|
| Parsing | `parseCDF`, `parseCDFFile`, `parseConfig`, `parseConfigFile`, `parseProfile`, `parseProfileFile` |
| Validation | `validate`, `validateFile`, `validateAll`, `validateProfile`, `validateProfileFile` |
| Resolution | `resolveInheritance`, `resolveExtension`, `expandTokenPath` |
| Analysis | `analyzeCoverage`, `analyzeComponentCoverage`, `suggestImprovements`, `detectVocabDivergences` |
| Profile scaffolding | `scaffoldProfile`, `parseScaffoldInput`, `aggregateRawMaterial`, `enrichRawMaterial`, `applyStructuralDeltas` |
| Token tree | `TokenTree`, `RawToken`, `TokenExtensions`, `ColorModifier` |
| Vocab divergence apply | `applyComponentRename` |

See [`src/index.ts`](src/index.ts) for the full export list.

### Spec coverage

- CDF v1.0.0 frozen (Component / Profile / Target / Architecture)
- ≥30 validation rules across L0–L8
- Validated against five foreign design systems: Radix, shadcn, Primer,
  Material 3, USWDS

### Engineering

- Node ≥ 20
- ESM only (`"type": "module"`)
- TypeScript strict mode, ES2022 target
- 423 tests, 0 failures
- Apache-2.0 licensed
