import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Recursively find all *.profile.yaml files in the given directories.
 * Returns absolute paths.
 */
export function findProfileFiles(directories: string[]): string[] {
  const result: string[] = [];
  for (const dir of directories) {
    if (!existsSync(dir)) continue;
    walk(dir, result);
  }
  return result;
}

function walk(dir: string, acc: string[]): void {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
    } else if (entry.endsWith(".profile.yaml")) {
      acc.push(full);
    }
  }
}
