import { describe, it, expect } from "vitest";
import { applyComponentRename } from "../src/analyzer/vocab-divergence-apply.js";

describe("applyComponentRename — property-value rename", () => {
  it("rewrites a value inside properties.X.values[]", () => {
    const input = `name: Alert
category: Status
description: Status alert
properties:
  variant:
    type: hierarchy
    values: [brand, primery]
    description: emphasis
`;
    const result = applyComponentRename(input, {
      kind: "property-value",
      property: "variant",
      from: "primery",
      to: "primary",
    });
    // The value is updated.
    expect(result).toMatch(/values:\s*\[.*primary.*\]/);
    expect(result).not.toContain("primery");
    // Surrounding structure intact.
    expect(result).toContain("name: Alert");
    expect(result).toContain("type: hierarchy");
  });

  it("rewrites a value when values[] is a block-style list", () => {
    const input = `name: Alert
properties:
  variant:
    type: hierarchy
    values:
      - brand
      - primery
      - secondary
    description: emphasis
`;
    const result = applyComponentRename(input, {
      kind: "property-value",
      property: "variant",
      from: "primery",
      to: "primary",
    });
    expect(result).toContain("- primary");
    expect(result).not.toContain("primery");
    expect(result).toContain("- brand");
    expect(result).toContain("- secondary");
  });

  it("is a no-op when the target value is not present", () => {
    const input = `name: Alert
properties:
  variant:
    type: hierarchy
    values: [brand, secondary]
`;
    const result = applyComponentRename(input, {
      kind: "property-value",
      property: "variant",
      from: "primery",
      to: "primary",
    });
    // Unchanged (normalizing formatting via round-trip is acceptable; content should still match)
    expect(result).toContain("values: [ brand, secondary ]");
  });

  it("co-renames property.default when it matches the renamed value", () => {
    // Regression — smoke-test revealed that apply left default behind.
    // Given a property whose `default` equals the outlier, renaming the value
    // must also update the default; otherwise the spec ends up inconsistent
    // (default no longer in values[]) and silently invalid.
    const input = `name: Alert
properties:
  variant:
    type: hierarchy
    values: [brand, primery]
    default: primery
    description: emphasis
`;
    const result = applyComponentRename(input, {
      kind: "property-value",
      property: "variant",
      from: "primery",
      to: "primary",
    });
    expect(result).toMatch(/values:\s*\[.*primary.*\]/);
    expect(result).toMatch(/default:\s*primary/);
    expect(result).not.toContain("primery");
  });

  it("leaves default alone when it doesn't match the renamed value", () => {
    const input = `name: Alert
properties:
  variant:
    type: hierarchy
    values: [brand, primery]
    default: brand
`;
    const result = applyComponentRename(input, {
      kind: "property-value",
      property: "variant",
      from: "primery",
      to: "primary",
    });
    expect(result).toMatch(/default:\s*brand/);
  });
});

describe("applyComponentRename — state-key rename", () => {
  it("renames a state key in states.X", () => {
    const input = `name: MenuItem
category: Actions
description: Menu item
states:
  over:
    values: [on, off]
    description: hover indicator
  pressed:
    values: [on, off]
    description: pressed indicator
`;
    const result = applyComponentRename(input, {
      kind: "state-key",
      from: "over",
      to: "hover",
    });
    expect(result).toMatch(/\n  hover:/);
    expect(result).not.toMatch(/\n  over:/);
    // `pressed:` sibling is untouched
    expect(result).toMatch(/\n  pressed:/);
    // Block under the renamed key survives
    expect(result).toContain("hover indicator");
  });

  it("is a no-op when the state key is not present", () => {
    const input = `name: MenuItem
states:
  hover:
    values: [on, off]
`;
    const result = applyComponentRename(input, {
      kind: "state-key",
      from: "over",
      to: "hover",
    });
    expect(result).toContain("hover:");
  });
});

describe("applyComponentRename — comment preservation", () => {
  it("preserves inline and leading comments when renaming a property value", () => {
    const input = `name: Alert
# hand-authored note: this spec was drafted by the DS team
properties:
  variant:
    # Intent-derived values — keep in sync with status palette
    type: hierarchy
    values: [brand, primery, secondary]
`;
    const result = applyComponentRename(input, {
      kind: "property-value",
      property: "variant",
      from: "primery",
      to: "primary",
    });
    expect(result).toContain("# hand-authored note: this spec was drafted by the DS team");
    expect(result).toContain("# Intent-derived values — keep in sync with status palette");
  });

  it("preserves comments when renaming a state key", () => {
    const input = `name: MenuItem
# Component-level comment
states:
  # State axis comment
  over:
    values: [on, off]
`;
    const result = applyComponentRename(input, {
      kind: "state-key",
      from: "over",
      to: "hover",
    });
    expect(result).toContain("# Component-level comment");
    expect(result).toContain("# State axis comment");
  });
});
