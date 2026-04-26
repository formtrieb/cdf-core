import { Document, Scalar } from "yaml";
import type { Phase1Output } from "./types.js";

/**
 * Serialize a Phase1Output to YAML matching the bash transformer's
 * shape (schema phase-1-output-v1).
 *
 * Quirks deliberately matched to `yq -P` output:
 *   - 2-space indent, block style for non-empty collections.
 *   - Empty arrays render as flow `[]` (eemeli/yaml default).
 *   - The ISO-8601 `generated_at` is double-quoted so consumers using
 *     YAML-1.1 timestamp resolution don't reinterpret it as a Date.
 *   - LF line endings, single trailing newline.
 */
export function emitPhase1Yaml(phase1: Phase1Output): string {
  const doc = new Document(phase1);
  forceQuoted(doc, ["generated_at"]);
  return doc.toString({ indent: 2, lineWidth: 0 });
}

function forceQuoted(doc: Document, path: ReadonlyArray<string | number>): void {
  const node = doc.getIn(path, true);
  if (node instanceof Scalar) {
    node.type = Scalar.QUOTE_DOUBLE;
  }
}
