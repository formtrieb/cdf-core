import type { SetMappingEntry } from '../types.js';

interface ThemeEntry {
  name: string;
  group?: string;
  selectedTokenSets?: Record<string, 'enabled' | 'disabled' | 'source'>;
}

interface TokenSourceLike {
  $themes?: ThemeEntry[];
}

/**
 * Derives the canonical `theming.set_mapping` from Tokens-Studio `$themes`.
 *
 * Mapping rules (D1.2-B):
 * - `'enabled'`  → `{ modifier: <group>, context: <name> }`
 * - `'source'`   → `{ always_enabled: true }`
 * - `'disabled'` → omit (set is not part of any active configuration)
 *
 * Two-pass strategy: source-status sets are written first, then enabled-status
 * sets overwrite them. This ensures that if a set appears as 'source' in one
 * theme and 'enabled' in another, the 'enabled' mapping wins (last-write-wins
 * semantics, same set name).
 */
export function populateSetMapping(tokens: TokenSourceLike): Record<string, SetMappingEntry> {
  const mapping: Record<string, SetMappingEntry> = {};
  if (!tokens.$themes || tokens.$themes.length === 0) return mapping;

  // First pass: source-status sets (always_enabled). Skip if already mapped.
  for (const theme of tokens.$themes) {
    for (const [setName, status] of Object.entries(theme.selectedTokenSets ?? {})) {
      if (status === 'source' && !mapping[setName]) {
        mapping[setName] = { always_enabled: true };
      }
    }
  }

  // Second pass: enabled-status sets (modifier + context). Overrides source-status entries.
  for (const theme of tokens.$themes) {
    for (const [setName, status] of Object.entries(theme.selectedTokenSets ?? {})) {
      if (status === 'enabled') {
        mapping[setName] = { modifier: theme.group ?? '_ungrouped', context: theme.name };
      }
    }
  }

  return mapping;
}
