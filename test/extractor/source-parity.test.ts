/**
 * N5.4 — Source-parity test (T0 ≡ T1 walker output).
 *
 * Contract: walking the SAME logical Figma tree via parseFigmaRestFile (REST)
 * and via fromRuntimeTree (runtime) MUST produce shape-equivalent
 * Phase1Output, modulo a small allowed-delta list.
 *
 * Allowed deltas:
 *   - generated_at — clock-derived; we pin both to the same timestamp here so
 *     the assertion is real-deltas-only.
 *   - generated_by.tier — REST defaults to "T1", runtime defaults to "T0".
 *   - generated_by.transformer — REST: walker.ts; runtime: figma-runtime-adapter.ts.
 *
 * Anything else that diverges is either:
 *   (a) a real adapter bug → fix the adapter (preferred per Session-C plan), or
 *   (b) an unavoidable T0-vs-T1 difference (e.g. remote-only counts: T0 can't
 *       see them, T1 might) → must show up in the allowed-deltas list with a
 *       documented reason. The fixture pair is engineered so REST has no
 *       remote-only entries either, so the assertion holds end-to-end.
 *
 * Reference: docs/plans/active/2026-04-26-figma-access-modernization.md §N5.4.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { walkFigmaFile } from "../../src/extractor/walker.js";
import { parseFigmaRestFile } from "../../src/extractor/figma-rest-adapter.js";
import { fromRuntimeTree } from "../../src/extractor/figma-runtime-adapter.js";
import {
  DEFAULT_GENERATED_BY,
  DEFAULT_GENERATED_BY_RUNTIME,
  type Phase1Output,
} from "../../src/extractor/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures/synthetic");

const FIXED_GENERATED_AT = "2026-04-26T00:00:00Z";
const FIXED_FILE_KEY = "PARITY_TEST_KEY";

function loadJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, relPath), "utf8"));
}

function walkRest(): Phase1Output {
  const file = parseFigmaRestFile(loadJson("runtime-tree-primer.rest.json"));
  return walkFigmaFile(file, {
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: { ...DEFAULT_GENERATED_BY },
    fileKey: FIXED_FILE_KEY,
  });
}

function walkRuntime(): Phase1Output {
  const file = fromRuntimeTree(loadJson("runtime-tree-primer.json"));
  return walkFigmaFile(file, {
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: { ...DEFAULT_GENERATED_BY_RUNTIME },
    fileKey: FIXED_FILE_KEY,
  });
}

/**
 * Strip the documented allowed-deltas so deep-equality compares the rest.
 * If a future delta surfaces, EXTEND THIS LIST EXPLICITLY rather than
 * loosening the assertion — the parity test loses its value otherwise.
 */
function withoutAllowedDeltas(out: Phase1Output) {
  const { generated_at, generated_by, ...rest } = out;
  void generated_at;
  void generated_by;
  return rest;
}

describe("source-parity: T0 (runtime) ≡ T1 (REST) walker output", () => {
  it("same fixture pair produces identical inventory + findings (modulo allowed-deltas)", () => {
    const restOut = walkRest();
    const runtimeOut = walkRuntime();
    expect(withoutAllowedDeltas(runtimeOut)).toEqual(withoutAllowedDeltas(restOut));
  });

  it("allowed-delta: generated_by.tier — T1 vs T0", () => {
    expect(walkRest().generated_by.tier).toBe("T1");
    expect(walkRuntime().generated_by.tier).toBe("T0");
  });

  it("allowed-delta: generated_by.transformer — walker.ts vs figma-runtime-adapter.ts", () => {
    expect(walkRest().generated_by.transformer).toMatch(/walker\.ts/);
    expect(walkRuntime().generated_by.transformer).toMatch(/figma-runtime-adapter\.ts/);
  });

  it("schema_version is identical across modes (consumer-shape contract)", () => {
    expect(walkRuntime().schema_version).toBe(walkRest().schema_version);
  });

  it("ds_inventory.component_sets is identical across modes", () => {
    expect(walkRuntime().ds_inventory.component_sets).toEqual(
      walkRest().ds_inventory.component_sets,
    );
  });

  it("ds_inventory.standalone_components is identical across modes", () => {
    expect(walkRuntime().ds_inventory.standalone_components).toEqual(
      walkRest().ds_inventory.standalone_components,
    );
  });

  it("ds_inventory.figma_component_descriptions is identical (descriptions reach both modes)", () => {
    expect(walkRuntime().ds_inventory.figma_component_descriptions).toEqual(
      walkRest().ds_inventory.figma_component_descriptions,
    );
  });

  it("seeded_findings is identical across modes (same thresholds met)", () => {
    expect(walkRuntime().seeded_findings).toEqual(walkRest().seeded_findings);
  });

  it("ds_inventory.doc_frames_info is identical across modes", () => {
    expect(walkRuntime().ds_inventory.doc_frames_info).toEqual(
      walkRest().ds_inventory.doc_frames_info,
    );
  });
});
