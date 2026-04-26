import { describe, it, expect } from "vitest";
import { parseFigmaUrl } from "../src/parser/figma-url.js";

describe("parseFigmaUrl", () => {
  it("parses a canonical /design URL with a node-id", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/design/fekh7KslmBf1dl17QMUrZ6/MoPla?node-id=138-342"
    );
    expect(result.kind).toBe("design");
    expect(result.fileKey).toBe("fekh7KslmBf1dl17QMUrZ6");
    expect(result.nodeIdUrl).toBe("138-342");
    expect(result.nodeId).toBe("138:342");
    expect(result.branchKey).toBeUndefined();
  });

  it("accepts /file/ URLs", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/file/abc123/Foo?node-id=1-2"
    );
    expect(result.kind).toBe("file");
    expect(result.fileKey).toBe("abc123");
  });

  it("accepts /board/ URLs for FigJam files", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/board/xyz789/MyBoard"
    );
    expect(result.kind).toBe("board");
    expect(result.fileKey).toBe("xyz789");
    expect(result.nodeId).toBeUndefined();
  });

  it("parses branch URLs and exposes branchKey", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/design/abc123/branch/def456/Foo?node-id=5-6"
    );
    expect(result.fileKey).toBe("abc123");
    expect(result.branchKey).toBe("def456");
    expect(result.nodeId).toBe("5:6");
  });

  it("accepts both www.figma.com and figma.com hosts", () => {
    expect(() =>
      parseFigmaUrl("https://figma.com/design/abc123/Foo?node-id=1-2")
    ).not.toThrow();
  });

  it("returns nodeIdUrl in dash form and nodeId in colon form", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/design/abc/Foo?node-id=42-7"
    );
    expect(result.nodeIdUrl).toBe("42-7");
    expect(result.nodeId).toBe("42:7");
  });

  it("throws when URL is empty", () => {
    expect(() => parseFigmaUrl("")).toThrow("empty");
  });

  it("throws when host is not figma.com", () => {
    expect(() => parseFigmaUrl("https://example.com/design/abc/Foo")).toThrow(
      /figma\.com/
    );
  });

  it("throws when path does not match /design|/file|/board/<key>/…", () => {
    expect(() => parseFigmaUrl("https://www.figma.com/community/abc")).toThrow(
      /could not be parsed/
    );
  });
});
