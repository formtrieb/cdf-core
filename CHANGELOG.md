# Changelog

All notable changes to `@formtrieb/cdf-core` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
