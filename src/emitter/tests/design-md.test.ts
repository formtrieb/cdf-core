import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProfileFile } from "../../parser/profile-parser.js";
import { emitDesignMd } from "../design-md.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Synthetic, standalone fixture — NOT the private repo-root
// formtrieb.profile.yaml. This package is rsynced into the public
// formtrieb/cdf-core repo (scripts/sync-cdf-core.sh) where that file does
// not exist; unit tests must not depend on it. The real Profile's emit is
// covered separately by packages/cdf-core/scripts/emit-design-md.ts and the
// committed fixtures/generated/formtrieb.DESIGN.md artifact.
const FIXTURE_PROFILE = join(__dirname, "fixtures/emitter-test.profile.yaml");

const OMITTED_COMMENT = "<!-- section omitted: no token source supplied -->";

/** Slice out the `## Components` section body (up to the next `## ` heading or EOF). */
function extractComponentsSection(markdown: string): string {
  const heading = "## Components\n";
  const headingAt = markdown.indexOf(heading);
  if (headingAt === -1) {
    throw new Error("emitDesignMd output has no ## Components heading");
  }
  const start = headingAt + heading.length;
  const nextHeadingAt = markdown.indexOf("\n## ", start);
  return markdown.slice(start, nextHeadingAt === -1 ? markdown.length : nextHeadingAt);
}

/**
 * Split the `## Components` section body into its `###` subsections, in
 * document order. Scoping the round-trip count to a single subsection (not
 * the whole Components section) matters when two vocabularies deliberately
 * share a value — a whole-section count would over-count a value that
 * legitimately appears once per vocabulary.
 */
function extractComponentsSubsections(markdown: string): string[] {
  return extractComponentsSection(markdown)
    .split(/\n(?=### )/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Count exact, non-overlapping occurrences of a backtick-wrapped token. */
function countBacktickedValue(text: string, value: string): number {
  const needle = `\`${value}\``;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) break;
    count++;
    from = at + needle.length;
  }
  return count;
}

/**
 * Assert every vocabulary's values appear exactly once inside that
 * vocabulary's OWN `###` subsection of the Components section. Subsections
 * are emitted in `Object.entries(profile.vocabularies)` order (see
 * renderComponentsSection in design-md.ts), so we zip by index rather than
 * re-deriving the humanized heading text.
 */
function assertVocabRoundTrip(output: string, profile: ReturnType<typeof parseProfileFile>) {
  const subsections = extractComponentsSubsections(output);
  const vocabEntries = Object.entries(profile.vocabularies);
  expect(subsections.length).toBe(vocabEntries.length);

  vocabEntries.forEach(([vocabName, vocab], i) => {
    const subsection = subsections[i];
    for (const value of vocab.values) {
      const count = countBacktickedValue(subsection, value);
      expect(
        count,
        `vocabulary "${vocabName}" value "${value}" should appear exactly once in its own Components subsection, found ${count}`,
      ).toBe(1);
    }
  });
}

describe("emitDesignMd — Profile → DESIGN.md", () => {
  const profile = parseProfileFile(FIXTURE_PROFILE);
  const output = emitDesignMd(profile);

  it("starts with an h1 title matching the profile name", () => {
    expect(output.startsWith(`# ${profile.name}`)).toBe(true);
  });

  it("carries every vocabulary value into its own Components subsection exactly once, even across a cross-vocabulary duplicate value", () => {
    assertVocabRoundTrip(output, profile);
  });

  it("omits token-backed sections with the explanatory comment when no tokens are supplied", () => {
    const occurrences = output.split(OMITTED_COMMENT).length - 1;
    // Colors, Typography, Layout, Elevation & Depth, Shapes — 5 optional sections.
    expect(occurrences).toBe(5);
  });

  it("never emits a duplicate ## heading (the format's one hard-reject rule)", () => {
    const headings = output.match(/^## .+$/gm) ?? [];
    expect(new Set(headings).size).toBe(headings.length);
  });

  it("emits present headings in spec order (Overview, Components, Do's and Don'ts)", () => {
    const headings = (output.match(/^## (.+)$/gm) ?? []).map((h) => h.replace(/^## /, ""));
    expect(headings).toEqual(["Overview", "Components", "Do's and Don'ts"]);
  });
});

describe("emitDesignMd — opts.tokens supplies Colors/Typography/Layout/Shapes", () => {
  const profile = parseProfileFile(FIXTURE_PROFILE);
  const output = emitDesignMd(profile, {
    tokens: {
      "colors.primary": "#1A1C1E",
      "colors.secondary": "#6C7278",
      "typography.body-md.fontFamily": "Inter",
      "typography.body-md.fontSize": "16px",
      "spacing.md": "16px",
      "rounded.md": "8px",
    },
  });

  it("renders a Colors section backed by frontmatter instead of omitting it", () => {
    expect(output).toContain("## Colors");
    expect(output).toContain('primary: "#1A1C1E"');
  });

  it("emits the required name: key first in frontmatter, quoted", () => {
    const frontmatterMatch = output.match(/^---\n([\s\S]*?)\n---\n/);
    expect(frontmatterMatch, "output should start with a --- frontmatter block").not.toBeNull();
    const frontmatterBody = frontmatterMatch![1];
    expect(frontmatterBody.split("\n")[0]).toBe(`name: "${profile.name}"`);
  });

  it("still omits Elevation & Depth (no dedicated token group in the schema)", () => {
    const occurrences = output.split(OMITTED_COMMENT).length - 1;
    expect(occurrences).toBe(1);
  });

  it("keeps the vocabulary round-trip intact when tokens are also supplied", () => {
    assertVocabRoundTrip(output, profile);
  });
});

describe("emitDesignMd — colors frontmatter/heading gating stays in lockstep", () => {
  const profile = parseProfileFile(FIXTURE_PROFILE);
  const output = emitDesignMd(profile, {
    tokens: {
      "colors.secondary": "#6C7278",
    },
  });

  it("emits neither a colors: frontmatter block nor a ## Colors heading without a primary color", () => {
    expect(output).not.toContain("colors:");
    expect(output).not.toContain("## Colors");
  });

  it("emits the omission comment for Colors instead", () => {
    // Colors, Typography, Layout, Elevation & Depth, Shapes — all 5 omitted
    // since only colors.secondary (no primary) was supplied.
    const occurrences = output.split(OMITTED_COMMENT).length - 1;
    expect(occurrences).toBe(5);
  });
});

describe("emitDesignMd — interaction pattern notes render in Do's and Don'ts", () => {
  const profile = parseProfileFile(FIXTURE_PROFILE);
  const output = emitDesignMd(profile);

  it("renders the state-keyed note verbatim", () => {
    expect(output).toContain(
      "Fixture state-keyed note: this line must appear in the emitted Do's and Don'ts section.",
    );
  });

  it("keeps the existing Do/Don't pairs intact alongside the notes", () => {
    expect(output).toContain(
      "- Do: give every pressable component a distinct look for each of its states",
    );
    expect(output).toContain(
      "- Don't: leave a pressable component without a visual treatment for any of these states.",
    );
  });

  it("filters out non-state-keyed notes (internal maintainer commentary)", () => {
    expect(output).not.toContain("must NOT appear in the emitted Do's and Don'ts section");
    // The positive assertion above (state-keyed note) must stay green.
    expect(output).toContain(
      "Fixture state-keyed note: this line must appear in the emitted Do's and Don'ts section.",
    );
  });
});
