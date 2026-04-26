# @formtrieb/cdf-core

**Core library for the [Component Description Format (CDF)](https://github.com/formtrieb/cdf) — parsing, validation, profile inference, token-tree, and analysis primitives.**

This package is framework-agnostic: pure TypeScript functions that take
parsed YAML or JSON input and return typed results. It has no I/O of its
own beyond optional file-reading helpers, no MCP layer, no skill-runtime
assumptions. It is the substrate that both the [`@formtrieb/cdf-mcp`](../cdf-mcp/)
adapter and the reference Angular generator consume.

## Status

**v1.0.1 — 2026-04-26.** First usable public release (v1.0.0 was a
no-op publish, see [`CHANGELOG.md`](CHANGELOG.md)). CDF spec v1.0.0 is
frozen (Component / Profile / Target / Architecture, validated against
Radix, shadcn, Primer, Material 3, USWDS). The library has shipped under
`workspace:*` inside the Formtrieb monorepo for ~6 weeks; this version
strips the monorepo-internal coupling and re-publishes it as a standalone
npm package.

License: Apache-2.0.

## Install

```bash
npm install @formtrieb/cdf-core
# or pnpm
pnpm add @formtrieb/cdf-core
```

Requires Node ≥ 20.

## What's inside

| Surface | Symbols | Purpose |
|---|---|---|
| **Parsing** | `parseCDF`, `parseCDFFile`, `parseConfig`, `parseConfigFile`, `parseProfile`, `parseProfileFile` | Read and type-check CDF Component / Config / Profile YAML files. Returns typed `CDFComponent` / `CDFConfig` / `CDFProfile`. |
| **Validation** | `validate`, `validateFile`, `validateAll`, `validateProfile`, `validateProfileFile` | Run the CDF v1.0.0 rule set (≥30 rules across structural, semantic, vocabulary, theming, token-reference). Returns structured `Issue[]` with severity. |
| **Resolution** | `resolveInheritance`, `resolveExtension`, `expandTokenPath` | Resolve component inheritance (`extends:`, `inherits:`), token-path placeholders, profile-extends merge. |
| **Analysis** | `analyzeCoverage`, `analyzeComponentCoverage`, `suggestImprovements`, `detectVocabDivergences` | Coverage report (which Profile vocabularies / grammars are unused), Component-level coverage delta, suggestion generator, vocab-near-miss detection (Levenshtein ≤2). |
| **Profile scaffolding** | `scaffoldProfile`, `parseScaffoldInput`, `aggregateRawMaterial`, `enrichRawMaterial`, `applyStructuralDeltas` | Adapter-friendly scaffolder used by the `cdf-profile-scaffold` Skill. Emits typed `ScaffoldResult` with milestones and raw material; consumer (Skill or other adapter) drives the interview loop. |
| **Token tree** | `TokenTree`, `RawToken`, `TokenExtensions`, `ColorModifier` | Generic DTCG token-tree walker. Inlined from `formtrieb-tokens-core` in v1.0.0; no MoPla-specific assumptions. |
| **Vocab divergence apply** | `applyComponentRename` | Rewrite component spec value occurrences after a vocab-divergence resolution. |

See [`src/index.ts`](src/index.ts) for the full export list.

## Minimal example

```typescript
import { parseCDFFile, validate } from "@formtrieb/cdf-core";

const component = parseCDFFile("./specs/components/Button.spec.yaml");
const issues = validate(component);

for (const issue of issues) {
  console.log(`[${issue.severity}] ${issue.rule}: ${issue.message}`);
}
```

For Profile-level work:

```typescript
import { parseProfileFile, validateProfile } from "@formtrieb/cdf-core";

const profile = parseProfileFile("./acme.profile.yaml");
const result = validateProfile(profile, { resolveTokens: true });

console.log(result.summary);
```

## Relationship to other packages

| Package | Role |
|---|---|
| [`@formtrieb/cdf-mcp`](https://github.com/formtrieb/cdf-mcp) | MCP server exposing this library to LLM clients (Claude Desktop, MCP Inspector). Thin adapter — every business decision lives here. |
| [`formtrieb/cdf` repo](https://github.com/formtrieb/cdf) | Normative specs (CDF-COMPONENT-SPEC, CDF-PROFILE-SPEC, CDF-TARGET-SPEC) + foreign-DS validation ports. |

## Development

```bash
pnpm install
pnpm --filter @formtrieb/cdf-core build
pnpm --filter @formtrieb/cdf-core test
```

## License

Apache-2.0 — alignment with the CDF spec.
