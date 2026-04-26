import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fromRuntimeTree } from "../../src/extractor/figma-runtime-adapter.js";
import { walkFigmaFile } from "../../src/extractor/walker.js";
import { DEFAULT_GENERATED_BY_RUNTIME, type RuntimeTree } from "../../src/extractor/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures/synthetic");

function loadRuntimeFixture(name: string): RuntimeTree {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
}

const FIXED_GENERATED_AT = "2026-04-26T00:00:00Z";

describe("fromRuntimeTree — shape normalisation", () => {
  it("returns a FigmaFile object with document.children populated from pages", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    expect(file.document.children).toHaveLength(tree.pages.length);
    expect(file.document.children[0].name).toBe("Controls");
    expect(file.document.children[1].name).toBe("Display");
  });

  it("propagates fileName from the tree onto FigmaFile.name", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    expect(file.name).toBe("fixture-runtime-primer");
  });

  it("lets the options.fileName override tree.fileName", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree, { fileName: "explicit-override" });
    expect(file.name).toBe("explicit-override");
  });

  it("synthesises componentSets dict from in-tree COMPONENT_SET nodes", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    const dict = file.componentSets ?? {};
    expect(Object.keys(dict).sort()).toEqual(["10:1", "10:5", "20:1"]);
    expect(dict["10:1"].name).toBe("Button");
    expect(dict["10:5"].name).toBe("TextField");
    expect(dict["20:1"].name).toBe("Badge");
  });

  it("preserves COMPONENT_SET descriptions from runtime nodes", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    const dict = file.componentSets ?? {};
    expect(dict["10:1"].description).toMatch(/Primary interactive control/);
    expect(dict["20:1"].description).toMatch(/Status indicator/);
    expect(dict["10:5"].description ?? "").toBe("");
  });

  it("throws on missing pages array (runtime tree did not serialise root)", () => {
    expect(() => fromRuntimeTree({} as unknown as RuntimeTree)).toThrow(
      /pages/i,
    );
  });

  it("throws on non-object input (defensive against figma_execute string-return)", () => {
    expect(() => fromRuntimeTree(null as unknown as RuntimeTree)).toThrow(
      /expected object/i,
    );
    expect(() => fromRuntimeTree("oops" as unknown as RuntimeTree)).toThrow(
      /expected object/i,
    );
  });

  it("tolerates empty pages array (file with no canvases)", () => {
    const file = fromRuntimeTree({ pages: [] });
    expect(file.document.children).toEqual([]);
    expect(file.componentSets).toEqual({});
  });

  it("walks nested children when discovering COMPONENT_SETs (deep nesting)", () => {
    const nested: RuntimeTree = {
      pages: [
        {
          id: "0:1",
          name: "Page",
          type: "PAGE",
          children: [
            {
              id: "f1",
              type: "FRAME",
              name: "Wrapper",
              children: [
                {
                  id: "cs1",
                  type: "COMPONENT_SET",
                  name: "DeepButton",
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const file = fromRuntimeTree(nested);
    expect(file.componentSets).toHaveProperty("cs1");
    expect(file.componentSets!["cs1"].name).toBe("DeepButton");
  });
});

describe("fromRuntimeTree → walker integration", () => {
  it("walker output has tier T0 when DEFAULT_GENERATED_BY_RUNTIME is passed", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    const out = walkFigmaFile(file, {
      generatedAt: FIXED_GENERATED_AT,
      generatedBy: { ...DEFAULT_GENERATED_BY_RUNTIME },
    });
    expect(out.generated_by.tier).toBe("T0");
    expect(out.generated_by.transformer).toMatch(/figma-runtime-adapter/);
  });

  it("walker discovers all 3 COMPONENT_SETs from runtime tree", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.component_sets.tree_unique_count).toBe(3);
    const names = out.ds_inventory.component_sets.entries.map((e) => e.name).sort();
    expect(names).toEqual(["Badge", "Button", "TextField"]);
  });

  it("walker derives indexed_count from synthesised dict (T0 → no remote-only)", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.component_sets.total).toBe(3);
    expect(out.ds_inventory.component_sets.remote_only_count).toBe(0);
  });

  it("walker counts componentSet descriptions correctly (2 of 3 have descriptions)", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const desc = out.ds_inventory.figma_component_descriptions;
    expect(desc.with_description).toBe(2);
    expect(desc.without_description).toBe(1);
  });

  it("walker classifies standalone COMPONENT (Divider) as utility, icon-search as asset", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const sa = out.ds_inventory.standalone_components;
    expect(sa.utility).toContain("Divider");
    expect(sa.asset).toContain("icon-search");
  });

  it("walker captures doc-frame (_doc-button-usage) into doc_frames_info", () => {
    const tree = loadRuntimeFixture("runtime-tree-primer");
    const file = fromRuntimeTree(tree);
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.doc_frames_info.count).toBe(1);
    expect(out.ds_inventory.doc_frames_info.samples[0].name).toBe("_doc-button-usage");
  });
});
