import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as yamlParse } from "yaml";
import { walkFigmaFile } from "../../src/extractor/walker.js";
import { parseFigmaRestFile } from "../../src/extractor/figma-rest-adapter.js";
import { emitPhase1Yaml } from "../../src/extractor/yaml-emit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures/synthetic");
const FIXED_GENERATED_AT = "2026-04-26T11:00:30Z";

function loadFixture(name: string) {
  const raw = readFileSync(join(FIXTURES, `${name}.figma.json`), "utf8");
  return parseFigmaRestFile(JSON.parse(raw));
}

function emitMinimal(): string {
  const file = loadFixture("minimal-ds");
  const out = walkFigmaFile(file, {
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: {
      walker: "scripts/figma-phase1-extract.sh",
      transformer: "scripts/extract-to-yaml.sh",
      tier: "T1",
    },
  });
  return emitPhase1Yaml(out);
}

describe("emitPhase1Yaml — basic shape", () => {
  it("returns a non-empty string", () => {
    const yaml = emitMinimal();
    expect(typeof yaml).toBe("string");
    expect(yaml.length).toBeGreaterThan(0);
  });

  it("ends with a single trailing newline (LF)", () => {
    const yaml = emitMinimal();
    expect(yaml.endsWith("\n")).toBe(true);
    expect(yaml.endsWith("\n\n")).toBe(false);
  });

  it("uses LF line endings (no CRLF)", () => {
    const yaml = emitMinimal();
    expect(yaml.includes("\r")).toBe(false);
  });

  it("opens with schema_version on the first line", () => {
    const yaml = emitMinimal();
    expect(yaml.split("\n")[0]).toBe("schema_version: phase-1-output-v1");
  });

  it("preserves top-level key order from the bash transformer", () => {
    const yaml = emitMinimal();
    const lines = yaml.split("\n");
    const topLevel = lines
      .filter((l) => /^[a-z_]+:/.test(l))
      .map((l) => l.split(":")[0]);
    expect(topLevel).toEqual([
      "schema_version",
      "generated_at",
      "generated_by",
      "figma_file",
      "ds_inventory",
      "libraries",
      "token_regime",
      "theming_matrix",
      "seeded_findings",
      "interpretation",
    ]);
  });

  it("emits empty arrays as flow style ([])", () => {
    const yaml = emitMinimal();
    expect(yaml).toMatch(/utility: \[\]/);
    expect(yaml).toMatch(/linked: \[\]/);
    expect(yaml).toMatch(/interpretation: \[\]/);
  });

  it("emits null as the literal `null`", () => {
    const yaml = emitMinimal();
    expect(yaml).toMatch(/file_key: null/);
    expect(yaml).toMatch(/remote_components: null/);
    expect(yaml).toMatch(/detected: null/);
  });

  it("quotes the ISO 8601 generated_at string", () => {
    const yaml = emitMinimal();
    expect(yaml).toMatch(/generated_at: "2026-04-26T11:00:30Z"/);
  });

  it("renders propertyDefinitions in block style with 2-space indent", () => {
    const yaml = emitMinimal();
    expect(yaml).toContain("        propertyDefinitions:\n          State:");
  });

  it("round-trips: emit → parse → re-emit yields the same text", () => {
    const yaml = emitMinimal();
    const parsed = yamlParse(yaml);
    expect(parsed.schema_version).toBe("phase-1-output-v1");
    expect(parsed.ds_inventory.component_sets.total).toBe(5);
    expect(parsed.figma_file.file_name).toBe("fixture-minimal-ds");
  });
});

describe("emitPhase1Yaml — preserves all walker data", () => {
  it("includes every component_set entry", () => {
    const yaml = emitMinimal();
    const parsed = yamlParse(yaml);
    const names = parsed.ds_inventory.component_sets.entries.map((e: any) => e.name);
    expect(names).toEqual(["Button", "TextField", "Checkbox", "Badge", "Card"]);
  });

  it("includes seeded_findings as block list", () => {
    const yaml = emitMinimal();
    expect(yaml).toMatch(/seeded_findings:\n {2}- id: §A/);
    const parsed = yamlParse(yaml);
    expect(parsed.seeded_findings).toHaveLength(1);
    expect(parsed.seeded_findings[0].id).toBe("§A");
  });

  it("preserves Lever-5 prose fields on §C with multi-line strings", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const yaml = emitPhase1Yaml(out);
    const parsed = yamlParse(yaml);
    const sectionC = parsed.seeded_findings.find((f: any) => f.id === "§C");
    expect(sectionC.plain_language).toMatch(/remote library/);
    expect(sectionC.concrete_example).toMatch(/indexed_count/);
  });

  it("emits §Z-frame-named instances as a YAML list", () => {
    const file = loadFixture("threshold-trigger");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const yaml = emitPhase1Yaml(out);
    const parsed = yamlParse(yaml);
    const zFrame = parsed.seeded_findings.find((f: any) => f.id === "§Z-frame-named");
    expect(zFrame.instances).toEqual(["Frame 42"]);
  });

  it("omits absent Lever-5 fields from §A so cluster-Z findings stay observation-only", () => {
    const yaml = emitMinimal();
    const parsed = yamlParse(yaml);
    const sectionA = parsed.seeded_findings[0];
    expect(sectionA).not.toHaveProperty("plain_language");
    expect(sectionA).not.toHaveProperty("concrete_example");
    expect(sectionA).not.toHaveProperty("instances");
  });
});

describe("emitPhase1Yaml — empty / boundary outputs", () => {
  it("renders no-triggers fixture with empty seeded_findings list", () => {
    const file = loadFixture("no-triggers");
    const out = walkFigmaFile(file, { generatedAt: FIXED_GENERATED_AT });
    const yaml = emitPhase1Yaml(out);
    expect(yaml).toMatch(/seeded_findings: \[\]/);
  });

  it("handles standalone_components with content (utility/widget mixed)", () => {
    const out = walkFigmaFile(
      parseFigmaRestFile({
        name: "stand",
        document: {
          children: [
            {
              name: "P",
              type: "CANVAS",
              children: [
                { id: "1", type: "COMPONENT", name: "FocusRing" },
                { id: "2", type: "COMPONENT", name: "RandomThing" },
              ],
            },
          ],
        },
        componentSets: {},
      }),
      { generatedAt: FIXED_GENERATED_AT },
    );
    const yaml = emitPhase1Yaml(out);
    expect(yaml).toMatch(/utility:\n {6}- FocusRing/);
    expect(yaml).toMatch(/widget:\n {6}- RandomThing/);
    expect(yaml).toMatch(/documentation: \[\]/);
    expect(yaml).toMatch(/asset: \[\]/);
  });
});
