import type { Issue } from "../../types/cdf.js";

/**
 * Safe Object.entries() that handles null, undefined, and arrays gracefully.
 * Pushes an error issue if the value is not a plain object, returns [] to skip.
 */
export function safeEntries<V = unknown>(
  value: unknown,
  path: string,
  issues: Issue[]
): [string, V][] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    issues.push({
      severity: "error",
      path,
      message: `Expected an object map at '${path}', got an array. Use named keys instead of a list.`,
      rule: "type-mismatch",
    });
    return [];
  }
  if (typeof value !== "object") {
    issues.push({
      severity: "error",
      path,
      message: `Expected an object map at '${path}', got ${typeof value}.`,
      rule: "type-mismatch",
    });
    return [];
  }
  return Object.entries(value) as [string, V][];
}

export function safeKeys(value: unknown): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value);
}
