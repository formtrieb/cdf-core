import type { CDFComponent, AnatomyOverride, TokenOverride } from "../types/cdf.js";

/**
 * Apply the 10-step inheritance resolution algorithm.
 * Returns a fully resolved component with parent fields merged with child overrides.
 *
 * See CDF-MCP-SPEC §3.4 for the full algorithm.
 */
export function resolveInheritance(
  child: CDFComponent,
  parent: CDFComponent
): CDFComponent {
  // Step 1-2: Deep-clone parent as base
  const base = structuredClone(parent);

  // Step 3: Apply properties_removed
  if (child.properties_removed && base.properties) {
    for (const name of child.properties_removed) {
      delete base.properties[name];
    }
  }

  // Step 4: Apply properties_added
  if (child.properties_added) {
    base.properties = base.properties ?? {};
    for (const [name, prop] of Object.entries(child.properties_added)) {
      base.properties[name] = prop;
    }
  }

  // Step 5: Apply properties_sealed
  if (child.properties_sealed) {
    base.properties_sealed = {
      ...base.properties_sealed,
      ...child.properties_sealed,
    };
    // Remove sealed properties from the public API
    if (base.properties) {
      for (const name of Object.keys(child.properties_sealed)) {
        delete base.properties[name];
      }
    }
  }

  // Step 6: Apply anatomy_overrides
  if (child.anatomy_overrides && base.anatomy) {
    for (const [name, override] of Object.entries(child.anatomy_overrides)) {
      if (override.removed) {
        delete base.anatomy[name];
        continue;
      }

      // Determine target key — renamed or original
      const targetKey = override.renamed ?? name;
      if (override.renamed && base.anatomy[name]) {
        // Move entry to new key, delete old
        base.anatomy[targetKey] = base.anatomy[name];
        delete base.anatomy[name];
      }

      if (base.anatomy[targetKey]) {
        // Merge override fields into the (possibly renamed) part
        if (override.conditional === null) {
          delete base.anatomy[targetKey].conditional;
        } else if (override.conditional !== undefined) {
          base.anatomy[targetKey].conditional = override.conditional;
        }
        if (override.description !== undefined) {
          base.anatomy[targetKey].description = override.description;
        }
        if (override.element !== undefined) {
          base.anatomy[targetKey].element = override.element;
        }
        if (override.component !== undefined) {
          base.anatomy[targetKey].component = override.component;
        }
        if (override.locked !== undefined) {
          base.anatomy[targetKey].locked = override.locked;
        }
      }
    }
  }

  // Step 7: Apply tokens_overrides
  if (child.tokens_overrides && base.tokens) {
    for (const [partName, override] of Object.entries(child.tokens_overrides)) {
      if (override === null || override.removed) {
        delete base.tokens[partName];
        continue;
      }
      if (!base.tokens[partName]) {
        base.tokens[partName] = {};
      }
      for (const [key, value] of Object.entries(override)) {
        if (key === "removed") continue;
        if (value === null) {
          delete base.tokens[partName][key];
        } else {
          base.tokens[partName][key] = value as string | Record<string, string>;
        }
      }
    }
  }

  // Step 8: Apply accessibility_overrides
  if (child.accessibility_overrides && base.accessibility) {
    const a = base.accessibility;
    const o = child.accessibility_overrides;
    if (o.element !== undefined) a.element = o.element;
    if (o["focus-visible"] !== undefined) a["focus-visible"] = o["focus-visible"];
    if (o.keyboard !== undefined) a.keyboard = o.keyboard;
    if (o.aria !== undefined) a.aria = o.aria;
    if (o.roles !== undefined) a.roles = o.roles;
    if (o["min-target-size"] !== undefined) a["min-target-size"] = o["min-target-size"];
    if (o.contrast !== undefined) a.contrast = o.contrast;
    if (o.motion !== undefined) a.motion = o.motion;
  }

  // Step 9: For other sections — child wins (full replacement)
  if (child.events !== undefined) base.events = child.events;
  if (child.behavior !== undefined) base.behavior = child.behavior;
  if (child.slots !== undefined) base.slots = child.slots;
  if (child.derived !== undefined) base.derived = child.derived;
  if (child.css !== undefined) base.css = child.css;
  if (child.figma !== undefined) base.figma = child.figma;
  if (child.references !== undefined) base.references = child.references;

  // Step 10: Identity fields always come from child
  base.name = child.name;
  base.category = child.category;
  base.description = child.description;
  if (child.composition_strategy !== undefined) base.composition_strategy = child.composition_strategy;

  // Clean up inheritance markers
  delete base.inherits;
  delete base.properties_removed;
  delete base.properties_added;
  delete base.anatomy_overrides;
  delete base.tokens_overrides;
  delete base.accessibility_overrides;

  return base;
}

/**
 * Apply the extends resolution.
 * The child IS the result — parent exists as a nested instance in the child's anatomy.
 * Returns the child as-is with a resolved parent reference.
 */
export function resolveExtension(
  child: CDFComponent,
  parent: CDFComponent
): CDFComponent & { _resolved_parent: CDFComponent } {
  return {
    ...child,
    _resolved_parent: parent,
  };
}
