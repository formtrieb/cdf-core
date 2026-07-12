import type { DSProfile } from "../types/profile.js";

/**
 * emitDesignMd() — Profile → DESIGN.md (google-labs-code/design.md format).
 *
 * DESIGN.md is a public, provider-neutral agent-context format: optional
 * YAML frontmatter (machine-readable design tokens) + a markdown body of
 * `##` sections in a fixed order. Full ground truth is the upstream spec:
 * https://github.com/google-labs-code/design.md/blob/main/docs/spec.md
 * (a vendored copy + line-cited checklist live under
 * `fixtures/reference/design-md/` in the monorepo for local reference).
 *
 * Section mapping (v1):
 *   Overview              <- profile.name + profile.description
 *   Colors/Typography/    <- opts.tokens ONLY (Profile has no literal
 *   Layout/Elevation/         hex/px values — vocabularies are semantic
 *   Shapes                    names, not tokens). Omitted with an HTML
 *                              comment when no matching tokens are supplied.
 *   Components             <- profile.vocabularies. One `###` subsection per
 *                              vocabulary; canonical values rendered as a
 *                              backtick-wrapped, comma-joined allowed-value
 *                              list. Every vocabulary value appears exactly
 *                              once, verified by the caller against the
 *                              parsed Profile.
 *   Do's and Don'ts        <- profile.interaction_patterns, one Do/Don't
 *                              pair per pattern, plain language, plus one
 *                              additive "Note (<key>): <text>" bullet per
 *                              non-empty entry in the pattern's `notes`
 *                              (verbatim Profile prose, whitespace-folded
 *                              only — never rewritten).
 *
 * Design notes:
 *  - Values are wrapped in backticks (`` `value` ``) specifically so the
 *    round-trip check can search for the exact token `` `value` `` without
 *    tripping on substring collisions between sibling values in the same
 *    vocabulary (e.g. "large" is a substring of "xlarge"; "small" of
 *    "xsmall"). No other part of the document uses backticks around
 *    vocabulary-shaped words, so counting `` `value` `` occurrences within
 *    the Components section is unambiguous.
 *  - Omitted sections drop the `##` heading entirely (headings present must
 *    stay in the spec's fixed order; omitting the heading — not leaving it
 *    empty — is what the spec means by "sections can be omitted") and leave
 *    a single HTML comment behind so a reader knows the gap is intentional,
 *    not a bug.
 *  - `opts.tokens` is a flat `Record<string, string>` keyed by dot-path
 *    mirroring the frontmatter schema: `colors.<name>`,
 *    `typography.<level>.<prop>`, `spacing.<scale>`, `rounded.<scale>`.
 *    Elevation & Depth has no dedicated token group in the DESIGN.md schema
 *    (spec.md L253-266) — it is prose-only and, since the Profile has no
 *    elevation-shaped field either, it is always omitted in v1.
 */

export interface EmitDesignMdOptions {
  /**
   * Flat token map, dot-path keyed: `colors.primary`,
   * `typography.body-md.fontSize`, `spacing.md`, `rounded.md`. Only the
   * groups with usable values render a section; everything else is
   * omitted with an explanatory comment.
   */
  tokens?: Record<string, string>;
}

const OMITTED_COMMENT = "<!-- section omitted: no token source supplied -->";

function humanizeVocabName(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Fold a YAML-parsed multiline prose string into one clean paragraph. */
function foldProse(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function withIndefiniteArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// ── Overview ─────────────────────────────────────────────────────────────

function renderOverview(profile: DSProfile): string {
  const description = profile.description ? foldProse(profile.description) : "";
  return `## Overview\n\n${description}`.trimEnd();
}

// ── Token-backed sections (Colors / Typography / Layout / Shapes) ─────────

interface ParsedTokens {
  colors: Record<string, string>;
  typography: Record<string, Record<string, string>>;
  spacing: Record<string, string>;
  rounded: Record<string, string>;
}

function groupTokens(tokens: Record<string, string> | undefined): ParsedTokens {
  const result: ParsedTokens = { colors: {}, typography: {}, spacing: {}, rounded: {} };
  if (!tokens) return result;

  for (const [path, value] of Object.entries(tokens)) {
    const segments = path.split(".");
    const [group, ...rest] = segments;
    if (group === "colors" && rest.length === 1) {
      result.colors[rest[0]] = value;
    } else if (group === "typography" && rest.length === 2) {
      const [level, prop] = rest;
      result.typography[level] ??= {};
      result.typography[level][prop] = value;
    } else if (group === "spacing" && rest.length === 1) {
      result.spacing[rest[0]] = value;
    } else if (group === "rounded" && rest.length === 1) {
      result.rounded[rest[0]] = value;
    }
    // Unrecognized groups/shapes (including a stray "elevation.*") are
    // silently ignored — the DESIGN.md schema has no group for them, so
    // there is nowhere spec-conformant to put them.
  }
  return result;
}

function frontmatterYaml(profile: DSProfile, parsed: ParsedTokens): string | undefined {
  const tokenLines: string[] = [];

  // Gated on the SAME condition as renderColorsSection (spec.md L126: at
  // least `primary` must be defined). Frontmatter and the `## Colors`
  // heading must stay in lockstep — emitting one without the other leaves
  // either an orphan frontmatter block or a lint-invalid heading.
  if (parsed.colors.primary) {
    tokenLines.push("colors:");
    for (const [name, value] of Object.entries(parsed.colors)) {
      tokenLines.push(`  ${name}: "${value}"`);
    }
  }

  const completeTypography = Object.entries(parsed.typography).filter(
    ([, props]) => props.fontFamily && props.fontSize,
  );
  if (completeTypography.length > 0) {
    tokenLines.push("typography:");
    for (const [level, props] of completeTypography) {
      tokenLines.push(`  ${level}:`);
      for (const [prop, value] of Object.entries(props)) {
        tokenLines.push(`    ${prop}: ${value}`);
      }
    }
  }

  if (Object.keys(parsed.rounded).length > 0) {
    tokenLines.push("rounded:");
    for (const [name, value] of Object.entries(parsed.rounded)) {
      tokenLines.push(`  ${name}: ${value}`);
    }
  }

  if (Object.keys(parsed.spacing).length > 0) {
    tokenLines.push("spacing:");
    for (const [name, value] of Object.entries(parsed.spacing)) {
      tokenLines.push(`  ${name}: ${value}`);
    }
  }

  // No token-backed section renders -> no frontmatter block at all (same
  // gating as before). Once frontmatter DOES render, `name` is the only
  // MUST top-level key (STRUCTURE.md §2/§6) and must come first.
  if (tokenLines.length === 0) return undefined;

  const lines: string[] = [`name: "${profile.name}"`];
  if (profile.description) {
    lines.push(`description: "${foldProse(profile.description)}"`);
  }
  lines.push(...tokenLines);

  return lines.join("\n");
}

function renderColorsSection(parsed: ParsedTokens): string {
  // MUST rule (spec.md L126): at least `primary` has to be defined for the
  // Colors section to be lint-clean. No usable primary -> omit, same as the
  // no-tokens case, rather than emit a section the linter will reject.
  if (!parsed.colors.primary) return OMITTED_COMMENT;

  const names = Object.keys(parsed.colors);
  const prose = names
    .map((name) => `- **${humanizeVocabName(name)} (${parsed.colors[name]}):** part of the palette.`)
    .join("\n");
  return `## Colors\n\nThe palette is defined by the following design tokens.\n\n${prose}`;
}

function renderTypographySection(parsed: ParsedTokens): string {
  const complete = Object.entries(parsed.typography).filter(
    ([, props]) => props.fontFamily && props.fontSize,
  );
  if (complete.length === 0) return OMITTED_COMMENT;

  const prose = complete
    .map(([level, props]) => `- **${level}:** ${props.fontFamily} at ${props.fontSize}.`)
    .join("\n");
  return `## Typography\n\nType levels are defined by the following design tokens.\n\n${prose}`;
}

function renderLayoutSection(parsed: ParsedTokens): string {
  if (Object.keys(parsed.spacing).length === 0) return OMITTED_COMMENT;

  const prose = Object.entries(parsed.spacing)
    .map(([name, value]) => `- **${name}:** ${value}.`)
    .join("\n");
  return `## Layout\n\nThe spacing scale is defined by the following design tokens.\n\n${prose}`;
}

function renderShapesSection(parsed: ParsedTokens): string {
  if (Object.keys(parsed.rounded).length === 0) return OMITTED_COMMENT;

  const prose = Object.entries(parsed.rounded)
    .map(([name, value]) => `- **${name}:** ${value}.`)
    .join("\n");
  return `## Shapes\n\nCorner radii are defined by the following design tokens.\n\n${prose}`;
}

// ── Components (every vocabulary value renders exactly once) ────────────

function renderComponentsSection(profile: DSProfile): string {
  const subsections = Object.entries(profile.vocabularies).map(([name, vocab]) => {
    const heading = humanizeVocabName(name);
    const description = foldProse(vocab.description);
    const values = vocab.values.map((value) => `\`${value}\``).join(", ");
    return `### ${heading}\n\n${description}\n\nAllowed values: ${values}.`;
  });

  return `## Components\n\n${subsections.join("\n\n")}`;
}

// ── Do's and Don'ts ───────────────────────────────────────────────────────

function renderDosAndDontsSection(profile: DSProfile): string {
  const pairs = Object.entries(profile.interaction_patterns).flatMap(([name, pattern]) => {
    const label = name.toLowerCase();
    const stateList = joinWithAnd(pattern.states);
    const bullets = [
      `- Do: give every ${label} component a distinct look for each of its states — ${stateList}.`,
      `- Don't: leave ${withIndefiniteArticle(label)} component without a visual treatment for any of these states.`,
    ];

    // Notes carry real constraint-shaped prose (see InteractionPattern.notes
    // in types/profile.ts) that the Do/Don't pair alone would silently
    // discard. Render them as additive bullets, verbatim (only whitespace-
    // folded, never rewritten). Notes with no renderable text are skipped.
    // Only state-keyed notes (key present in pattern.states, e.g. "pending",
    // "focused") are consumer guidance; other keys (e.g. "composition",
    // "token_mapping_pattern") are internal maintainer commentary that can
    // cite CDF-internal spec sections/jargon and must not leak into the
    // public artifact.
    if (pattern.notes) {
      for (const [key, text] of Object.entries(pattern.notes)) {
        if (!pattern.states.includes(key)) continue;
        const folded = foldProse(text);
        if (!folded) continue;
        bullets.push(`- Note (${key}): ${folded}`);
      }
    }

    return bullets;
  });

  return `## Do's and Don'ts\n\n${pairs.join("\n")}`;
}

// ── Entry point ──────────────────────────────────────────────────────────

export function emitDesignMd(profile: DSProfile, opts: EmitDesignMdOptions = {}): string {
  const parsed = groupTokens(opts.tokens);
  const frontmatter = frontmatterYaml(profile, parsed);

  const sections = [
    renderOverview(profile),
    renderColorsSection(parsed),
    renderTypographySection(parsed),
    renderLayoutSection(parsed),
    OMITTED_COMMENT, // Elevation & Depth — no dedicated token group in the schema (v1).
    renderShapesSection(parsed),
    renderComponentsSection(profile),
    renderDosAndDontsSection(profile),
  ];

  const body = sections.join("\n\n");

  if (frontmatter) {
    return `---\n${frontmatter}\n---\n\n# ${profile.name}\n\n${body}\n`;
  }
  return `# ${profile.name}\n\n${body}\n`;
}
