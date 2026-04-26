import type { CDFComponent, CDFConfig } from "../types/cdf.js";

export interface Suggestion {
  area: "completeness" | "accessibility" | "tokens" | "figma" | "consistency" | "events" | "derived" | "css";
  priority: "high" | "medium" | "low";
  message: string;
  example?: string;
}

/**
 * Analyze a CDF spec and suggest improvements.
 * This is the "code review" tool — less strict than validation,
 * more about best practices and completeness.
 *
 * See CDF-MCP-SPEC §3.8.
 */
export function suggestImprovements(
  component: CDFComponent,
  config?: CDFConfig,
  focus?: "completeness" | "accessibility" | "tokens" | "figma" | "consistency"
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (!focus || focus === "completeness") {
    suggestions.push(...checkCompleteness(component));
  }
  if (!focus || focus === "accessibility") {
    suggestions.push(...checkAccessibility(component));
  }
  if (!focus || focus === "tokens") {
    suggestions.push(...checkTokens(component));
  }
  if (!focus || focus === "figma") {
    suggestions.push(...checkFigma(component));
  }
  if (!focus || focus === "consistency") {
    suggestions.push(...checkConsistency(component));
  }

  return suggestions;
}

function checkCompleteness(component: CDFComponent): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const isInteractive = component.states && Object.keys(component.states).length > 0;
  const hasProperties = component.properties && Object.keys(component.properties).length > 0;
  const isInheriting = !!component.inherits;

  // Missing events section
  if (!component.events && !isInheriting) {
    if (isInteractive) {
      suggestions.push({
        area: "events",
        priority: "high",
        message: `${component.name} is interactive (has states) but has no events section. Consider adding events for consumer-relevant outputs.`,
        example: `events:\n  clicked:\n    type: void\n    description: "Emitted when activated."`,
      });
    } else {
      suggestions.push({
        area: "completeness",
        priority: "low",
        message: `${component.name} has no events section. Add 'events: {}' to explicitly document that no events are emitted.`,
      });
    }
  }

  // Missing derived section for components with repeated patterns
  if (!component.derived && !isInheriting && hasProperties) {
    // Check if any anatomy locked maps could be extracted to derived values
    if (component.anatomy) {
      const lockedMaps = new Map<string, number>();
      for (const part of Object.values(component.anatomy)) {
        if (!part.locked) continue;
        for (const [key, value] of Object.entries(part.locked)) {
          if (typeof value === "object" && value !== null) {
            const sig = JSON.stringify(value);
            lockedMaps.set(`${key}:${sig}`, (lockedMaps.get(`${key}:${sig}`) ?? 0) + 1);
          }
        }
      }
      const duplicates = [...lockedMaps.entries()].filter(([, count]) => count > 1);
      if (duplicates.length > 0) {
        suggestions.push({
          area: "derived",
          priority: "medium",
          message: `${component.name} has repeated locked maps across anatomy parts. Consider extracting to a 'derived' value.`,
          example: `derived:\n  iconSize:\n    from: size\n    mapping: { base: small, small: xsmall }\n    consumed_by: [icon, spinner]`,
        });
      }
    }

    // Interactive components with size property often need iconSize
    if (isInteractive && component.properties?.size) {
      suggestions.push({
        area: "derived",
        priority: "medium",
        message: `${component.name} has a 'size' property and is interactive. Consider adding derived values for child component sizing (e.g., iconSize).`,
      });
    }
  }

  // Missing css section (renamed from css_architecture in Phase 7a.1)
  if (!component.css && !isInheriting && isInteractive) {
    suggestions.push({
      area: "css",
      priority: "medium",
      message: `${component.name} has no css section. Document BEM patterns, private properties, and mixins for generator guidance.`,
      example: `css:\n  class_pattern: "ft-${kebab(component.name)}--{modifier}__{child}"\n  prefix: ft\n  methodology: BEM`,
    });
  }

  // Missing slots for components with text content
  if (!component.slots && !isInheriting && component.anatomy) {
    const hasTextPart = Object.values(component.anatomy).some(
      (p) => p.element === "text" || p.description?.toLowerCase().includes("label text")
    );
    if (hasTextPart) {
      suggestions.push({
        area: "completeness",
        priority: "medium",
        message: `${component.name} has a text anatomy part but no slots section. Document the content projection contract.`,
        example: `slots:\n  default:\n    description: "Label text content."\n    required: true\n    accepts: text`,
      });
    }
  }

  // Missing token_gaps
  if (component.token_gaps === undefined && !isInheriting) {
    suggestions.push({
      area: "tokens",
      priority: "low",
      message: `${component.name} has no token_gaps field. Add 'token_gaps: []' to explicitly document all tokens are resolved, or list gaps.`,
    });
  }

  // Missing behavior for components with loading state
  if (!component.behavior && !isInheriting) {
    const hasLoading = component.states && Object.keys(component.states).some((s) => s === "loading");
    if (hasLoading) {
      suggestions.push({
        area: "completeness",
        priority: "high",
        message: `${component.name} has a loading state but no behavior section. Document content swap behavior during loading.`,
      });
    }
  }

  return suggestions;
}

function checkAccessibility(component: CDFComponent): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (!component.accessibility) return suggestions;

  // Missing keyboard for interactive
  if (component.states && Object.keys(component.states).length > 0) {
    if (!component.accessibility.keyboard || Object.keys(component.accessibility.keyboard).length === 0) {
      suggestions.push({
        area: "accessibility",
        priority: "high",
        message: `${component.name} is interactive but has no keyboard interactions documented.`,
      });
    }

    // Missing min-target-size
    if (!component.accessibility["min-target-size"]) {
      suggestions.push({
        area: "accessibility",
        priority: "medium",
        message: `${component.name} is interactive but has no min-target-size. Reference controls.minTarget token.`,
      });
    }
  }

  // Missing contrast documentation
  if (!component.accessibility.contrast) {
    suggestions.push({
      area: "accessibility",
      priority: "low",
      message: `${component.name} has no contrast documentation. Note WCAG compliance status of color tokens.`,
    });
  }

  return suggestions;
}

function checkTokens(component: CDFComponent): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (!component.tokens) return suggestions;

  // Focus ring pattern
  const hasFocusVisible = component.accessibility?.["focus-visible"];
  const hasFocusTokens = component.tokens.focus;
  if (hasFocusVisible && !hasFocusTokens) {
    suggestions.push({
      area: "tokens",
      priority: "high",
      message: `${component.name} has focus-visible: true but no focus token mapping. Add focus pattern.`,
      example: `focus:\n  pattern: double-ring\n  applies_to: container`,
    });
  }

  return suggestions;
}

function checkFigma(component: CDFComponent): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (!component.figma) {
    if (component.properties && Object.keys(component.properties).length > 0) {
      suggestions.push({
        area: "figma",
        priority: "medium",
        message: `${component.name} has no figma section. Document variant properties and component set name for Figma generation.`,
      });
    }
    return suggestions;
  }

  // Missing component_properties for text content
  if (!component.figma.component_properties && component.anatomy) {
    const hasTextPart = Object.values(component.anatomy).some((p) => p.element === "text");
    if (hasTextPart) {
      suggestions.push({
        area: "figma",
        priority: "low",
        message: `${component.name} has text anatomy but no figma component_properties. Consider adding editable text properties.`,
      });
    }
  }

  return suggestions;
}

function checkConsistency(component: CDFComponent): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // File naming
  // (can't check filename from the component alone — this is done at the file level)

  return suggestions;
}

function kebab(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
