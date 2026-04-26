import type { FigmaFile } from "./types.js";

/**
 * Validate and normalise the JSON payload from `GET /v1/files/{key}`.
 * Throws on missing `document.children`. Anything else stays loosely typed
 * so downstream code can tolerate REST shape evolution.
 */
export function parseFigmaRestFile(input: unknown): FigmaFile {
  if (typeof input !== "object" || input === null) {
    throw new Error("parseFigmaRestFile: expected object, got " + typeof input);
  }
  const obj = input as Record<string, unknown>;
  const doc = obj.document;
  if (typeof doc !== "object" || doc === null) {
    throw new Error("parseFigmaRestFile: missing 'document' object");
  }
  const children = (doc as Record<string, unknown>).children;
  if (!Array.isArray(children)) {
    throw new Error("parseFigmaRestFile: 'document.children' must be an array");
  }
  return obj as unknown as FigmaFile;
}
