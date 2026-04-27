# Changelog

All notable changes to `@formtrieb/cdf-core` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
