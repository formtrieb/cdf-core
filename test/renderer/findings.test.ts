import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as yamlParse } from "yaml";
import {
  renderFindingsMd,
  renderConformanceYaml,
  renderHousekeepingMd,
  renderShipBlockers,
} from "../../src/renderer/findings-renderer.js";
import type { FindingsInput } from "../../src/renderer/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures/findings");

function loadFixture(name: string): FindingsInput {
  return yamlParse(readFileSync(join(FIXTURES, name), "utf8"));
}

describe("renderFindingsMd — fixture A (mixed-decisions, 5 findings, no Z)", () => {
  const f = loadFixture("fixture-A-mixed-decisions.findings.yaml");

  it("renders cluster A header (Token-Layer Architecture)", () => {
    expect(renderFindingsMd(f)).toContain("## Cluster A · Token-Layer Architecture");
  });
  it("renders cluster B header (Theming & Coverage)", () => {
    expect(renderFindingsMd(f)).toContain("## Cluster B · Theming & Coverage");
  });
  it("renders cluster D header (Accessibility Patterns)", () => {
    expect(renderFindingsMd(f)).toContain("## Cluster D · Accessibility Patterns");
  });
  it("renders cluster E header (Documentation Surfaces)", () => {
    expect(renderFindingsMd(f)).toContain("## Cluster E · Documentation Surfaces");
  });
  it("emits the correct total in summary", () => {
    expect(renderFindingsMd(f)).toMatch(/Total findings:.* 5/);
  });
  it("skips clusters with zero count (no Cluster C section)", () => {
    expect(renderFindingsMd(f)).not.toContain("## Cluster C");
  });
  it("does NOT render Housekeeping when Z is empty", () => {
    expect(renderFindingsMd(f)).not.toContain("## Housekeeping");
  });
  it("emits the DS-name H1", () => {
    expect(renderFindingsMd(f)).toMatch(/^# testfix · Findings/);
  });
  it("renders the no-ship-blockers banner", () => {
    expect(renderFindingsMd(f)).toContain("Ship blockers:");
    expect(renderFindingsMd(f)).toContain("none — Profile is ship-ready");
  });
  it("renders each finding's User-Decision label", () => {
    const md = renderFindingsMd(f);
    expect(md).toContain("**User-Decision:** `adopt-DTCG`");
    expect(md).toContain("**User-Decision:** `accept-as-divergence`");
    expect(md).toContain("**User-Decision:** `drop`");
  });
});

describe("renderConformanceYaml — fixture A", () => {
  const f = loadFixture("fixture-A-mixed-decisions.findings.yaml");

  it("filters to only accept-as-divergence findings (1 in fixture A)", () => {
    const yaml = renderConformanceYaml(f);
    const parsed = yamlParse(yaml);
    expect(parsed.conformance_overlay.divergences).toHaveLength(1);
  });
  it("uses #§<id> format for the finding_ref", () => {
    const yaml = renderConformanceYaml(f);
    const parsed = yamlParse(yaml);
    expect(parsed.conformance_overlay.divergences[0].finding_ref).toBe("#§p4-A");
  });
  it("points the profile field at <ds>.profile.yaml", () => {
    const yaml = renderConformanceYaml(f);
    const parsed = yamlParse(yaml);
    expect(parsed.conformance_overlay.profile).toBe("testfix.profile.yaml");
  });
  it("captures the cluster + title + observation in the divergence record", () => {
    const yaml = renderConformanceYaml(f);
    const parsed = yamlParse(yaml);
    const d = parsed.conformance_overlay.divergences[0];
    expect(d.cluster).toBe("B");
    expect(d.title).toBe("Brand-B sparsity");
    expect(d.known_issue).toMatch(/Brand-B has 384 leaves/);
    expect(d.status).toBe("accepted");
    expect(d.scope).toBe("tbd");
    expect(d.target).toBe("tbd");
  });
});

describe("renderFindingsMd — fixture B (Z-inline, count=5 ≤ threshold)", () => {
  const f = loadFixture("fixture-B-z-inline.findings.yaml");

  it("inlines housekeeping with the Z-count header", () => {
    expect(renderFindingsMd(f)).toContain("## Housekeeping (quality / naming) — 5 entries");
  });
  it("includes §p1-Z1 (first Z) inline", () => {
    expect(renderFindingsMd(f)).toContain("§p1-Z1");
  });
  it("includes §p1-Z5 (last Z) inline", () => {
    expect(renderFindingsMd(f)).toContain("§p1-Z5");
  });
  it("does NOT emit a 'split to sibling file' pointer", () => {
    expect(renderFindingsMd(f)).not.toContain("split to sibling file");
  });
});

describe("renderHousekeepingMd — fixture B", () => {
  const f = loadFixture("fixture-B-z-inline.findings.yaml");
  it("returns empty string when Z ≤ threshold (no-op)", () => {
    expect(renderHousekeepingMd(f)).toBe("");
  });
});

describe("renderFindingsMd — fixture C (Z-split + ship-blockers)", () => {
  const f = loadFixture("fixture-C-blockers-and-zsplit.findings.yaml");

  it("emits the split-to-sibling-file pointer (Z exceeded threshold)", () => {
    expect(renderFindingsMd(f)).toContain("split to sibling file");
  });
  it("does NOT inline §p1-Z1 in findings.md when Z is split", () => {
    expect(renderFindingsMd(f)).not.toContain("§p1-Z1");
  });
  it("renders ship-blocker count + STOPS RELEASE in summary", () => {
    expect(renderFindingsMd(f)).toContain("Ship blockers (2) — STOPS RELEASE:");
  });
});

describe("renderHousekeepingMd — fixture C (Z=15, > threshold)", () => {
  const f = loadFixture("fixture-C-blockers-and-zsplit.findings.yaml");

  it("contains §p1-Z1 (first Z)", () => {
    expect(renderHousekeepingMd(f)).toContain("§p1-Z1");
  });
  it("contains §p1-Z15 (last Z)", () => {
    expect(renderHousekeepingMd(f)).toContain("§p1-Z15");
  });
  it("contains the split preamble", () => {
    expect(renderHousekeepingMd(f)).toContain("split out");
  });
  it("emits the DS-name housekeeping H1", () => {
    expect(renderHousekeepingMd(f)).toMatch(/^# blockers · Housekeeping/);
  });
});

describe("renderShipBlockers — fixture C", () => {
  const f = loadFixture("fixture-C-blockers-and-zsplit.findings.yaml");

  it("emits the count line", () => {
    expect(renderShipBlockers(f)).toContain("Ship blockers (2):");
  });
  it("lists §p2-A", () => {
    expect(renderShipBlockers(f)).toContain("§p2-A");
  });
  it("lists §p2-B", () => {
    expect(renderShipBlockers(f)).toContain("§p2-B");
  });
});

describe("renderShipBlockers — fixture A (no blockers)", () => {
  const f = loadFixture("fixture-A-mixed-decisions.findings.yaml");
  it("emits the no-blockers message", () => {
    expect(renderShipBlockers(f)).toBe("No ship blockers.\n");
  });
});

describe("findings renderers — schema validation", () => {
  it("renderFindingsMd hard-fails on schema mismatch", () => {
    const f = loadFixture("fixture-A-mixed-decisions.findings.yaml");
    const bad = { ...f, schema_version: "findings-v0" };
    expect(() => renderFindingsMd(bad)).toThrow(/schema mismatch/);
  });
  it("renderConformanceYaml hard-fails on schema mismatch", () => {
    const f = loadFixture("fixture-A-mixed-decisions.findings.yaml");
    const bad = { ...f, schema_version: "findings-v0" };
    expect(() => renderConformanceYaml(bad)).toThrow(/schema mismatch/);
  });
});

describe("findings renderers — determinism", () => {
  it("two calls on the same input produce byte-identical findings.md", () => {
    const f = loadFixture("fixture-A-mixed-decisions.findings.yaml");
    expect(renderFindingsMd(f)).toBe(renderFindingsMd(f));
  });
  it("two calls produce byte-identical conformance.yaml", () => {
    const f = loadFixture("fixture-A-mixed-decisions.findings.yaml");
    expect(renderConformanceYaml(f)).toBe(renderConformanceYaml(f));
  });
  it("uses LF line endings only", () => {
    const f = loadFixture("fixture-C-blockers-and-zsplit.findings.yaml");
    expect(renderFindingsMd(f).includes("\r")).toBe(false);
  });
});
