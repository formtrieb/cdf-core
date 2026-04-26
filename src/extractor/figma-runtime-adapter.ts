import type {
  ComponentPropertyDefinition,
  FigmaComponentSetMeta,
  FigmaFile,
  FigmaRestNode,
  RuntimeAdapterOptions,
  RuntimeNode,
  RuntimePage,
  RuntimeTree,
} from "./types.js";

/**
 * Convert a `figma_execute` Plugin-API tree dump into the `FigmaFile` shape
 * that `walkFigmaFile()` consumes — sibling adapter to `parseFigmaRestFile`.
 *
 * The walker stays mode-blind. The two source-mode differences live here:
 *  - REST owns a file-level `componentSets` dict (with descriptions + remote-
 *    only entries). The Plugin API has no equivalent — we synthesise the dict
 *    by walking the tree, which makes `tree_unique_count === indexed_count`
 *    and `remote_only_count === 0` an inherent T0 property (not a defect).
 *  - REST node-shape is structurally identical to the Plugin-API serialised
 *    shape for the fields the walker reads (`id`, `name`, `type`, `children`,
 *    `componentPropertyDefinitions`). PAGE vs CANVAS naming is irrelevant —
 *    walker only cares about COMPONENT_SET / COMPONENT type-checks downstream.
 */
export function fromRuntimeTree(
  input: unknown,
  options: RuntimeAdapterOptions = {},
): FigmaFile {
  if (typeof input !== "object" || input === null) {
    throw new Error("fromRuntimeTree: expected object, got " + typeof input);
  }
  const tree = input as Partial<RuntimeTree>;
  if (!Array.isArray(tree.pages)) {
    throw new Error("fromRuntimeTree: missing 'pages' array");
  }

  const pages = tree.pages as RuntimePage[];
  const componentSets: Record<string, FigmaComponentSetMeta> = {};
  for (const page of pages) {
    collectComponentSets(page.children ?? [], componentSets);
  }

  const fileName = options.fileName ?? tree.fileName;
  return {
    name: fileName,
    document: { children: pages as unknown as FigmaRestNode[] },
    componentSets,
  };
}

function collectComponentSets(
  nodes: RuntimeNode[],
  out: Record<string, FigmaComponentSetMeta>,
): void {
  for (const node of nodes) {
    if (node.type === "COMPONENT_SET" && node.id) {
      out[node.id] = {
        name: node.name ?? "",
        description: node.description ?? "",
      };
    }
    if (node.children) {
      collectComponentSets(node.children, out);
    }
  }
}

// Re-exports for callers who prefer to import the types alongside the function.
export type {
  ComponentPropertyDefinition,
  RuntimeAdapterOptions,
  RuntimeNode,
  RuntimePage,
  RuntimeTree,
};
