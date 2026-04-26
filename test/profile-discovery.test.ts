import { describe, it, expect } from "vitest";
import { findProfileFiles } from "../src/parser/profile-discovery.js";
import { join } from "node:path";

const FIXTURES = join(__dirname, "fixtures/profiles");

describe("findProfileFiles", () => {
  it("returns profile files matching *.profile.yaml", () => {
    const files = findProfileFiles([FIXTURES]);
    const basenames = files.map((f) => f.split("/").pop()).sort();
    expect(basenames).toContain("standalone.profile.yaml");
  });

  it("excludes files not matching *.profile.yaml", () => {
    const files = findProfileFiles([FIXTURES]);
    const basenames = files.map((f) => f.split("/").pop());
    expect(basenames).not.toContain("not-a-profile.yaml");
    expect(basenames).not.toContain("README.md");
  });

  it("returns empty array when no profile files exist in directory", () => {
    const files = findProfileFiles(["/tmp/definitely-does-not-exist-123"]);
    expect(files).toEqual([]);
  });

  it("searches multiple directories", () => {
    const files = findProfileFiles([FIXTURES, "/tmp/empty-for-test"]);
    expect(files.length).toBeGreaterThan(0);
  });
});
