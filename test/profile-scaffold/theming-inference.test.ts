import { describe, it, expect } from "vitest";
import { inferTheming } from "../../src/analyzer/profile-scaffold/theming-inference.js";

describe("inferTheming", () => {
  it("returns an empty theming block when no modes are provided", () => {
    const r = inferTheming([]);
    expect(r.modifiers).toEqual({});
  });

  it("maps each mode to a modifier with contexts", () => {
    const r = inferTheming([
      { collection: "Density", values: ["Compact", "Comfortable"] },
    ]);
    expect(r.modifiers.density).toBeDefined();
    expect(r.modifiers.density.contexts).toEqual(["Compact", "Comfortable"]);
  });

  it("aliases 'Theme' collection to canonical 'semantic' modifier name", () => {
    const r = inferTheming([
      { collection: "Theme", values: ["Light", "Dark"] },
    ]);
    expect(r.modifiers.semantic).toBeDefined();
    expect(r.modifiers.semantic.contexts).toEqual(["Light", "Dark"]);
    // Source-name provenance preserved in description
    expect(r.modifiers.semantic.description.toLowerCase()).toMatch(/theme/);
  });

  it("aliases 'Density' to 'density' (case-insensitive match)", () => {
    const r = inferTheming([
      { collection: "density", values: ["Compact", "Comfortable"] },
    ]);
    expect(r.modifiers.density).toBeDefined();
  });

  it("aliases 'Device' to 'device'", () => {
    const r = inferTheming([
      { collection: "Device", values: ["Desktop", "Tablet", "Mobile"] },
    ]);
    expect(r.modifiers.device).toBeDefined();
    expect(r.modifiers.device.contexts).toEqual(["Desktop", "Tablet", "Mobile"]);
  });

  it("aliases 'Shape' to 'shape'", () => {
    const r = inferTheming([
      { collection: "Shape", values: ["Round", "Sharp"] },
    ]);
    expect(r.modifiers.shape).toBeDefined();
  });

  it("passes unknown collection names through as lowercase modifier names", () => {
    const r = inferTheming([
      { collection: "Brand", values: ["Acme", "Partner"] },
    ]);
    expect(r.modifiers.brand).toBeDefined();
    expect(r.modifiers.brand.contexts).toEqual(["Acme", "Partner"]);
  });

  it("handles multiple modes in one call", () => {
    const r = inferTheming([
      { collection: "Theme", values: ["Light", "Dark"] },
      { collection: "Device", values: ["Desktop", "Mobile"] },
    ]);
    expect(Object.keys(r.modifiers).sort()).toEqual(["device", "semantic"]);
  });

  it("attaches a descriptive default-description mentioning inferred source", () => {
    const r = inferTheming([
      { collection: "MyAxis", values: ["a", "b"] },
    ]);
    expect(r.modifiers.myaxis.description).toMatch(/scaffold|inferred/i);
  });

  it("provides an empty set_mapping by default (scaffold cannot infer this)", () => {
    const r = inferTheming([
      { collection: "Theme", values: ["Light", "Dark"] },
    ]);
    expect(r.set_mapping).toEqual({});
  });
});
