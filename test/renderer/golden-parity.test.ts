/**
 * Renderer golden-fixture parity (bash ≡ TS).
 *
 * Runs both pipelines on the same fixtures and asserts byte-identity.
 * Plan §N1.3: 3 fixture pairs minimum.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as yamlParse } from "yaml";
import {
  renderFindingsMd,
  renderConformanceYaml,
  renderHousekeepingMd,
  renderShipBlockers,
} from "../../src/renderer/findings-renderer.js";
import { renderSnapshot } from "../../src/renderer/snapshot-renderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, "../../../..");
const FINDINGS_FIXTURES = join(__dirname, "fixtures/findings");
const SNAPSHOT_FIXTURES = join(__dirname, "fixtures/snapshot");
const FINDINGS_SCRIPT = join(MONOREPO_ROOT, "scripts/render-findings.sh");
const SNAPSHOT_SCRIPT = join(MONOREPO_ROOT, "scripts/render-snapshot.sh");

function runBash(script: string, args: string[]): void {
  execFileSync("bash", [script, ...args], {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 30_000,
  });
}

// Skip both suites when the monorepo's bash regression scripts are not
// reachable (e.g. when this package is consumed standalone). The TS
// renderers themselves are exercised by neighbouring `*.test.ts` files.
describe.skipIf(!existsSync(FINDINGS_SCRIPT))("findings-renderer parity (bash ≡ TS)", () => {
  const cases: Array<{ fixture: string }> = [
    { fixture: "fixture-A-mixed-decisions.findings.yaml" },
    { fixture: "fixture-B-z-inline.findings.yaml" },
    { fixture: "fixture-C-blockers-and-zsplit.findings.yaml" },
  ];

  for (const c of cases) {
    it(`${c.fixture} → findings.md byte-identical`, () => {
      const tmp = mkdtempSync(join(tmpdir(), `cdf-findings-`));
      try {
        const bashOut = join(tmp, "bash.md");
        runBash(FINDINGS_SCRIPT, [
          join(FINDINGS_FIXTURES, c.fixture),
          "--findings-md",
          bashOut,
        ]);
        const bash = readFileSync(bashOut, "utf8");
        const input = yamlParse(readFileSync(join(FINDINGS_FIXTURES, c.fixture), "utf8"));
        const ts = renderFindingsMd(input);
        expect(ts).toBe(bash);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it(`${c.fixture} → conformance.yaml byte-identical`, () => {
      const tmp = mkdtempSync(join(tmpdir(), `cdf-conformance-`));
      try {
        const bashOut = join(tmp, "bash.yaml");
        runBash(FINDINGS_SCRIPT, [
          join(FINDINGS_FIXTURES, c.fixture),
          "--conformance-yaml",
          bashOut,
        ]);
        const bash = readFileSync(bashOut, "utf8");
        const input = yamlParse(readFileSync(join(FINDINGS_FIXTURES, c.fixture), "utf8"));
        const ts = renderConformanceYaml(input);
        expect(ts).toBe(bash);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it(`${c.fixture} → ship-blockers byte-identical`, () => {
      const tmp = mkdtempSync(join(tmpdir(), `cdf-blockers-`));
      try {
        const bashOut = join(tmp, "bash.txt");
        runBash(FINDINGS_SCRIPT, [
          join(FINDINGS_FIXTURES, c.fixture),
          "--ship-blockers",
          bashOut,
        ]);
        const bash = readFileSync(bashOut, "utf8");
        const input = yamlParse(readFileSync(join(FINDINGS_FIXTURES, c.fixture), "utf8"));
        const ts = renderShipBlockers(input);
        expect(ts).toBe(bash);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }

  // Housekeeping: only fixture C exceeds threshold.
  it("fixture C → housekeeping.md byte-identical", () => {
    const tmp = mkdtempSync(join(tmpdir(), `cdf-housekeeping-`));
    try {
      const bashOut = join(tmp, "bash.md");
      runBash(FINDINGS_SCRIPT, [
        join(FINDINGS_FIXTURES, "fixture-C-blockers-and-zsplit.findings.yaml"),
        "--housekeeping-md",
        bashOut,
      ]);
      const bash = readFileSync(bashOut, "utf8");
      const input = yamlParse(
        readFileSync(join(FINDINGS_FIXTURES, "fixture-C-blockers-and-zsplit.findings.yaml"), "utf8"),
      );
      const ts = renderHousekeepingMd(input);
      expect(ts).toBe(bash);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!existsSync(SNAPSHOT_SCRIPT))("snapshot-renderer parity (bash ≡ TS)", () => {
  it("testfix snapshot → bash output byte-identical", () => {
    const tmp = mkdtempSync(join(tmpdir(), `cdf-snapshot-`));
    try {
      const profileSrc = join(SNAPSHOT_FIXTURES, "testfix.snapshot.profile.yaml");
      const findingsSrc = join(SNAPSHOT_FIXTURES, "testfix.snapshot.findings.yaml");
      copyFileSync(profileSrc, join(tmp, basename(profileSrc)));
      copyFileSync(findingsSrc, join(tmp, basename(findingsSrc)));

      runBash(SNAPSHOT_SCRIPT, [tmp]);

      const bash = readFileSync(join(tmp, "testfix.snapshot.findings.md"), "utf8");
      const profile = yamlParse(readFileSync(profileSrc, "utf8"));
      const findings = yamlParse(readFileSync(findingsSrc, "utf8"));
      const ts = renderSnapshot(profile, findings, { prefix: "testfix" });
      expect(ts).toBe(bash);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
