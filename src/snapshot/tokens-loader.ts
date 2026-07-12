import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

interface ThemeEntry {
  id?: string;
  name: string;
  group?: string;
  selectedTokenSets?: Record<string, 'enabled' | 'disabled' | 'source'>;
}

export interface LoadedTokens {
  $themes?: ThemeEntry[];
}

/**
 * Reads the Tokens-Studio `$themes.json` from `tokensDir`.
 *
 * Behaviour:
 * - `tokensDir` absent/undefined → returns `{}` (graceful degradation per D1.2-A)
 * - `tokensDir` provided but directory missing → strict throw (bug, not missing input)
 * - `tokensDir` provided but `$themes.json` missing → strict throw
 * - `$themes.json` present but malformed JSON → strict throw
 * - `$themes.json` is not an array → strict throw
 */
export async function loadTokensFromDir(tokensDir: string | undefined): Promise<LoadedTokens> {
  if (!tokensDir) return {};

  try {
    await access(tokensDir);
  } catch {
    throw new Error(
      `tokensDir does not exist: ${tokensDir}. ` +
      `Pass an existing Tokens-Studio directory path or omit the parameter for graceful skip.`,
    );
  }

  const themesPath = join(tokensDir, '$themes.json');
  let raw: string;
  try {
    raw = await readFile(themesPath, 'utf8');
  } catch {
    throw new Error(
      `$themes.json not found in tokensDir: ${themesPath}. ` +
      `Tokens-Studio directories must contain a top-level $themes.json file.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `$themes.json is malformed JSON at ${themesPath}: ${(err as Error).message}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `$themes.json must be an array of theme entries; got ${typeof parsed} at ${themesPath}`,
    );
  }

  return { $themes: parsed as ThemeEntry[] };
}
