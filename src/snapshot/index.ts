import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SnapshotInput, SnapshotResult } from './types.js';
import { analyzeInventory } from './analyzer/index.js';
import { renderProfile } from './render-profile.js';
import { renderFindings } from './render-findings.js';
import { parseMarkers } from './marker-grammar.js';
import { fetchFigmaFile } from './fetch.js';
import { loadTokensFromDir } from './tokens-loader.js';
import { adaptPhase1Output } from './analyzer/walker-adapter.js';
import { parseFigmaRestFile } from '../extractor/figma-rest-adapter.js';
import { walkFigmaFile } from '../extractor/walker.js';
import { detectFindings } from './findings/index.js';
import type { ToolSurveyState } from './types.js';

export type {
  SnapshotInput,
  SnapshotResult,
  HintContext,
  SnapshotVocabulary,
  SnapshotTokenLayer,
  SnapshotThemingModifier,
  SnapshotAnalyzerOutput,
  SetMappingEntry,
  CollisionFinding,
  OutlierFinding,
  BlindSpotFinding,
  FindingsOutput,
  ToolSurveyState,
  CrossValidationFinding,         // NEW (Plan 1.3.5)
  SnapshotInventoryStats,          // NEW (Plan 1.3.5)
} from './types.js';

export async function produceSnapshot(
  input: SnapshotInput,
  _internal?: {
    fetchAndWalk?: typeof fetchAndWalk;
    loadTokens?: typeof loadTokens;
    extractSetNames?: typeof extractSetNames;
  },
): Promise<SnapshotResult> {
  const fetcher = _internal?.fetchAndWalk ?? fetchAndWalk;
  const tokenLoader = _internal?.loadTokens ?? loadTokens;
  const setExtractor = _internal?.extractSetNames ?? extractSetNames;

  const t0 = Date.now();
  const dsName = input.options?.dsName ?? deriveDsName(input.figmaUrl);

  // Stage A: fetch + walk (real implementations wired in Plan 1.2 T7)
  const walker = await fetcher(input);
  const tokens = await tokenLoader(input);
  const setNames = setExtractor(tokens);

  // Stage B: analyze
  const analyzer = analyzeInventory({ walker, tokens, setNames: { setNames } });

  // Stage B': detect findings (Plan 1.3).
  const toolSurveyState: ToolSurveyState = {
    figmaFetchSource: walker.fetchSource,
    tokensSource: tokens.tokensSource,
    themesArrayEmpty: tokens.themesArrayEmpty,
    walkerReportedTotal: walker.reportedTotal,
    walkerActualCount: walker.actualCount,
  };
  const findings = detectFindings({
    analyzerOutput: analyzer,
    walker,
    toolSurveyState,
  });

  // Stage C: render skeleton + findings
  const profileYaml = renderProfile(analyzer, {
    dsName,
    figmaFileKey: extractFigmaFileKey(input.figmaUrl),
    generatedAt: new Date().toISOString(),
    generatedBy: 'cdf-core@1.1.0-rc.1',
  });
  const findingsMd = renderFindings(findings);

  // Stage D: write
  mkdirSync(input.outDir, { recursive: true });
  const profilePath = join(input.outDir, `${dsName}.snapshot.profile.yaml`);
  const findingsPath = join(input.outDir, `${dsName}.snapshot.findings.md`);
  writeFileSync(profilePath, profileYaml, 'utf8');
  writeFileSync(findingsPath, findingsMd, 'utf8');

  const profileMarkers = parseMarkers(profileYaml);
  const findingsMarkers = parseMarkers(findingsMd);

  return {
    profilePath,
    findingsPath,
    stats: {
      componentSetsCount: walker.componentSets.length,
      vocabulariesCount: analyzer.vocabularies.length,
      findingsCount: findings.collisions.length + findings.outliers.length,
      blindSpotsCount: findings.blindSpots.length,
      tbdMarkersCount: profileMarkers.total + findingsMarkers.total,
    },
    toolSurvey: {
      figmaFetchSource: walker.fetchSource,
      tokensSource: tokens.tokensSource,
    },
    walltimeMs: Date.now() - t0,
  };
}

function deriveDsName(figmaUrl: string): string {
  const m = figmaUrl.match(/\/(?:design|file)\/[^/]+\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]).toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'unknown_ds';
}

function extractFigmaFileKey(figmaUrl: string): string {
  const m = figmaUrl.match(/\/(?:design|file)\/([^/]+)/);
  return m ? m[1] : 'UNKNOWN';
}

async function fetchAndWalk(input: SnapshotInput): Promise<{
  componentSets: Array<{ name: string; properties: Record<string, string[]> }>;
  fetchSource: 'rest' | 'cache';
  reportedTotal: number;
  actualCount: number;
}> {
  const cacheDir = input.options?.cacheDir ?? join(input.outDir, '.cdf-cache');
  const fetched = await fetchFigmaFile({ figmaUrl: input.figmaUrl, pat: input.pat, cacheDir });
  const figmaFile = parseFigmaRestFile(fetched.json);
  const phase1 = walkFigmaFile(figmaFile);
  const adapted = adaptPhase1Output(phase1);
  return {
    componentSets: adapted.componentSets,
    fetchSource: fetched.source,
    reportedTotal: phase1.ds_inventory.component_sets.total,
    actualCount: adapted.componentSets.length,
  };
}

async function loadTokens(input: SnapshotInput): Promise<{
  $themes?: Array<{ group?: string; name: string; selectedTokenSets?: Record<string, 'enabled' | 'disabled' | 'source'> }>;
  tokensSource: 'filesystem' | 'none';
  themesArrayEmpty: boolean;
}> {
  if (!input.tokensDir) {
    return { tokensSource: 'none', themesArrayEmpty: false };
  }
  const loaded = await loadTokensFromDir(input.tokensDir);
  return {
    $themes: loaded.$themes,
    tokensSource: 'filesystem',
    themesArrayEmpty: loaded.$themes !== undefined && loaded.$themes.length === 0,
  };
}

function extractSetNames(tokens: { $themes?: Array<{ selectedTokenSets?: Record<string, string> }> }): string[] {
  if (!tokens.$themes) return [];
  const set = new Set<string>();
  for (const theme of tokens.$themes) {
    for (const k of Object.keys(theme.selectedTokenSets ?? {})) set.add(k);
  }
  return [...set].sort();
}
