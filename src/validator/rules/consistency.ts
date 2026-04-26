import type { CDFComponent, FigmaSubComponent, Issue } from "../../types/cdf.js";
import type { ValidationContext } from "../index.js";
import { safeEntries, safeKeys } from "./safe-utils.js";

/**
 * Consistency validation rules — warning severity.
 * Full implementation of CDF-MCP-SPEC §3.1 consistency rules table.
 */
export function checkConsistency(component: CDFComponent, context?: ValidationContext): Issue[] {
  const issues: Issue[] = [];
  const knownComponents = context?.components
    ? new Set(context.components.keys())
    : undefined;

  // ── component-ref-exists ──────────────────────────────────────────────────
  // Check that all referenced components have existing specs
  if (knownComponents && knownComponents.size > 0) {
    const checkRef = (ref: string, path: string) => {
      // Normalize: strip .spec.yaml suffix, remove hyphens, compare lowercase
      // This handles both PascalCase names ("InputGroup" → "inputgroup")
      // and kebab-case filenames ("input-group.spec.yaml" → "inputgroup")
      const name = ref.replace(/\.spec\.yaml$/, "").replace(/-/g, "").toLowerCase();
      if (!knownComponents.has(name)) {
        issues.push({
          severity: "error",
          path,
          message: `References component '${ref}' but no spec exists for it. Create the dependency first.`,
          rule: "component-ref-exists",
        });
      }
    };

    // extends
    if (component.extends) {
      checkRef(component.extends, "extends");
    }

    // inherits
    if (component.inherits) {
      checkRef(component.inherits, "inherits");
    }

    // anatomy.*.component
    if (component.anatomy) {
      for (const [partName, part] of Object.entries(component.anatomy)) {
        if (part.component) {
          checkRef(part.component, `anatomy.${partName}.component`);
        }
      }
    }

    // slots.*.accepts (PascalCase names only, skip "text" and "any")
    if (component.slots) {
      for (const [slotName, slot] of Object.entries(component.slots)) {
        if (slot.accepts) {
          const acceptsList = Array.isArray(slot.accepts) ? slot.accepts : [slot.accepts];
          for (const accepts of acceptsList) {
            if (accepts !== "text" && accepts !== "any" && /^[A-Z]/.test(accepts)) {
              checkRef(accepts, `slots.${slotName}.accepts`);
            }
          }
        }
      }
    }
  }

  // ── constraint-values-exist ─────────────────────────────────────────────────
  if (component.properties) {
    for (const [name, prop] of Object.entries(component.properties)) {
      if (!prop.constraints) continue;
      for (const constraint of prop.constraints) {
        if (!constraint.requires || typeof constraint.requires !== "object" || Array.isArray(constraint.requires)) continue;
        for (const [refProp, refValues] of Object.entries(constraint.requires)) {
          const target = component.properties[refProp];
          if (!target) {
            issues.push({ severity: "warning", path: `properties.${name}.constraints`, message: `Constraint references property '${refProp}' which does not exist.`, rule: "constraint-values-exist" });
            continue;
          }
          if (!target.values) continue;
          const requiredValues = Array.isArray(refValues) ? refValues : [refValues];
          for (const val of requiredValues) {
            if (!target.values.includes(String(val))) {
              issues.push({ severity: "warning", path: `properties.${name}.constraints`, message: `Constraint references value '${val}' but property '${refProp}' does not include it in its values.`, rule: "constraint-values-exist" });
            }
          }
        }
      }
    }
  }

  // ── figma-variant-count ─────────────────────────────────────────────────────
  if (component.figma?.total_variants && component.figma.variant_properties) {
    const calculated = calculateVariantCount(component.figma.variant_properties, component.figma.excluded_combinations);
    if (calculated !== null && calculated !== component.figma.total_variants) {
      issues.push({
        severity: "warning",
        path: "figma.total_variants",
        message: `Declared ${component.figma.total_variants} variants but calculated ${calculated} from variant properties.`,
        rule: "figma-variant-count",
      });
    }
  }

  // ── figma-excluded-valid ────────────────────────────────────────────────────
  // Skip for inheriting components — parent variant properties aren't available
  if (component.figma?.excluded_combinations && component.figma.variant_properties && !component.inherits) {
    for (const combo of component.figma.excluded_combinations) {
      for (const [prop, values] of Object.entries(combo)) {
        const variantValues = component.figma.variant_properties[prop];
        if (!variantValues) {
          issues.push({ severity: "warning", path: "figma.excluded_combinations", message: `Excluded combination references '${prop}' which is not a variant property.`, rule: "figma-excluded-valid" });
          continue;
        }
        if (variantValues === null) continue;
        const excludedValues = Array.isArray(values) ? values : [values];
        const variantStrings = variantValues.map(String);
        for (const val of excludedValues) {
          if (!variantStrings.includes(String(val))) {
            issues.push({ severity: "warning", path: "figma.excluded_combinations", message: `Excluded combination value '${val}' is not a valid value for variant property '${prop}'.`, rule: "figma-excluded-valid" });
          }
        }
      }
    }
  }

  // ── accessibility-keyboard-empty ────────────────────────────────────────────
  if (component.states && safeKeys(component.states).length > 0) {
    const stateEntries = safeEntries<NonNullable<CDFComponent["states"]>[string]>(component.states, "states", issues);
    const hasInteraction = stateEntries.some(
      ([, s]) => s.values?.some((v: string) => ["hover", "pressed", "focused"].includes(v))
    );
    if (hasInteraction && component.accessibility && Object.keys(component.accessibility.keyboard ?? {}).length === 0) {
      issues.push({ severity: "warning", path: "accessibility.keyboard", message: "Interactive component has states with interaction values but keyboard section is empty.", rule: "accessibility-keyboard-empty" });
    }
  }

  // ── accessibility-element-mismatch ──────────────────────────────────────────
  if (component.accessibility?.element === "button" && component.anatomy?.container) {
    const containerElement = component.anatomy.container.element;
    if (containerElement && containerElement !== "box" && containerElement !== "button") {
      issues.push({ severity: "warning", path: "accessibility.element", message: `Accessibility element is 'button' but anatomy container element is '${containerElement}', expected 'box' or 'button'.`, rule: "accessibility-element-mismatch" });
    }
  }

  // ── orphan-derived ──────────────────────────────────────────────────────────
  if (component.derived && component.anatomy) {
    for (const [derivedName, derived] of safeEntries<NonNullable<CDFComponent["derived"]>[string]>(component.derived, "derived", issues)) {
      let referenced = false;

      // Check if referenced by any anatomy locked field via "{derivedName}"
      for (const part of Object.values(component.anatomy)) {
        if (!part.locked) continue;
        for (const lockedValue of Object.values(part.locked)) {
          if (typeof lockedValue === "string" && lockedValue === `{${derivedName}}`) {
            referenced = true;
            break;
          }
        }
        if (referenced) break;
      }

      // Also check consumed_by as a reference indicator
      if (!referenced && derived.consumed_by && derived.consumed_by.length > 0) {
        referenced = true;
      }

      // Check if referenced in token mappings
      if (!referenced && component.tokens) {
        for (const mapping of Object.values(component.tokens)) {
          for (const tokenValue of Object.values(mapping ?? {})) {
            if (typeof tokenValue === "string" && tokenValue.includes(`{${derivedName}}`)) {
              referenced = true;
              break;
            }
          }
          if (referenced) break;
        }
      }

      // Check anatomy.*.bindings values — per §11.4.5, bindings values name
      // entries in the parent's derived block. An orphan scan that ignores
      // bindings produces false positives for any derived consumed exclusively
      // through a nested-component binding.
      if (!referenced) {
        for (const part of Object.values(component.anatomy)) {
          if (!part.bindings) continue;
          for (const bindingVal of Object.values(part.bindings)) {
            if (bindingVal === derivedName) {
              referenced = true;
              break;
            }
          }
          if (referenced) break;
        }
      }

      if (!referenced) {
        issues.push({ severity: "warning", path: `derived.${derivedName}`, message: `Derived value '${derivedName}' is not referenced by any anatomy locked field, token mapping, or binding.`, rule: "orphan-derived" });
      }
    }
  }

  // ── duplicate-locked-and-derived ────────────────────────────────────────────
  if (component.derived && component.anatomy) {
    for (const [partName, part] of Object.entries(component.anatomy)) {
      if (!part.locked) continue;
      for (const [lockedKey, lockedValue] of Object.entries(part.locked)) {
        // Check if the inline locked map duplicates a derived value's mapping
        if (typeof lockedValue === "object" && lockedValue !== null) {
          for (const [derivedName, derived] of safeEntries<NonNullable<CDFComponent["derived"]>[string]>(component.derived, "derived", issues)) {
            if (derived.from === lockedKey && derived.mapping) {
              // Same property, same mapping structure — likely a duplicate
              const mappingMatch = Object.entries(derived.mapping).every(
                ([k, v]) => (lockedValue as Record<string, unknown>)[k] === v
              );
              if (mappingMatch && Object.keys(derived.mapping).length === Object.keys(lockedValue as object).length) {
                issues.push({
                  severity: "warning",
                  path: `anatomy.${partName}.locked.${lockedKey}`,
                  message: `Inline locked map duplicates derived value '${derivedName}'. Use '{${derivedName}}' instead.`,
                  rule: "duplicate-locked-and-derived",
                });
              }
            }
          }
        }
      }
    }
  }

  // ── events-for-non-interactive ──────────────────────────────────────────────
  if (component.events && typeof component.events === "object" && safeKeys(component.events).length > 0) {
    if (!component.states || safeKeys(component.states).length === 0) {
      issues.push({ severity: "warning", path: "events", message: "Events section is non-empty but states section is empty. Non-interactive components usually don't emit events.", rule: "events-for-non-interactive" });
    }
  }

  // ── interaction-audit-required ──────────────────────────────────────────────
  // If figma.sub_components has entries, each must have interaction_audit.
  if (component.figma?.sub_components && component.figma.sub_components.length > 0) {
    for (let i = 0; i < component.figma.sub_components.length; i++) {
      const sub = component.figma.sub_components[i] as FigmaSubComponent;
      if (!sub.interaction_audit) {
        issues.push({
          severity: "error",
          path: `figma.sub_components[${i}]`,
          message: `Sub-component '${sub.name}' is missing interaction_audit. Run the Figma interaction audit script (scripts/audit-sub-interactions.js) to classify all sub-components.`,
          rule: "interaction-audit-required",
        });
      }
    }
  }

  // ── interaction-audit-impact ───────────────────────────────────────────────
  // If classification is "interactive", cdf_impact must have at least one
  // non-empty field or a note.
  if (component.figma?.sub_components) {
    for (let i = 0; i < component.figma.sub_components.length; i++) {
      const sub = component.figma.sub_components[i] as FigmaSubComponent;
      const audit = sub.interaction_audit;
      if (!audit || audit.classification !== "interactive") continue;

      const impact = audit.cdf_impact;
      if (!impact) {
        issues.push({
          severity: "error",
          path: `figma.sub_components[${i}].interaction_audit`,
          message: `Sub-component '${sub.name}' is classified as interactive but has no cdf_impact block. Document the consequences (element changes, ARIA attributes, anatomy additions, behavior).`,
          rule: "interaction-audit-impact",
        });
        continue;
      }

      const hasContent =
        (impact.element_change != null && impact.element_change !== "") ||
        (impact.aria_additions && impact.aria_additions.length > 0) ||
        (impact.anatomy_additions && impact.anatomy_additions.length > 0) ||
        (impact.behavior_additions && impact.behavior_additions.length > 0) ||
        (impact.note != null && impact.note !== "");

      if (!hasContent) {
        issues.push({
          severity: "error",
          path: `figma.sub_components[${i}].interaction_audit.cdf_impact`,
          message: `Sub-component '${sub.name}' is interactive but cdf_impact is empty. You cannot acknowledge interactivity and do nothing about it — add element changes, ARIA attributes, anatomy additions, behavior, or a note explaining why no changes are needed.`,
          rule: "interaction-audit-impact",
        });
      }
    }
  }

  // ── interaction-audit-anatomy-match ────────────────────────────────────────
  // Each anatomy_additions entry must exist in the spec's anatomy section.
  if (component.figma?.sub_components && component.anatomy) {
    const anatomyNames = new Set(Object.keys(component.anatomy));
    for (let i = 0; i < component.figma.sub_components.length; i++) {
      const sub = component.figma.sub_components[i] as FigmaSubComponent;
      const additions = sub.interaction_audit?.cdf_impact?.anatomy_additions;
      if (!additions) continue;
      for (const addition of additions) {
        // anatomy_additions may contain notes like "PopoverMenu (overlay target)"
        // — extract the first word as the anatomy part name
        const partName = addition.split(/\s/)[0];
        if (!anatomyNames.has(partName)) {
          issues.push({
            severity: "error",
            path: `figma.sub_components[${i}].interaction_audit.cdf_impact.anatomy_additions`,
            message: `Interaction audit for '${sub.name}' requires anatomy part '${partName}' but it does not exist in the anatomy section. Add it.`,
            rule: "interaction-audit-anatomy-match",
          });
        }
      }
    }
  }

  // ── interaction-audit-aria-match ───────────────────────────────────────────
  // Each aria_additions entry should appear somewhere in the accessibility.aria
  // section. Warning only — the exact phrasing may differ.
  if (component.figma?.sub_components && component.accessibility?.aria) {
    const ariaText = component.accessibility.aria.join(" ").toLowerCase();
    for (let i = 0; i < component.figma.sub_components.length; i++) {
      const sub = component.figma.sub_components[i] as FigmaSubComponent;
      const additions = sub.interaction_audit?.cdf_impact?.aria_additions;
      if (!additions) continue;
      for (const ariaAttr of additions) {
        // Extract the base attribute name (e.g. "aria-expanded" from "aria-expanded=true")
        const baseName = ariaAttr.split(/[=\s]/)[0].toLowerCase();
        if (!ariaText.includes(baseName)) {
          issues.push({
            severity: "warning",
            path: `figma.sub_components[${i}].interaction_audit.cdf_impact.aria_additions`,
            message: `Interaction audit for '${sub.name}' suggests '${baseName}' but it does not appear in accessibility.aria. Consider adding it.`,
            rule: "interaction-audit-aria-match",
          });
        }
      }
    }
  }

  // ── overlay-companion-exists ───────────────────────────────────────────────
  // If a trigger opens a component, it should exist as a spec.
  if (component.figma?.sub_components && knownComponents && knownComponents.size > 0) {
    for (let i = 0; i < component.figma.sub_components.length; i++) {
      const sub = component.figma.sub_components[i] as FigmaSubComponent;
      const triggers = sub.interaction_audit?.triggers;
      if (!triggers) continue;
      for (const trigger of triggers) {
        if (trigger.opens) {
          const name = trigger.opens.toLowerCase();
          if (!knownComponents.has(name)) {
            issues.push({
              severity: "warning",
              path: `figma.sub_components[${i}].interaction_audit.triggers`,
              message: `Overlay target '${trigger.opens}' does not have an existing CDF spec. Consider creating it or marking as external dependency.`,
              rule: "overlay-companion-exists",
            });
          }
        }
      }
    }
  }

  // ── behavior-references-anatomy ─────────────────────────────────────────────
  if (component.behavior && component.anatomy) {
    const anatomyNames = new Set(Object.keys(component.anatomy));
    for (const [name, beh] of Object.entries(component.behavior)) {
      if (beh.states) {
        for (const stateMap of Object.values(beh.states)) {
          for (const partName of Object.keys(stateMap)) {
            if (!anatomyNames.has(partName)) {
              issues.push({ severity: "warning", path: `behavior.${name}.states`, message: `Behavior references anatomy part '${partName}' which does not exist.`, rule: "behavior-references-anatomy" });
            }
          }
        }
      }
    }
  }

  // ── no-raw-unitless-tokens (CDF-CON-008) ────────────────────────────────────
  // Unitless raw numbers (opacity, line-height, multipliers) bypass token
  // discipline and invite runtime-math patterns the format rejects (§1.1 #2).
  // Raw dimensional-with-unit is still permitted (§13.6 rule 4).
  if (component.tokens) {
    const UNITLESS_NUMERIC = /^-?\d+(\.\d+)?$/;
    const walk = (node: unknown, path: string): void => {
      if (node === null || node === undefined) return;
      if (typeof node === "number") {
        issues.push({
          severity: "warning",
          path,
          message: `Unitless raw numeric value (${node}) is not permitted in tokens. Declare it as a token, or — if it is a structural dimension — quote it with an explicit unit suffix (e.g. "${node}px"). See CDF-CON-008 / §13.6 rule 4.`,
          rule: "no-raw-unitless-tokens",
        });
        return;
      }
      if (typeof node === "string") {
        if (UNITLESS_NUMERIC.test(node)) {
          issues.push({
            severity: "warning",
            path,
            message: `Unitless raw numeric value ("${node}") is not permitted in tokens. Declare it as a token, or — if it is a structural dimension — add an explicit unit suffix (e.g. "${node}px"). See CDF-CON-008 / §13.6 rule 4.`,
            rule: "no-raw-unitless-tokens",
          });
        }
        return;
      }
      if (typeof node === "object") {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          walk(value, `${path}.${key}`);
        }
      }
    };
    for (const [partName, partTokens] of Object.entries(component.tokens)) {
      walk(partTokens, `tokens.${partName}`);
    }
  }

  return issues;
}

/**
 * Calculate total variant count from variant properties minus excluded combinations.
 */
function calculateVariantCount(
  variantProps: Record<string, string[] | null>,
  excluded?: Record<string, unknown>[]
): number | null {
  const axes = Object.values(variantProps).filter((v): v is string[] => v !== null);
  if (axes.length === 0) return null;

  const total = axes.reduce((acc, values) => acc * values.length, 1);

  if (!excluded || excluded.length === 0) return total;

  // With exclusions present, exact calculation requires expanding the full matrix.
  // Return null — the check becomes advisory.
  return null;
}
