import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as yamlParse } from "yaml";
import {
  renderSnapshot,
  type SnapshotProfile,
  type SnapshotFindings,
} from "../../src/renderer/snapshot-renderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures/snapshot");

function loadProfile(): SnapshotProfile {
  return yamlParse(readFileSync(join(FIXTURES, "testfix.snapshot.profile.yaml"), "utf8"));
}
function loadFindings(): SnapshotFindings {
  return yamlParse(readFileSync(join(FIXTURES, "testfix.snapshot.findings.yaml"), "utf8"));
}

describe("renderSnapshot — happy path", () => {
  it("emits a non-empty markdown string", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(100);
  });

  it("includes the GitHub admonition WARNING + DRAFT marker", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(md).toContain("[!WARNING]");
    expect(md).toContain("DRAFT — UNCLASSIFIED");
  });

  it("renders the four sections in BANNER → FINDINGS → BLIND_SPOTS → UPGRADE order", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    const banner = md.indexOf("[!WARNING]");
    const findings = md.indexOf("## Findings — flag-only");
    const blindSpots = md.indexOf("## What this snapshot did NOT check");
    const upgrade = md.indexOf("## Upgrade path");
    expect(banner).toBeGreaterThanOrEqual(0);
    expect(findings).toBeGreaterThan(banner);
    expect(blindSpots).toBeGreaterThan(findings);
    expect(upgrade).toBeGreaterThan(blindSpots);
  });

  it("renders all 3 findings as flag-only bullets", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(md).toContain("vocab-near-miss: hover");
    expect(md).toContain("doc-frame coverage gap");
    expect(md).toContain("remote-library refs");
  });

  it("renders evidence_path as inline code reference", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(md).toMatch(/\*Evidence:\* `ds_inventory\./);
  });

  it("renders all 3 blind-spot bullets", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(md).toContain("Findings classification status");
    expect(md).toContain("Vocab-collision analysis");
    expect(md).toContain("Validator status");
  });

  it("includes the upgrade-path body and copy-paste invocation", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(md).toContain("/scaffold-profile");
    expect(md).toMatch(/Run cdf-profile-scaffold/);
  });

  it("renders the metadata header with tier + token regime", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(md).toMatch(/tier `T2`.*token regime `figma-variables`/);
  });

  it("opens with the DS-name H1", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(md.split("\n")[0]).toBe("# testfix — Snapshot");
  });

  it("uses LF line endings (no CRLF)", () => {
    const md = renderSnapshot(loadProfile(), loadFindings());
    expect(md.includes("\r")).toBe(false);
  });

  it("two renders of the same input are byte-identical (deterministic)", () => {
    const a = renderSnapshot(loadProfile(), loadFindings());
    const b = renderSnapshot(loadProfile(), loadFindings());
    expect(a).toBe(b);
  });
});

describe("renderSnapshot — schema validation", () => {
  it("hard-fails on profile schema mismatch", () => {
    const bad = { ...loadProfile(), snapshot_version: "wrong-v0" } as SnapshotProfile;
    expect(() => renderSnapshot(bad, loadFindings())).toThrow(/profile schema/);
  });

  it("hard-fails on findings schema mismatch", () => {
    const bad = { ...loadFindings(), schema_version: "wrong-v0" } as SnapshotFindings;
    expect(() => renderSnapshot(loadProfile(), bad)).toThrow(/findings schema/);
  });

  it("hard-fails when findings exceeds the 15-cap", () => {
    const findings = loadFindings();
    const inflated: SnapshotFindings = {
      ...findings,
      findings: Array.from({ length: 16 }, (_, i) => ({
        topic: `t${i}`, observation: "x", evidence_path: "p",
      })),
    };
    expect(() => renderSnapshot(loadProfile(), inflated)).toThrow(/exceeds cap/);
  });

  it("hard-fails when 'findings' field is missing", () => {
    const bad = { ...loadFindings() } as Partial<SnapshotFindings> as SnapshotFindings;
    delete (bad as Record<string, unknown>).findings;
    expect(() => renderSnapshot(loadProfile(), bad)).toThrow(/findings/);
  });
});

describe("renderSnapshot — edge cases", () => {
  it("renders graceful empty-state copy when findings is empty", () => {
    const empty: SnapshotFindings = { ...loadFindings(), findings: [] };
    const md = renderSnapshot(loadProfile(), empty);
    expect(md).toContain("No findings surfaced");
    expect(md).toContain("DRAFT — UNCLASSIFIED");
    expect(md).toContain("## What this snapshot did NOT check");
    expect(md).toContain("## Upgrade path");
  });

  it("renders structured blind_spots (Rule-A tool_survey) with probe + result", () => {
    const profile: SnapshotProfile = {
      ...loadProfile(),
      blind_spots: [
        {
          claim: "Color tokens not enumerable",
          tool_survey: {
            probed: "browse_tokens(namespace=color)",
            result: "0 tokens returned",
            tools_not_probed: ["resolve_token", "compose_theme"],
          },
        },
      ],
    };
    const md = renderSnapshot(profile, loadFindings());
    expect(md).toContain("Color tokens not enumerable");
    expect(md).toContain("*Probe:* browse_tokens");
    expect(md).toContain("*Result:* 0 tokens");
    expect(md).toContain("*Tools not probed:* resolve_token, compose_theme");
  });

  it("warns to console when ds_name in findings differs from profile but renders profile value", () => {
    const profile = loadProfile();
    const findings = { ...loadFindings(), ds_name: "different-name" };
    const md = renderSnapshot(profile, findings);
    expect(md).toContain("# testfix — Snapshot"); // profile wins
  });

  it("flags missing blind_spots with a violation marker", () => {
    const profile: SnapshotProfile = { ...loadProfile(), blind_spots: [] };
    const md = renderSnapshot(profile, loadFindings());
    expect(md).toMatch(/violates the trust handshake|No blind-spots declared/);
  });

  it("collapses multiline observations to a single line per finding bullet", () => {
    const findings: SnapshotFindings = {
      ...loadFindings(),
      findings: [
        {
          topic: "wrap test",
          observation: "Line 1\n  Line 2 with indent\nLine 3",
          evidence_path: "p",
        },
      ],
    };
    const md = renderSnapshot(loadProfile(), findings);
    const bulletLine = md.split("\n").find((l) => l.startsWith("- **wrap test**"));
    expect(bulletLine).toBeDefined();
    expect(bulletLine).not.toContain("\n");
    expect(bulletLine).toContain("Line 1 Line 2 with indent Line 3");
  });
});
