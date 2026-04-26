import { parseDocument, isSeq, isMap, isScalar } from "yaml";

/**
 * Single-rename descriptor passed to applyComponentRename.
 * `property-value` rewrites an element of `properties.<property>.values[]`.
 * `state-key` renames the key `states.<from>` to `states.<to>`.
 */
export type ComponentRename =
  | { kind: "property-value"; property: string; from: string; to: string }
  | { kind: "state-key"; from: string; to: string };

/**
 * Apply one rename to a component-spec YAML string. Uses yaml's Document API
 * to preserve comments and untouched formatting elsewhere in the file.
 * Returns the rewritten YAML. No-op if the target isn't present.
 */
export function applyComponentRename(yamlText: string, rename: ComponentRename): string {
  const doc = parseDocument(yamlText);
  switch (rename.kind) {
    case "property-value":
      renamePropertyValue(doc, rename.property, rename.from, rename.to);
      break;
    case "state-key":
      renameStateKey(doc, rename.from, rename.to);
      break;
  }
  return doc.toString();
}

function renamePropertyValue(
  doc: ReturnType<typeof parseDocument>,
  property: string,
  from: string,
  to: string,
): void {
  const values = doc.getIn(["properties", property, "values"], true);
  if (isSeq(values)) {
    for (const item of values.items) {
      if (isScalar(item) && item.value === from) item.value = to;
    }
  }
  // Co-rename `default` if it matches the outlier — otherwise the spec
  // ends up with a default that's no longer in `values[]`, which is
  // silently invalid per CDF-COMPONENT-SPEC §7 (default MUST be one of values).
  const defaultNode = doc.getIn(["properties", property, "default"], true);
  if (isScalar(defaultNode) && defaultNode.value === from) {
    defaultNode.value = to;
  }
}

function renameStateKey(
  doc: ReturnType<typeof parseDocument>,
  from: string,
  to: string,
): void {
  const states = doc.get("states", true);
  if (!isMap(states)) return;
  for (const pair of states.items) {
    if (isScalar(pair.key) && pair.key.value === from) {
      pair.key.value = to;
    }
  }
}
