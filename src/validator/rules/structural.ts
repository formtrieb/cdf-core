import type { CDFComponent, Issue, Property, State } from "../../types/cdf.js";
import type { ValidationContext } from "../index.js";
import { safeEntries, safeKeys } from "./safe-utils.js";

/**
 * Structural validation rules — error severity.
 * Full implementation of CDF-MCP-SPEC §3.1 structural rules table.
 */
export function checkStructural(component: CDFComponent, context?: ValidationContext): Issue[] {
  const issues: Issue[] = [];

  // ── required-fields ─────────────────────────────────────────────────────────
  if (!component.name) {
    issues.push({ severity: "error", path: "name", message: "Required field 'name' is missing.", rule: "required-fields" });
  }
  if (!component.category) {
    issues.push({ severity: "error", path: "category", message: "Required field 'category' is missing.", rule: "required-fields" });
  }
  if (!component.description) {
    issues.push({ severity: "error", path: "description", message: "Required field 'description' is missing.", rule: "required-fields" });
  }
  // anatomy: required unless component uses inherits (anatomy_overrides modify parent's anatomy)
  if (!component.anatomy && !component.inherits) {
    issues.push({ severity: "error", path: "anatomy", message: "Required field 'anatomy' is missing.", rule: "required-fields" });
  }
  // tokens: required unless component uses inherits (tokens_overrides modify parent's tokens)
  if (!component.tokens && !component.inherits) {
    issues.push({ severity: "error", path: "tokens", message: "Required field 'tokens' is missing.", rule: "required-fields" });
  }
  // accessibility: required unless component uses inherits (accessibility_overrides modify parent's)
  if (!component.accessibility && !component.inherits) {
    issues.push({ severity: "error", path: "accessibility", message: "Required field 'accessibility' is missing.", rule: "required-fields" });
  }

  // ── name-format ─────────────────────────────────────────────────────────────
  if (component.name && !/^[A-Z][a-zA-Z0-9]*$/.test(component.name)) {
    issues.push({ severity: "error", path: "name", message: `Name '${component.name}' must be PascalCase.`, rule: "name-format" });
  }

  // ── Property validation (applies to both properties and properties_added) ──
  const allProperties: [string, Record<string, import("../../types/cdf.js").Property>][] = [];
  if (component.properties) allProperties.push(["properties", component.properties]);
  if (component.properties_added) allProperties.push(["properties_added", component.properties_added]);

  for (const [section, props] of allProperties) {
    for (const [name, prop] of safeEntries<import("../../types/cdf.js").Property>(props, section, issues)) {
      const path = `${section}.${name}`;

      // property-type-valid
      // Per CDF Component §7.2: type: may be a core type (enum/boolean/string/
      // IconName/number), a PascalCase custom type, or a Profile vocabulary key
      // (shorthand for `type: enum` + `values: <vocab.values>`).
      const validTypes = ["enum", "boolean", "string", "number", "IconName"];
      const profileVocabs = context?.profile?.vocabularies;
      const isVocabShorthand =
        !!prop.type && !!profileVocabs && Object.prototype.hasOwnProperty.call(profileVocabs, prop.type);

      if (prop.type && !validTypes.includes(prop.type) && !/^[A-Z]/.test(prop.type) && !isVocabShorthand) {
        let message = `Type '${prop.type}' is not a recognized type. Must be enum, boolean, string, number, IconName, a PascalCase custom type, or a Profile vocabulary key.`;
        if (!profileVocabs) {
          message += " (No Profile loaded — if this is intended as a vocabulary shorthand, ensure the Profile is available during validation.)";
        } else {
          const available = Object.keys(profileVocabs).sort();
          if (available.length > 0) {
            message += ` Available vocabularies: ${available.join(", ")}.`;
          }
        }
        issues.push({ severity: "error", path: `${path}.type`, message, rule: "property-type-valid" });
      }

      // enum-has-values — only applies to explicit `type: enum`. Vocab-shorthand
      // gets its values from the Profile's vocabulary entry, so the check is
      // not meaningful there (the Profile-side validator guarantees the vocab
      // has values).
      if (prop.type === "enum" && (!prop.values || prop.values.length < 2)) {
        issues.push({ severity: "error", path: `${path}.values`, message: "Enum property must have 'values' array with at least 2 entries.", rule: "enum-has-values" });
      }

      // default-in-values — applies to explicit enum AND to vocab-shorthand
      // (default must be one of the resolved values in either case).
      const effectiveValues = prop.values ?? (isVocabShorthand && prop.type ? profileVocabs![prop.type].values : undefined);
      const isEnumOrVocab = prop.type === "enum" || isVocabShorthand;
      if (isEnumOrVocab && prop.default != null && effectiveValues) {
        if (!effectiveValues.includes(String(prop.default))) {
          issues.push({ severity: "error", path: `${path}.default`, message: `Default '${prop.default}' is not one of the allowed values [${effectiveValues.join(", ")}].`, rule: "default-in-values" });
        }
      }

      // required-xor-default
      if (!prop.required && prop.default == null && !prop.optional) {
        issues.push({ severity: "error", path, message: "Property must have 'required: true', a 'default' value, or 'optional: true'.", rule: "required-xor-default" });
      }
      if (prop.required && prop.default != null) {
        issues.push({ severity: "error", path, message: "Property cannot have both 'required: true' and a 'default' value.", rule: "required-xor-default" });
      }
    }
  }

  // ── mutual-exclusion-symmetric ──────────────────────────────────────────────
  if (component.properties) {
    for (const [name, prop] of safeEntries<import("../../types/cdf.js").Property>(component.properties, "properties", issues)) {
      if (prop.mutual_exclusion) {
        const other = component.properties[prop.mutual_exclusion];
        if (!other) {
          issues.push({ severity: "error", path: `properties.${name}.mutual_exclusion`, message: `References '${prop.mutual_exclusion}' which does not exist in properties.`, rule: "mutual-exclusion-symmetric" });
        } else if (other.mutual_exclusion !== name) {
          issues.push({ severity: "error", path: `properties.${name}.mutual_exclusion`, message: `'${name}' declares mutual_exclusion with '${prop.mutual_exclusion}', but '${prop.mutual_exclusion}' does not declare mutual_exclusion with '${name}'.`, rule: "mutual-exclusion-symmetric" });
        }
      }
    }
  }

  // ── anatomy-has-element-or-component ────────────────────────────────────────
  if (component.anatomy) {
    for (const [name, part] of Object.entries(component.anatomy)) {
      if (!part.element && !part.component) {
        issues.push({ severity: "error", path: `anatomy.${name}`, message: "Anatomy part must have exactly one of 'element' or 'component'.", rule: "anatomy-has-element-or-component" });
      }
      if (part.element && part.component) {
        issues.push({ severity: "error", path: `anatomy.${name}`, message: "Anatomy part must have exactly one of 'element' or 'component', not both.", rule: "anatomy-has-element-or-component" });
      }
    }
  }

  // ── state-has-values ────────────────────────────────────────────────────────
  if (component.states) {
    for (const [name, state] of safeEntries<NonNullable<CDFComponent["states"]>[string]>(component.states, "states", issues)) {
      if (!state.values || state.values.length < 2) {
        issues.push({ severity: "error", path: `states.${name}.values`, message: "State must have 'values' array with at least 2 entries.", rule: "state-has-values" });
      }
    }
  }

  // ── state-has-token-expandable (CDF-STR-004) ────────────────────────────────
  // Spec (CDF-COMPONENT-SPEC §8, appendix §2603): every state axis MUST
  // declare `token_expandable`. Carve-out: when the resolved Profile has no
  // token grammars (Headless DS — Radix, Reach UI, Material Web Headless),
  // the answer is always `false` and the declaration is ceremony. Default
  // to `false` and skip the required-check for that case (F-Radix-6).
  if (component.states && !component.inherits) {
    const grammars = context?.profile?.token_grammar ?? {};
    const headlessProfile = Object.keys(grammars).length === 0;
    for (const [name, state] of safeEntries<NonNullable<CDFComponent["states"]>[string]>(component.states, "states", issues)) {
      if (state.token_expandable === undefined) {
        if (headlessProfile) {
          state.token_expandable = false;
          continue;
        }
        issues.push({
          severity: "error",
          path: `states.${name}.token_expandable`,
          message: "State axis must declare 'token_expandable' (true if the axis contributes a segment to token paths, false otherwise). See CDF-COMPONENT-SPEC §8.2.",
          rule: "state-has-token-expandable",
        });
      }
    }
  }

  // ── token-placeholder-valid (CDF-SEM-002) ───────────────────────────────────
  // For components using extends/inherits, placeholders from parent props/states
  // can't be validated without resolving the parent first — skip.
  // Per §13.1, a placeholder `{foo}` is valid if it names a property,
  // a state axis, a derived value, or a Profile grammar-slot axis.
  if (component.tokens && !component.extends && !component.inherits) {
    const propertyNames = new Set(Object.keys(component.properties ?? {}));
    const stateNames = new Set(Object.keys(component.states ?? {}));
    const derivedNames = new Set(Object.keys(component.derived ?? {}));
    // Grammar-slot axis names are collected from every grammar's `axes` keys —
    // a placeholder like `{state}` matches if ANY grammar declares a `state`
    // axis. This is pragmatic (we don't yet parse which grammar owns a path)
    // and aligned with §13.1 rule 3 + Profile §6.12 — the slot is identified
    // by name, the precedence rule picks the winning axis at resolve time.
    const grammarSlotNames = collectGrammarSlotNames(context);
    const profileAvailable = !!context?.profile;

    for (const [partName, mapping] of safeEntries<Record<string, unknown>>(component.tokens, "tokens", issues)) {
      for (const [tokenKey, tokenValue] of safeEntries(mapping, `tokens.${partName}`, issues)) {
        const placeholderStrings = collectPlaceholderStrings(tokenValue);
        for (const s of placeholderStrings) {
          const placeholders = s.match(/\{([\w-]+)\}/g);
          if (!placeholders) continue;
          for (const placeholder of placeholders) {
            const name = placeholder.slice(1, -1);
            if (propertyNames.has(name) || stateNames.has(name) || derivedNames.has(name)) continue;
            if (profileAvailable && grammarSlotNames.has(name)) continue;
            // When the profile isn't loaded, we can't confirm grammar slots —
            // skip the check to avoid false positives; an info issue is
            // emitted at report level by validate().
            if (!profileAvailable) continue;
            issues.push({
              severity: "error",
              path: `tokens.${partName}.${tokenKey}`,
              message: `Placeholder '{${name}}' does not reference a known property, state, derived value, or Profile grammar-slot axis.`,
              rule: "token-placeholder-valid",
            });
          }
        }
      }
    }
  }

  // ── derived-from-exists (CDF-SEM-008) ───────────────────────────────────────
  // §10.1 single-source: from: string
  // §10.2 multi-source:  from: string[]
  if (component.derived) {
    const propertyNames = new Set([
      ...safeKeys(component.properties),
      ...safeKeys(component.properties_added),
    ]);
    const stateNames = new Set(safeKeys(component.states));

    for (const [name, derived] of safeEntries<NonNullable<CDFComponent["derived"]>[string]>(component.derived, "derived", issues)) {
      if (!derived.from) continue;
      const sources = Array.isArray(derived.from) ? derived.from : [derived.from];
      for (const src of sources) {
        if (typeof src !== "string") continue;
        if (!propertyNames.has(src) && !stateNames.has(src)) {
          issues.push({
            severity: "error",
            path: `derived.${name}.from`,
            message: `'from' references '${src}' which is not a known property or state.`,
            rule: "derived-from-exists",
          });
        }
      }
    }
  }

  // ── derived-mapping-coverage (CDF-SEM-009) ──────────────────────────────────
  // Single-source: mapping must cover every source value.
  // Multi-source: rule list must be exhaustive over the Cartesian product,
  //              evaluated in declaration order; `default:` closes the list.
  if (component.derived) {
    const propMap = { ...(component.properties ?? {}), ...(component.properties_added ?? {}) };
    const stateMap = component.states ?? {};

    for (const [name, derived] of safeEntries<NonNullable<CDFComponent["derived"]>[string]>(component.derived, "derived", issues)) {
      if (!derived.from || !derived.mapping) continue;

      const sources = Array.isArray(derived.from) ? derived.from : [derived.from];
      const sourceValues: Record<string, readonly (string | boolean)[]> = {};
      let missingSource = false;
      for (const src of sources) {
        const prop = propMap[src];
        const state = stateMap[src];
        let vals: readonly (string | boolean)[] | undefined;
        if (prop) {
          // Boolean properties don't declare explicit values — treat as [false, true].
          vals = prop.type === "boolean" ? [false, true] : prop.values;
        } else if (state) {
          vals = state.values;
        }
        if (!vals) { missingSource = true; break; }
        sourceValues[src] = vals;
      }
      if (missingSource) continue; // derived-from-exists already complains

      if (sources.length === 1) {
        // Single-source: each source value must appear as a mapping key.
        const map = derived.mapping;
        if (Array.isArray(map)) {
          issues.push({
            severity: "error",
            path: `derived.${name}.mapping`,
            message: `Single-source derived '${name}' uses an array mapping — use a value→value map instead (§10.1).`,
            rule: "derived-mapping-shape",
          });
          continue;
        }
        const mappedKeys = new Set(Object.keys(map));
        for (const v of sourceValues[sources[0]]) {
          if (!mappedKeys.has(String(v))) {
            issues.push({
              severity: "error",
              path: `derived.${name}.mapping`,
              message: `Source value '${v}' has no mapping entry. Every value of '${sources[0]}' must be covered (§10.1).`,
              rule: "derived-mapping-coverage",
            });
          }
        }
      } else {
        // Multi-source: mapping must be an array of rule entries.
        if (!Array.isArray(derived.mapping)) {
          issues.push({
            severity: "error",
            path: `derived.${name}.mapping`,
            message: `Multi-source derived '${name}' (from: [${sources.join(", ")}]) needs an ordered rule list, not a value map (§10.2).`,
            rule: "derived-mapping-shape",
          });
          continue;
        }
        const rules = derived.mapping;
        const lastIdx = rules.length - 1;
        // `default:` must be the final entry.
        for (let i = 0; i < rules.length; i++) {
          const r = rules[i] as { default?: string; when?: unknown };
          if (r.default !== undefined && i !== lastIdx) {
            issues.push({
              severity: "error",
              path: `derived.${name}.mapping[${i}]`,
              message: `'default:' rule must be the LAST entry (§10.2).`,
              rule: "derived-mapping-default-last",
            });
          }
        }
        // Coverage: enumerate every cell in the Cartesian product, apply
        // rules in declaration order, flag unresolved cells.
        const axes = sources.map((s) => ({ name: s, values: sourceValues[s] }));
        const cellCount = axes.reduce((n, a) => n * a.values.length, 1);
        if (cellCount > 256) continue; // pathological — skip closure check

        const cells = cartesian(axes as AxisSpec[]);
        for (const cell of cells) {
          const resolved = rules.some((r) => {
            if ("default" in r) return true;
            return matchesCell(r.when ?? {}, cell);
          });
          if (!resolved) {
            const desc = Object.entries(cell).map(([k, v]) => `${k}=${v}`).join(", ");
            issues.push({
              severity: "error",
              path: `derived.${name}.mapping`,
              message: `Rule list is not exhaustive — cell {${desc}} is unresolved. Add a matching 'when:' entry or a trailing 'default:' rule (§10.2).`,
              rule: "derived-mapping-coverage",
            });
          }
        }
      }
    }
  }

  // ── derived-consumed-by-exists ──────────────────────────────────────────────
  if (component.derived && component.anatomy) {
    const anatomyNames = new Set(safeKeys(component.anatomy));
    for (const [name, derived] of safeEntries<NonNullable<CDFComponent["derived"]>[string]>(component.derived, "derived", issues)) {
      if (derived.consumed_by) {
        for (const consumer of derived.consumed_by) {
          if (!anatomyNames.has(consumer)) {
            issues.push({ severity: "error", path: `derived.${name}.consumed_by`, message: `'consumed_by' references '${consumer}' which is not an anatomy part.`, rule: "derived-consumed-by-exists" });
          }
        }
      }
    }
  }

  // ── slot-accepts-valid ──────────────────────────────────────────────────────
  if (component.slots) {
    for (const [name, slot] of safeEntries<NonNullable<CDFComponent["slots"]>[string]>(component.slots, "slots", issues)) {
      if (slot.accepts) {
        const acceptsList = Array.isArray(slot.accepts) ? slot.accepts : [slot.accepts];
        for (const accepts of acceptsList) {
          // "text" and "any" are built-in; anything else must be PascalCase (a CDF component name)
          if (accepts !== "text" && accepts !== "any" && !/^[A-Z]/.test(accepts)) {
            issues.push({ severity: "error", path: `slots.${name}.accepts`, message: `'accepts' value '${accepts}' must be 'text', 'any', or a PascalCase CDF component name.`, rule: "slot-accepts-valid" });
          }
        }
      }
    }
  }

  // ── mirrors_state (CDF-SEM-013 / CDF-SEM-014) ───────────────────────────────
  // A property that mirrors a state axis must name an existing axis whose
  // `values:` are type-compatible. A state axis may be the target of at
  // most one mirroring property.
  const mirrorTargets = new Map<string, string>(); // stateName → propName
  const allProps: [string, Record<string, Property>][] = [];
  if (component.properties) allProps.push(["properties", component.properties]);
  if (component.properties_added) allProps.push(["properties_added", component.properties_added]);

  for (const [section, props] of allProps) {
    for (const [name, prop] of safeEntries<Property>(props, section, issues)) {
      if (!prop.mirrors_state) continue;
      const target = prop.mirrors_state;
      const state = component.states?.[target];
      const path = `${section}.${name}.mirrors_state`;

      // SEM-013: target must exist
      if (!state) {
        issues.push({
          severity: "error",
          path,
          message: `mirrors_state references state axis '${target}' which does not exist.`,
          rule: "mirrors-state-target",
        });
        continue;
      }

      // SEM-013: type compatibility
      if (!mirrorsTypeCompatible(prop, state)) {
        const axisValues = state.values.join(", ");
        // Specific hint for the common foot-gun: boolean property mirroring
        // a state axis that uses DOM/ARIA vocabulary (`on|off`, `expanded`,
        // `mixed`) instead of literal `[false, true]`. See F-Radix-5.
        const booleanMirror = prop.type === "boolean";
        const message = booleanMirror
          ? `Property '${name}' (boolean) mirrors state axis '${target}' whose values are [${axisValues}]. Boolean mirrors require literal [false, true] axis values (§7.11 rule 2). DOM/ARIA naming conventions (on/off, mixed, expanded) belong in the Target's 'state_to_input:' block (CDF-TARGET-SPEC §13), not in the Component's state-axis values.`
          : `Property '${name}' (type=${prop.type}, values=[${prop.values?.join(", ") ?? ""}]) is not type-compatible with state axis '${target}' (values=[${axisValues}]).`;
        issues.push({
          severity: "error",
          path,
          message,
          rule: "mirrors-state-target",
        });
      }

      // SEM-013: defaults must coincide
      const propDefault = prop.default;
      const stateDefault = state.default;
      if (propDefault != null && stateDefault != null && String(propDefault) !== String(stateDefault)) {
        issues.push({
          severity: "error",
          path,
          message: `Property default '${propDefault}' does not match state '${target}' default '${stateDefault}'.`,
          rule: "mirrors-state-target",
        });
      }

      // SEM-014: at most one mirror per axis
      if (mirrorTargets.has(target)) {
        issues.push({
          severity: "error",
          path,
          message: `State axis '${target}' is already mirrored by property '${mirrorTargets.get(target)}'. Each axis may be mirrored by at most one property.`,
          rule: "mirrors-state-unique",
        });
      } else {
        mirrorTargets.set(target, name);
      }
    }
  }

  // ── anatomy.{part}.bindings (CDF-SEM-011 / CDF-SEM-012) ─────────────────────
  // bindings keys must name properties of the referenced nested component;
  // bindings values must name entries in the parent's `derived:` block.
  if (component.anatomy) {
    const derivedNames = new Set(Object.keys(component.derived ?? {}));
    for (const [partName, part] of Object.entries(component.anatomy)) {
      if (!part.bindings) continue;
      const basePath = `anatomy.${partName}.bindings`;

      // SEM-012: value side (parent's derived block) — always checkable.
      for (const [bindingKey, bindingVal] of Object.entries(part.bindings)) {
        if (typeof bindingVal !== "string") continue;
        if (!derivedNames.has(bindingVal)) {
          issues.push({
            severity: "error",
            path: `${basePath}.${bindingKey}`,
            message: `bindings value '${bindingVal}' does not name an entry in the parent's 'derived:' block.`,
            rule: "anatomy-binding-source",
          });
        }
      }

      // SEM-011: key side (nested component's property) — only checkable
      // when the nested spec is loaded.
      const nestedName = part.component;
      if (!nestedName) continue;
      const nested = context?.components?.get(nestedName.toLowerCase());
      if (!nested) continue; // component-ref-exists handles the missing-spec case

      const nestedProps = new Set([
        ...Object.keys(nested.properties ?? {}),
        ...Object.keys(nested.properties_added ?? {}),
      ]);
      for (const bindingKey of Object.keys(part.bindings)) {
        if (!nestedProps.has(bindingKey)) {
          issues.push({
            severity: "error",
            path: `${basePath}.${bindingKey}`,
            message: `bindings key '${bindingKey}' is not a property of nested component '${nestedName}'.`,
            rule: "anatomy-binding-target",
          });
        }
      }
    }
  }

  // ── reserved-vocabulary-isolation (CDF-STR-011/012) ────────────────────────
  if (context?.profile) {
    const profile = context.profile;
    const vocabs = profile.vocabularies ?? {};
    // Collect every vocabulary's values keyed by owner name.
    // Interaction-pattern `states:` lists and `validation.values:` etc. are
    // Profile-declared vocabularies that may not appear as `vocabularies.*`;
    // §5.5 rule 5 says an axis can bind to ANY such vocabulary.
    const vocabValues = new Map<string, Set<string>>();
    for (const [vocabName, vocab] of Object.entries(vocabs)) {
      if (vocab?.values) vocabValues.set(vocabName, new Set(vocab.values));
    }
    // Interaction patterns expose a `states:` list — each pattern name
    // is treated as a vocabulary owner for STR-011 purposes.
    for (const [patternName, pattern] of Object.entries(profile.interaction_patterns ?? {})) {
      if (pattern?.states) vocabValues.set(patternName, new Set(pattern.states));
    }

    const axisChecks: [string, string, { values?: string[]; binds_to?: string }][] = [];
    for (const [propName, prop] of Object.entries(component.properties ?? {})) {
      axisChecks.push([`properties.${propName}`, propName, prop]);
    }
    for (const [stateName, state] of Object.entries(component.states ?? {})) {
      axisChecks.push([`states.${stateName}`, stateName, state]);
    }

    for (const [path, axisName, axis] of axisChecks) {
      const values = axis.values;
      if (!values) continue;

      // Determine the vocabulary this axis binds to:
      // 1. explicit binds_to wins
      // 2. if axisName matches a vocabulary name, bind implicitly
      // 3. otherwise, it's a local enum — isolation doesn't apply
      const owner = axis.binds_to ?? (vocabValues.has(axisName) ? axisName : undefined);

      // Collect per-value owners so we can (a) enforce the single-owner rule
      // and (b) detect the "all values map to one vocab" case for STR-012.
      const perValueOwners = new Map<string, string[]>();
      for (const v of values) {
        const owners: string[] = [];
        for (const [vocabName, set] of vocabValues) {
          if (set.has(String(v))) owners.push(vocabName);
        }
        perValueOwners.set(String(v), owners);
      }

      // STR-011 — per the spec, the rule applies only to values owned by
      // exactly ONE vocabulary. Multi-owner values are intentionally
      // polysemous; zero-owner values are local enums.
      for (const [v, owners] of perValueOwners) {
        if (owners.length !== 1) continue;
        const singleOwner = owners[0];
        if (owner === singleOwner) continue;
        issues.push({
          severity: "error",
          path: `${path}.values`,
          message: `Value '${v}' is reserved by Profile vocabulary '${singleOwner}' but axis '${axisName}' is not bound to it. Rename the axis to '${singleOwner}' or declare 'binds_to: ${singleOwner}'.`,
          rule: "reserved-vocabulary-isolation",
        });
      }
    }
  }

  // ── event-type-valid (warning per CDF-MCP-SPEC) ─────────────────────────────
  if (component.events && typeof component.events === "object") {
    for (const [name, event] of safeEntries<import("../../types/cdf.js").Event>(component.events, "events", issues)) {
      if (!event || typeof event !== "object" || !("type" in event)) continue;
      const evtType = (event as import("../../types/cdf.js").Event).type;
      // void is always valid; PascalCase suggests a known type; primitives are ok
      const validEventTypes = ["void", "string", "number", "boolean"];
      if (evtType && !validEventTypes.includes(evtType) && !/^[A-Z]/.test(evtType) && !evtType.includes("|")) {
        issues.push({ severity: "warning", path: `events.${name}.type`, message: `Event type '${evtType}' is not 'void' or a recognized type.`, rule: "event-type-valid" });
      }
    }
  }

  // ── compound-states-closure (CDF-SEM-010) ──────────────────────────────────
  // Every render cell in the Cartesian product of state axes must resolve
  // every tokens-referenced path to a value, after merging `tokens:` defaults
  // and all matching `compound_states[]` rules.
  if (component.states && component.tokens && component.compound_states) {
    const axes = Object.entries(component.states).map(([name, s]) => ({
      name,
      values: s.values as readonly (string | boolean)[],
    }));
    if (axes.length > 0) {
      // Collect every token key that ever appears, per anatomy part.
      const allKeysPerPart = new Map<string, Set<string>>();
      for (const [partName, mapping] of Object.entries(component.tokens)) {
        const keys = new Set<string>();
        for (const k of Object.keys(mapping ?? {})) {
          // Strip modifier suffix: `background--selected.true` → `background`
          keys.add(k.split("--")[0]);
        }
        allKeysPerPart.set(partName, keys);
        for (const rule of component.compound_states ?? []) {
          const ruleMapping = rule.tokens?.[partName];
          if (ruleMapping) {
            for (const k of Object.keys(ruleMapping)) keys.add(k.split("--")[0]);
          }
        }
      }

      // Enumerate every cell in the Cartesian product (bounded by config —
      // bail if the product is > 64 cells to avoid pathological specs).
      const cellCount = axes.reduce((n, a) => n * a.values.length, 1);
      if (cellCount <= 64) {
        const cells = cartesian(axes);
        for (const cell of cells) {
          for (const [partName, keys] of allKeysPerPart) {
            for (const key of keys) {
              if (!cellResolves(component, partName, key, cell)) {
                const cellDesc = Object.entries(cell)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ");
                issues.push({
                  severity: "error",
                  path: `tokens.${partName}.${key}`,
                  message: `Token '${key}' on part '${partName}' is unresolved in render cell {${cellDesc}}. Add a compound_states rule or a base value.`,
                  rule: "compound-states-closure",
                });
              }
            }
          }
        }
      }
    }
  }

  return issues;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function collectPlaceholderStrings(val: unknown): string[] {
  if (typeof val === "string") return [val];
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const out: string[] = [];
    for (const v of Object.values(val)) {
      if (typeof v === "string") out.push(v);
    }
    return out;
  }
  return [];
}

function collectGrammarSlotNames(context?: ValidationContext): Set<string> {
  const names = new Set<string>();
  const grammar = context?.profile?.token_grammar;
  if (!grammar) return names;
  for (const g of Object.values(grammar)) {
    if (!g?.axes) continue;
    for (const axisName of Object.keys(g.axes)) names.add(axisName);
  }
  return names;
}

function mirrorsTypeCompatible(prop: Property, state: State): boolean {
  if (prop.type === "boolean") {
    const sv = state.values.map((v) => String(v));
    return sv.length === 2 && sv.includes("true") && sv.includes("false");
  }
  if (prop.type === "enum") {
    if (!prop.values) return false;
    // enum ⊆ state OR state ⊆ enum — either direction is legal per §7.11.
    const propSet = new Set(prop.values.map(String));
    const stateSet = new Set(state.values.map(String));
    const propInState = prop.values.every((v) => stateSet.has(String(v)));
    const stateInProp = state.values.every((v) => propSet.has(String(v)));
    return propInState || stateInProp;
  }
  return false;
}

type AxisSpec = { name: string; values: readonly (string | boolean)[] };

function cartesian(axes: AxisSpec[]): Record<string, string | boolean>[] {
  let cells: Record<string, string | boolean>[] = [{}];
  for (const axis of axes) {
    const next: Record<string, string | boolean>[] = [];
    for (const cell of cells) {
      for (const v of axis.values) {
        next.push({ ...cell, [axis.name]: v });
      }
    }
    cells = next;
  }
  return cells;
}

/**
 * Check whether a token key on a part resolves in a given render cell.
 * A cell resolves if EITHER the base mapping has the key OR any matching
 * compound_states rule supplies it (after modifier matching).
 */
function cellResolves(
  component: CDFComponent,
  partName: string,
  key: string,
  cell: Record<string, string | boolean>
): boolean {
  const base = component.tokens[partName];
  if (!base) return false;

  // Base key present (ignoring modifiers) is enough for "resolvable".
  if (base[key] != null) {
    // Then check whether any axis-qualified modifier that matches THIS cell
    // resolves to a valid (non-null) value. `background--selected.true`
    // means: applies when state `selected` = true. If it maps to `null`
    // explicitly, that's an intentional removal and still counts as resolved.
    return true;
  }

  // No base — check if every modifier chain relevant to this cell covers it.
  const modKey = `${key}--`;
  for (const fullKey of Object.keys(base)) {
    if (!fullKey.startsWith(modKey)) continue;
    const modifier = fullKey.slice(modKey.length);
    if (modifierMatchesCell(modifier, cell)) return true;
  }

  // Finally, check compound_states rules.
  for (const rule of component.compound_states ?? []) {
    if (!matchesCell(rule.when, cell)) continue;
    const ruleMapping = rule.tokens?.[partName];
    if (ruleMapping && key in ruleMapping) return true;
  }
  return false;
}

function matchesCell(
  when: Record<string, string | boolean>,
  cell: Record<string, string | boolean>
): boolean {
  for (const [k, v] of Object.entries(when)) {
    if (String(cell[k]) !== String(v)) return false;
  }
  return true;
}

function modifierMatchesCell(
  modifier: string,
  cell: Record<string, string | boolean>
): boolean {
  // `selected.true` → axis=selected value=true
  // `tertiary` → either a property value (can't verify without props map) or
  //              a state value — be permissive: treat as matching if any cell
  //              axis holds that value.
  if (modifier.includes(".")) {
    const [axis, value] = modifier.split(".");
    return String(cell[axis]) === value;
  }
  for (const v of Object.values(cell)) {
    if (String(v) === modifier) return true;
  }
  return false;
}

