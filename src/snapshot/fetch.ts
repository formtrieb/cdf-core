import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const FIGMA_REST_URL = 'https://api.figma.com/v1/files';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h, matches cdf-mcp convention

export interface FetchInput {
  figmaUrl: string;
  pat?: string;
  cacheDir: string;
}

export interface FetchOutput {
  json: unknown;
  source: 'rest' | 'cache';
  fileKey: string;
}

export interface FetchInternal {
  fetchImpl?: typeof fetch;
}

export async function fetchFigmaFile(
  input: FetchInput,
  _internal?: FetchInternal,
): Promise<FetchOutput> {
  const fetchImpl = _internal?.fetchImpl ?? fetch;
  const fileKey = parseFileKey(input.figmaUrl);
  const pat = resolvePat(input.pat);

  const cachePath = join(input.cacheDir, `${fileKey}.json`);
  const cached = await tryReadCache(cachePath);
  if (cached !== null) return { json: cached, source: 'cache', fileKey };

  const response = await fetchImpl(`${FIGMA_REST_URL}/${fileKey}`, {
    headers: { 'X-Figma-Token': pat },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '<no body>');
    throw new Error(
      `Figma REST fetch failed: ${response.status} ${response.statusText}. ` +
        `Common causes: 403 = invalid PAT or no access to file; 404 = file_key wrong. ` +
        `URL: ${FIGMA_REST_URL}/${fileKey}. Body: ${body.slice(0, 200)}`,
    );
  }

  const json = (await response.json()) as unknown;
  await writeCache(cachePath, json);
  return { json, source: 'rest', fileKey };
}

function parseFileKey(figmaUrl: string): string {
  const match = figmaUrl.match(/\/(?:design|file)\/([^/]+)/);
  if (!match) {
    throw new Error(
      `Cannot parse Figma file_key from URL: ${figmaUrl}. ` +
        `Expected format: https://figma.com/design/<file_key>/... or .../file/<file_key>/...`,
    );
  }
  return match[1];
}

function resolvePat(argPat: string | undefined): string {
  if (argPat) return argPat;
  const envPat = process.env.FIGMA_PAT;
  if (envPat) return envPat;
  throw new Error(
    'FIGMA_PAT not set. Either pass `pat` arg or export the FIGMA_PAT env var. ' +
      'MCP-config snippet for designers — add `"env": { "FIGMA_PAT": "<token>" }` ' +
      'to the cdf-mcp entry in your client config; engineers can `export FIGMA_PAT=…` in their shell.',
  );
}

async function tryReadCache(cachePath: string): Promise<unknown | null> {
  try {
    const s = await stat(cachePath);
    if (Date.now() - s.mtimeMs > CACHE_TTL_MS) return null;
    const raw = await readFile(cachePath, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, json: unknown): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(json), 'utf8');
}
