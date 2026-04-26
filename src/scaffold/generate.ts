/**
 * CDF Scaffold Generator
 *
 * Generates a CDF YAML skeleton from Figma analysis data.
 * Accepts the JSON outputs of figma_analyze_component_set,
 * extract-token-map.js, and audit-sub-interactions.js as inputs.
 *
 * The output is a syntactically valid but intentionally incomplete spec —
 * a starting point that needs human review for accessibility details,
 * behavior descriptions, and references.
 */

import { stringify } from "yaml";

// ─── Input Types ────────────────────────────────────────────────────────────

export interface ScaffoldInput {
  componentName: string;
  category: "Primitives" | "Actions" | "Inputs" | "Status" | "Layout";
  description: string;
  figmaAnalysis: FigmaAnalysisInput;
  tokenMap?: TokenMapInput;
  interactionAudit?: InteractionAuditInput;
}

interface FigmaAnalysisInput {
  nodeId: string;
  nodeName: string;
  variantCount: number;
  variantAxes: Record<string, string[]>;
  componentProps: Record<
    string,
    { type: string; defaultValue?: string; variantOptions?: string[] }
  >;
  stateMachine?: {
    cssMapping: Record<string, string>;
  };
}

interface TokenMapInput {
  componentSetName: string;
  componentSetId: string;
  variantAxes: Record<string, string[]>;
  componentProperties: Record<string, { type: string; default?: string }>;
  defaultVariant: string;
  tokenMap: Record<string, Record<string, Record<string, string | null>>>;
}

interface InteractionAuditInput {
  targetNode: { id: string; name: string; type: string };
  subComponents: SubComponentAudit[];
  dependencies: { standalone: string[]; private: string[] };
  summary: {
    totalInstances: number;
    interactive: number;
    decorative: number;
    hasOverlays: boolean;
    overlayComponents: string[];
  };
}

interface SubComponentAudit {
  instanceName: string;
  componentSetId: string;
  componentSetName: string;
  scope: "standalone" | "private";
  classification: "INTERACTIVE" | "DECORATIVE";
  evidence: {
    stateAxes: Array<{
      name: string;
      values: string[];
      interactiveValues: string[];
    }>;
    reactions: Array<{
      trigger: string;
      actionType: string;
      destinationName: string;
      sourceVariant: string;
    }>;
    overlayTargets: Array<{ nodeId: string; name: string; type: string }>;
  };
  suggestedImpact: {
    element_change?: string | null;
    aria_additions: string[];
    anatomy_additions: string[];
    behavior_additions: string[];
    note?: string | null;
  };
}

// ─── Known patterns ─────────────────────────────────────────────────────────

const THEME_AXIS_NAMES = new Set(["semantic", "device", "shape"]);

const INTERACTION_STATE_NAMES = new Set([
  "state",
  "interaction",
  "mode",
  "status",
]);

const INTERACTIVE_VALUES = new Set([
  "hover",
  "pressed",
  "active",
  "disabled",
  "focused",
  "open",
  "expanded",
  "selected",
  "error",
  "enabled",
  "default",
]);

const THEME_AXES_TEMPLATE = {
  semantic: {
    values: ["Light", "Dark"],
    data_attribute: "data-semantic",
    affects: "color.controls.*, color.interaction.*, color.text.*, shadow.*",
  },
  device: {
    values: ["Desktop", "Tablet", "Mobile"],
    data_attribute: "data-device",
    affects:
      "controls.height.*, controls.minTarget, spacing.*, fontSizes.*, lineHeights.*",
  },
  shape: {
    values: ["Round", "Sharp"],
    data_attribute: "data-shape",
    affects: "radius.*",
  },
};

// Figma CSS properties that are typically layout/typography (not colors)
const LAYOUT_TOKEN_PROPS = new Set([
  "width",
  "height",
  "gap",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
  "border-radius",
  "font-size",
  "font-family",
  "font-weight",
  "line-height",
  "letter-spacing",
]);

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateScaffold(input: ScaffoldInput): string {
  const {
    componentName,
    category,
    description,
    figmaAnalysis,
    tokenMap,
    interactionAudit,
  } = input;

  const spec: Record<string, unknown> = {};

  // ── Name & Category ─────────────────────────────────────────────────────
  spec.name = componentName;
  spec.category = category;
  spec.description = description;

  // ── Theme Axes ──────────────────────────────────────────────────────────
  spec.theme_axes = { ...THEME_AXES_TEMPLATE };

  // ── Classify variant axes ───────────────────────────────────────────────
  const axes = figmaAnalysis.variantAxes;
  const properties: Record<string, unknown> = {};
  const states: Record<string, unknown> = {};
  const figmaVariantProps: Record<string, string[]> = {};

  for (const [axisName, values] of Object.entries(axes)) {
    const lower = axisName.toLowerCase();
    figmaVariantProps[axisName] = values;

    // Skip theme axes — they're in theme_axes, not properties
    if (THEME_AXIS_NAMES.has(lower)) continue;

    // Detect interaction state axes
    const isStateAxis =
      INTERACTION_STATE_NAMES.has(lower) ||
      values.filter((v) => INTERACTIVE_VALUES.has(v.toLowerCase())).length >=
        3;

    if (isStateAxis) {
      states[axisName] = {
        values,
        runtime: true,
        description: `# TODO: Describe ${axisName} state axis`,
      };
    } else {
      properties[axisName] = {
        type: "enum",
        values,
        default: values[0],
        description: `# TODO: Describe ${axisName} property`,
      };
    }
  }

  // ── Component properties → CDF properties/slots ─────────────────────────
  const componentProps =
    tokenMap?.componentProperties ?? figmaAnalysis.componentProps ?? {};
  for (const [propName, propDef] of Object.entries(componentProps)) {
    const cleanName = propName.replace(/#\d+:\d+$/, "").trim();
    if (propDef.type === "TEXT") {
      properties[cleanName] = {
        type: "string",
        default: propDef.default ?? propDef.defaultValue ?? "",
        description: `# TODO: Describe ${cleanName} text property`,
      };
    }
    // INSTANCE_SWAP handled in anatomy
  }

  if (Object.keys(properties).length > 0) spec.properties = properties;
  if (Object.keys(states).length > 0) spec.states = states;

  // ── Anatomy from token map layer structure ──────────────────────────────
  const anatomy: Record<string, unknown> = {};
  const defaultTokens = tokenMap?.tokenMap?.default;

  if (defaultTokens) {
    // Infer anatomy from top-level layer names
    const topLevelLayers = new Set<string>();
    for (const layerPath of Object.keys(defaultTokens)) {
      if (layerPath === "(root)") {
        topLevelLayers.add("container");
      } else {
        topLevelLayers.add(layerPath.split("/")[0]);
      }
    }

    for (const layerName of topLevelLayers) {
      const key = toAnatomyKey(layerName);
      // Check if this is a known component instance from audit
      const auditEntry = interactionAudit?.subComponents.find(
        (sc) => sc.instanceName === layerName
      );
      if (auditEntry) {
        anatomy[key] = {
          component: toPascalCase(auditEntry.componentSetName),
          description: `# TODO: Describe ${layerName}`,
        };
      } else {
        anatomy[key] = {
          element: "box",
          description: `# TODO: Describe ${layerName}`,
        };
      }
    }
  }

  // Always ensure a container exists
  if (!anatomy.container) {
    anatomy.container = {
      element: inferRootElement(category),
      description: `Root wrapper element.`,
    };
  }

  spec.anatomy = anatomy;

  // ── Tokens from token map ───────────────────────────────────────────────
  const tokens: Record<string, Record<string, string>> = {};

  if (defaultTokens) {
    for (const [layerPath, bindings] of Object.entries(defaultTokens)) {
      const anatomyKey =
        layerPath === "(root)"
          ? "container"
          : toAnatomyKey(layerPath.split("/")[0]);

      if (!tokens[anatomyKey]) tokens[anatomyKey] = {};

      for (const [cssProp, tokenPath] of Object.entries(bindings)) {
        if (tokenPath === null) continue;

        // Try to detect interpolatable segments
        const parameterized = parameterizeTokenPath(
          tokenPath,
          properties,
          states
        );
        tokens[anatomyKey][cssProp] = parameterized;
      }
    }
  }

  if (Object.keys(tokens).length > 0) {
    // Add focus token
    tokens.focus = {
      pattern: "double-ring",
      applies_to: "container",
    };
    spec.tokens = tokens;
  } else {
    spec.tokens = {
      container: { "# TODO": "Add token mappings" },
      focus: { pattern: "double-ring", applies_to: "container" },
    };
  }

  // ── Events ──────────────────────────────────────────────────────────────
  if (Object.keys(states).length > 0) {
    spec.events = {
      "# TODO": {
        type: "void",
        description: "Add events for consumer-relevant outputs",
      },
    };
  }

  // ── Accessibility ───────────────────────────────────────────────────────
  spec.accessibility = {
    element: inferRootElement(category),
    "focus-visible": true,
    keyboard: {
      Enter: "# TODO: Define action",
      Space: "# TODO: Define action",
    },
    aria: ["# TODO: Add ARIA attributes"],
    "min-target-size": "controls.minTarget",
    contrast:
      "# TODO: Document contrast requirements",
  };

  // ── Behavior ────────────────────────────────────────────────────────────
  spec.behavior = {
    transitions: [
      {
        property: "background-color",
        duration: "120ms",
        easing: "ease-in-out",
      },
    ],
  };

  // ── References ──────────────────────────────────────────────────────────
  spec.references = [
    {
      name: "# TODO: Add WAI-ARIA APG reference",
      url: "https://www.w3.org/WAI/ARIA/apg/patterns/",
      use: "Canonical keyboard and ARIA behavior",
    },
  ];

  // ── Figma ───────────────────────────────────────────────────────────────
  const figma: Record<string, unknown> = {
    component_set_name: figmaAnalysis.nodeName,
    component_set_id: figmaAnalysis.nodeId,
    variant_properties: figmaVariantProps,
    total_variants: figmaAnalysis.variantCount,
  };

  // Component properties
  const figmaCompProps: Record<string, unknown> = {};
  for (const [propName, propDef] of Object.entries(componentProps)) {
    if (propDef.type === "TEXT" || propDef.type === "INSTANCE_SWAP") {
      figmaCompProps[propName] = {
        type: propDef.type.toLowerCase(),
        default: propDef.default ?? propDef.defaultValue ?? "",
      };
    }
  }
  if (Object.keys(figmaCompProps).length > 0) {
    figma.component_properties = figmaCompProps;
  }

  // Interaction audit sub-components
  if (interactionAudit && interactionAudit.subComponents.length > 0) {
    figma.sub_components = interactionAudit.subComponents.map((sc) => ({
      name: toPascalCase(sc.componentSetName),
      figma_name: sc.componentSetName,
      component_set_id: sc.componentSetId,
      scope: sc.scope,
      classification: sc.classification,
      interaction_audit: {
        evidence: {
          state_axes: sc.evidence.stateAxes.map((a) => ({
            name: a.name,
            values: a.values,
            interactive_values: a.interactiveValues,
          })),
          reactions: sc.evidence.reactions.slice(0, 5).map((r) => ({
            trigger: r.trigger,
            action: r.actionType,
            destination: r.destinationName,
          })),
          overlay_targets: sc.evidence.overlayTargets.map((t) => ({
            name: t.name,
            node_id: t.nodeId,
          })),
        },
        suggested_impact: {
          ...(sc.suggestedImpact.element_change && {
            element_change: sc.suggestedImpact.element_change,
          }),
          ...(sc.suggestedImpact.aria_additions.length > 0 && {
            aria_additions: sc.suggestedImpact.aria_additions,
          }),
          ...(sc.suggestedImpact.behavior_additions.length > 0 && {
            behavior_additions: sc.suggestedImpact.behavior_additions,
          }),
          ...(sc.suggestedImpact.note && {
            note: sc.suggestedImpact.note,
          }),
        },
      },
    }));
  }

  spec.figma = figma;

  // ── CSS Architecture ────────────────────────────────────────────────────
  spec.css_architecture = {
    selector: `.ft-${toKebabCase(componentName)}`,
  };

  // ── Serialize ───────────────────────────────────────────────────────────
  return buildYamlWithComments(spec);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toAnatomyKey(layerName: string): string {
  return layerName
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/^_+/, "");
}

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function toPascalCase(name: string): string {
  // Remove leading underscores, split on non-alpha, capitalize each
  const clean = name.replace(/^_+/, "");
  return clean
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function inferRootElement(
  category: string
): string {
  switch (category) {
    case "Actions":
      return "button";
    case "Inputs":
      return "input";
    case "Layout":
      return "div";
    case "Status":
      return "span";
    default:
      return "div";
  }
}

/**
 * Try to replace literal segments in a token path with {property} or {state}
 * interpolation placeholders. E.g.:
 *   "color.controls.primary.background.enabled" → "color.controls.{hierarchy}.background.{interaction}"
 */
function parameterizeTokenPath(
  tokenPath: string,
  properties: Record<string, unknown>,
  states: Record<string, unknown>
): string {
  const segments = tokenPath.split(".");
  const result: string[] = [];

  for (const segment of segments) {
    let replaced = false;

    // Check if this segment matches any property value
    for (const [propName, propDef] of Object.entries(properties)) {
      const def = propDef as { values?: string[] };
      if (def.values?.includes(segment)) {
        result.push(`{${propName}}`);
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      // Check if this segment matches any state value
      for (const [stateName, stateDef] of Object.entries(states)) {
        const def = stateDef as { values?: string[] };
        if (def.values?.includes(segment)) {
          result.push(`{${stateName}}`);
          replaced = true;
          break;
        }
      }
    }

    if (!replaced) {
      result.push(segment);
    }
  }

  return result.join(".");
}

/**
 * Build YAML string with section header comments matching the Formtrieb style.
 */
function buildYamlWithComments(spec: Record<string, unknown>): string {
  const sections: Array<{ key: string; comment: string }> = [
    { key: "name", comment: "" },
    { key: "category", comment: "" },
    { key: "description", comment: "" },
    {
      key: "theme_axes",
      comment: "# --- Theme Axes (CSS cascade context) ---",
    },
    { key: "properties", comment: "# --- Properties ---" },
    { key: "states", comment: "# --- States ---" },
    { key: "anatomy", comment: "# --- Anatomy ---" },
    { key: "tokens", comment: "# --- Token Mapping ---" },
    { key: "events", comment: "# --- Events ---" },
    { key: "accessibility", comment: "# --- Accessibility ---" },
    { key: "behavior", comment: "# --- Behavior ---" },
    { key: "references", comment: "# --- References ---" },
    { key: "figma", comment: "# --- Figma ---" },
    { key: "css_architecture", comment: "# --- CSS Architecture ---" },
  ];

  const parts: string[] = [
    `# Component Spec: ${spec.name} (SCAFFOLD — review and complete all # TODO sections)`,
    "",
  ];

  for (const { key, comment } of sections) {
    if (!(key in spec)) continue;
    const sectionObj: Record<string, unknown> = { [key]: spec[key] };
    const yamlStr = stringify(sectionObj, {
      lineWidth: 100,
      defaultStringType: "PLAIN",
    }).trimEnd();

    if (comment) {
      parts.push("", comment, "", yamlStr);
    } else {
      parts.push(yamlStr);
    }
  }

  return parts.join("\n") + "\n";
}
