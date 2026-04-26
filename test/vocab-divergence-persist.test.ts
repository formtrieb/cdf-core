import { describe, it, expect } from "vitest";
import { persistVocabDecision } from "../src/analyzer/vocab-divergence-persist.js";

describe("persistVocabDecision — append to Profile description", () => {
  it("appends a decision line to vocabularies.X.description", () => {
    const input = `name: Test
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: Test profile

vocabularies:
  hierarchy:
    description: |
      Visual emphasis levels.
    values: [brand, primary, secondary]
`;
    const result = persistVocabDecision(input, {
      concept: "vocabularies.hierarchy",
      date: "2026-04-18",
      canonical: "primary",
      outliers: ["primery"],
      renamedIn: ["Alert", "Toast"],
      evidence: "self 3/4, profile-declared",
    });

    // Existing description content is preserved
    expect(result).toContain("Visual emphasis levels.");
    // Decision line is appended with the expected markers
    expect(result).toContain("Decision 2026-04-18");
    expect(result).toContain("`primary`");
    expect(result).toContain("`primery`");
    expect(result).toContain("Alert");
    expect(result).toContain("Toast");
    // Still valid YAML (keep the vocab structure intact)
    expect(result).toMatch(/vocabularies:\s*\n\s*hierarchy:/);
    expect(result).toMatch(/values:\s*\[.*primary.*\]/);
  });

  it("appends to interaction_patterns.X.description", () => {
    const input = `name: Test
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: Test profile

interaction_patterns:
  pressable:
    description: Click targets.
    states: [default, hover, pressed, disabled]
    token_layer: Controls
    token_mapping: {}
`;
    const result = persistVocabDecision(input, {
      concept: "interaction_patterns.pressable.states",
      date: "2026-04-18",
      canonical: "hover",
      outliers: ["over"],
      renamedIn: ["MenuItem"],
      evidence: "profile-declared",
    });
    expect(result).toContain("Click targets.");
    expect(result).toContain("Decision 2026-04-18");
    expect(result).toContain("`hover`");
    expect(result).toContain("MenuItem");
    // Siblings preserved
    expect(result).toContain("states:");
    expect(result).toContain("token_layer:");
  });

  it("preserves other profile sections and comments", () => {
    const input = `name: Test
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: Test profile

# Curated vocabularies — do not edit casually
vocabularies:
  hierarchy:
    description: Visual emphasis.
    values: [brand, primary]

# Other things
token_grammar: {}
`;
    const result = persistVocabDecision(input, {
      concept: "vocabularies.hierarchy",
      date: "2026-04-18",
      canonical: "primary",
      outliers: ["primery"],
      renamedIn: ["A"],
      evidence: "self 1/1",
    });
    expect(result).toContain("# Curated vocabularies — do not edit casually");
    expect(result).toContain("# Other things");
    expect(result).toContain("token_grammar:");
  });

  it("is idempotent — re-applying the same decision does not duplicate the line", () => {
    const input = `name: Test
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: Test profile

vocabularies:
  hierarchy:
    description: Visual emphasis.
    values: [brand, primary]
`;
    const args = {
      concept: "vocabularies.hierarchy",
      date: "2026-04-18",
      canonical: "primary",
      outliers: ["primery"],
      renamedIn: ["A"],
      evidence: "self 1/1",
    } as const;
    const once = persistVocabDecision(input, args);
    const twice = persistVocabDecision(once, args);
    const occurrences = (twice.match(/Decision 2026-04-18.*primary.*primery/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
