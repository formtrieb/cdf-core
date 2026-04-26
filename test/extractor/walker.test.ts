import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { walkFigmaFile } from "../../src/extractor/walker.js";
import { parseFigmaRestFile } from "../../src/extractor/figma-rest-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures/synthetic");

function loadFixture(name: string) {
  const raw = readFileSync(join(FIXTURES, `${name}.figma.json`), "utf8");
  return parseFigmaRestFile(JSON.parse(raw));
}

const FIXED_GENERATED_AT = "2026-04-26T00:00:00Z";

describe("walker — minimal-ds fixture", () => {
  it("emits phase-1-output-v1 schema_version", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.schema_version).toBe("phase-1-output-v1");
  });

  it("captures the file_name from the REST payload", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.figma_file.file_name).toBe("fixture-minimal-ds");
    expect(out.figma_file.file_key).toBeNull();
  });

  it("counts 5 component_sets across 2 content pages", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.component_sets.total).toBe(5);
    expect(out.ds_inventory.component_sets.tree_unique_count).toBe(5);
    expect(out.ds_inventory.component_sets.remote_only_count).toBe(0);
    expect(out.ds_inventory.pages.total).toBe(2);
    expect(out.ds_inventory.pages.content).toBe(2);
    expect(out.ds_inventory.pages.separator_or_meta).toBe(0);
  });

  it("groups component_sets by page alphabetically (Controls=3, Display=2)", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.component_sets.by_page).toEqual([
      { name: "Controls", count: 3 },
      { name: "Display", count: 2 },
    ]);
  });

  it("records each component_set entry with id+name+page+variantCount", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const entries = out.ds_inventory.component_sets.entries;
    expect(entries).toHaveLength(5);
    const button = entries.find((e) => e.name === "Button");
    expect(button).toBeDefined();
    expect(button?.id).toBe("1:1");
    expect(button?.page).toBe("Controls");
    expect(button?.variantCount).toBe(1);
  });

  it("seeds finding §A only (description-gap, no other thresholds met)", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const ids = out.seeded_findings.map((f) => f.id);
    expect(ids).toEqual(["§A"]);
  });

  it("emits empty interpretation array on initial walker pass", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.interpretation).toEqual([]);
  });

  it("classifies standalone_components into 4 role buckets (all empty here)", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.standalone_components).toEqual({
      utility: [],
      documentation: [],
      widget: [],
      asset: [],
    });
  });

  it("preserves generatedAt and generatedBy options", () => {
    const file = loadFixture("minimal-ds");
    const out = walkFigmaFile(file, {
      generatedAt: FIXED_GENERATED_AT,
      generatedBy: { walker: "x.ts", transformer: "y.ts", tier: "T1" },
    });
    expect(out.generated_at).toBe(FIXED_GENERATED_AT);
    expect(out.generated_by.walker).toBe("x.ts");
    expect(out.generated_by.transformer).toBe("y.ts");
    expect(out.generated_by.tier).toBe("T1");
  });
});

describe("walker — threshold-trigger fixture", () => {
  it("seeds all 4 findings (§A + §C + §Z-frame-named + §Z-page-ratio)", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const ids = out.seeded_findings.map((f) => f.id);
    expect(ids).toEqual(["§A", "§C", "§Z-frame-named", "§Z-page-ratio"]);
  });

  it("§Z-frame-named lists 'Frame 42' as instance", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const f = out.seeded_findings.find((x) => x.id === "§Z-frame-named");
    expect(f?.instances).toEqual(["Frame 42"]);
  });

  it("counts remote-only component_sets correctly (6 indexed - 5 tree = 1 remote)", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.component_sets.total).toBe(6);
    expect(out.ds_inventory.component_sets.tree_unique_count).toBe(5);
    expect(out.ds_inventory.component_sets.remote_only_count).toBe(1);
  });

  it("computes 1-decimal page ratio (3/1 = 3) — emitted as 3", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const f = out.seeded_findings.find((x) => x.id === "§Z-page-ratio");
    expect(f?.observation).toBe("pages.total/content ratio = 3");
  });

  it("§A carries default_if_unsure with accept-as-divergence + rationale", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const f = out.seeded_findings.find((x) => x.id === "§A");
    expect(f?.default_if_unsure?.decision).toBe("accept-as-divergence");
    expect(f?.default_if_unsure?.rationale).toMatch(/doc-frame/);
  });

  it("§C carries plain_language + concrete_example + default_if_unsure (Lever-5 prose)", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const f = out.seeded_findings.find((x) => x.id === "§C");
    expect(f?.plain_language).toBeDefined();
    expect(f?.plain_language).toMatch(/remote library/);
    expect(f?.concrete_example).toMatch(/indexed_count/);
    expect(f?.default_if_unsure?.decision).toBe("accept-as-divergence");
  });

  it("§Z-* findings stay observation-only (no Lever-5 prose fields)", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const z1 = out.seeded_findings.find((x) => x.id === "§Z-frame-named");
    const z2 = out.seeded_findings.find((x) => x.id === "§Z-page-ratio");
    expect(z1?.plain_language).toBeUndefined();
    expect(z1?.concrete_example).toBeUndefined();
    expect(z2?.plain_language).toBeUndefined();
    expect(z2?.concrete_example).toBeUndefined();
  });

  it("counts 3 pages, 1 with content (separator ratio drives §Z-page-ratio)", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.pages.total).toBe(3);
    expect(out.ds_inventory.pages.content).toBe(1);
    expect(out.ds_inventory.pages.separator_or_meta).toBe(2);
  });
});

describe("walker — no-triggers fixture", () => {
  it("emits empty seeded_findings (40% description coverage clears §A)", () => {
    const file = loadFixture("no-triggers");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.seeded_findings).toEqual([]);
  });

  it("with_description=2, ratio=0.4", () => {
    const file = loadFixture("no-triggers");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.figma_component_descriptions.with_description).toBe(2);
    expect(out.ds_inventory.figma_component_descriptions.without_description).toBe(3);
    expect(out.ds_inventory.figma_component_descriptions.ratio).toBeCloseTo(0.4);
  });
});

describe("walker — edge cases", () => {
  function makeFile(over: Partial<{
    name: string;
    children: any[];
    componentSets: Record<string, { name?: string; description?: string }>;
  }>) {
    const base: any = {
      name: over.name ?? "test-fixture",
      document: { children: over.children ?? [] },
      componentSets: over.componentSets ?? {},
    };
    return parseFigmaRestFile(base);
  }

  it("handles an empty document with zero children", () => {
    const out = walkFigmaFile(makeFile({}), { generatedAt: FIXED_GENERATED_AT });
    expect(out.ds_inventory.component_sets.total).toBe(0);
    expect(out.ds_inventory.component_sets.entries).toEqual([]);
    expect(out.seeded_findings).toEqual([]);
  });

  it("strips preferredValues from componentPropertyDefinitions", () => {
    const out = walkFigmaFile(
      makeFile({
        children: [
          {
            name: "P", type: "CANVAS", children: [
              {
                id: "1:1", type: "COMPONENT_SET", name: "Btn",
                children: [],
                componentPropertyDefinitions: {
                  Label: { type: "TEXT", defaultValue: "x", preferredValues: [{ type: "VARIABLE_ALIAS", value: "v" }] },
                },
              },
            ],
          },
        ],
        componentSets: { "1:1": { name: "Btn" } },
      }),
      { generatedAt: FIXED_GENERATED_AT },
    );
    const def = out.ds_inventory.component_sets.entries[0].propertyDefinitions.Label;
    expect(def.type).toBe("TEXT");
    expect(def.defaultValue).toBe("x");
    expect(def).not.toHaveProperty("preferredValues");
  });

  it("dedups component_sets by id (first occurrence wins)", () => {
    const out = walkFigmaFile(
      makeFile({
        children: [
          {
            name: "P1", type: "CANVAS", children: [
              { id: "1:1", type: "COMPONENT_SET", name: "Btn-page1", children: [] },
            ],
          },
          {
            name: "P2", type: "CANVAS", children: [
              { id: "1:1", type: "COMPONENT_SET", name: "Btn-page2-dup", children: [] },
            ],
          },
        ],
        componentSets: { "1:1": { name: "Btn-page1" } },
      }),
      { generatedAt: FIXED_GENERATED_AT },
    );
    expect(out.ds_inventory.component_sets.entries).toHaveLength(1);
    expect(out.ds_inventory.component_sets.entries[0].name).toBe("Btn-page1");
    expect(out.ds_inventory.component_sets.entries[0].page).toBe("P1");
  });

  it("classifies standalone components into utility/documentation/widget/asset", () => {
    const out = walkFigmaFile(
      makeFile({
        children: [
          {
            name: "Foundations", type: "CANVAS", children: [
              { id: "1:1", type: "COMPONENT", name: "FocusRing" },
              { id: "1:2", type: "COMPONENT", name: "DocOverview" },
              { id: "1:3", type: "COMPONENT", name: "RandomWidget" },
              { id: "1:4", type: "COMPONENT", name: "IconHome" },
            ],
          },
        ],
      }),
      { generatedAt: FIXED_GENERATED_AT },
    );
    expect(out.ds_inventory.standalone_components.utility).toContain("FocusRing");
    expect(out.ds_inventory.standalone_components.documentation).toContain("DocOverview");
    expect(out.ds_inventory.standalone_components.widget).toContain("RandomWidget");
    expect(out.ds_inventory.standalone_components.asset).toContain("IconHome");
  });

  it("excludes COMPONENT children of COMPONENT_SET from standalones", () => {
    const out = walkFigmaFile(
      makeFile({
        children: [
          {
            name: "P", type: "CANVAS", children: [
              {
                id: "1:1", type: "COMPONENT_SET", name: "Btn", children: [
                  { id: "1:2", type: "COMPONENT", name: "State=enabled" },
                ],
              },
            ],
          },
        ],
      }),
      { generatedAt: FIXED_GENERATED_AT },
    );
    expect(out.ds_inventory.standalone_components.widget).toEqual([]);
    expect(out.ds_inventory.standalone_components.utility).toEqual([]);
  });

  it("detects doc-frames anywhere in the tree (count + sample cap of 5)", () => {
    const docNodes = Array.from({ length: 7 }, (_, i) => ({
      id: `f:${i}`,
      type: "FRAME",
      name: `Documentation ${i}`,
    }));
    const out = walkFigmaFile(
      makeFile({
        children: [{ name: "Docs", type: "CANVAS", children: docNodes }],
      }),
      { generatedAt: FIXED_GENERATED_AT },
    );
    expect(out.ds_inventory.doc_frames_info.count).toBe(7);
    expect(out.ds_inventory.doc_frames_info.samples).toHaveLength(5);
  });

  it("detects Frame-N pattern across both component_sets and standalones", () => {
    const out = walkFigmaFile(
      makeFile({
        children: [
          {
            name: "P", type: "CANVAS", children: [
              { id: "1:1", type: "COMPONENT_SET", name: "Frame 1", children: [] },
              { id: "1:2", type: "COMPONENT", name: "Frame 99" },
            ],
          },
        ],
        componentSets: { "1:1": { name: "Frame 1" } },
      }),
      { generatedAt: FIXED_GENERATED_AT },
    );
    const f = out.seeded_findings.find((x) => x.id === "§Z-frame-named");
    expect(f?.instances).toEqual(["Frame 1", "Frame 99"]);
  });

  it("returns null file_name when source has no name field", () => {
    const out = walkFigmaFile(parseFigmaRestFile({ document: { children: [] } }), {
      generatedAt: FIXED_GENERATED_AT,
    });
    expect(out.figma_file.file_name).toBeNull();
  });

  it("respects the optional fileKey option", () => {
    const out = walkFigmaFile(loadFixture("minimal-ds"), {
      generatedAt: FIXED_GENERATED_AT,
      fileKey: "abc123",
    });
    expect(out.figma_file.file_key).toBe("abc123");
  });
});

describe("parseFigmaRestFile", () => {
  it("rejects non-object input", () => {
    expect(() => parseFigmaRestFile(null)).toThrow();
    expect(() => parseFigmaRestFile("string")).toThrow();
    expect(() => parseFigmaRestFile(42)).toThrow();
  });

  it("rejects payload without document", () => {
    expect(() => parseFigmaRestFile({})).toThrow(/document/);
  });

  it("rejects payload with non-array document.children", () => {
    expect(() => parseFigmaRestFile({ document: { children: "nope" } })).toThrow(/children/);
  });

  it("accepts a minimal valid payload", () => {
    const file = parseFigmaRestFile({ document: { children: [] } });
    expect(file.document.children).toEqual([]);
  });
});
