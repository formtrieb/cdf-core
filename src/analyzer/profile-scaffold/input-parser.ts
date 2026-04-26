/**
 * ScaffoldInput — MCP-agnostic input contract for `cdf_profile_scaffold`.
 * Users produce this JSON via a transformer (see cdf/examples/scaffold-input/);
 * the tool never parses Figma/DTCG/Storybook directly.
 *
 * Schema: tokens (required) + modes (optional) + components (optional) +
 *         source metadata (optional). See design doc §1.
 */

export type TokenType =
  | "color"
  | "dimension"
  | "typography"
  | "shadow"
  | "number"
  | "string";

export interface ScaffoldInputToken {
  path: string;
  value: string | number;
  type: TokenType;
}

export type PropertyType = "variant" | "boolean" | "instance-swap" | "text";

export interface ScaffoldInputProperty {
  name: string;
  type: PropertyType;
  values?: string[];
}

export interface ScaffoldInputComponent {
  name: string;
  properties: ScaffoldInputProperty[];
  token_refs?: string[];
}

export interface ScaffoldInputMode {
  collection: string;
  values: string[];
}

export interface ScaffoldInputSource {
  kind: "figma" | "figma-console" | "dtcg" | "handwritten" | "code";
  ref?: string;
  date?: string;
}

export interface ScaffoldInput {
  tokens: ScaffoldInputToken[];
  modes?: ScaffoldInputMode[];
  components?: ScaffoldInputComponent[];
  source?: ScaffoldInputSource;
}

/**
 * Parsed input plus provenance warnings (D3: type/value-shape conflicts).
 * Optional arrays are normalized to `[]` at parse time, so downstream
 * callers can treat them as always-present.
 */
export interface ParsedScaffoldInput {
  tokens: ScaffoldInputToken[];
  modes: ScaffoldInputMode[];
  components: ScaffoldInputComponent[];
  source?: ScaffoldInputSource;
  warnings: string[];
}

const VALID_TOKEN_TYPES = new Set<TokenType>([
  "color",
  "dimension",
  "typography",
  "shadow",
  "number",
  "string",
]);

const VALID_PROPERTY_TYPES = new Set<PropertyType>([
  "variant",
  "boolean",
  "instance-swap",
  "text",
]);

const VALID_SOURCE_KINDS = new Set<ScaffoldInputSource["kind"]>([
  "figma",
  "figma-console",
  "dtcg",
  "handwritten",
  "code",
]);

export function parseScaffoldInput(rawJson: string): ParsedScaffoldInput {
  let raw: unknown;
  try {
    raw = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(
      `ScaffoldInput: invalid JSON — ${(err as Error).message}`,
    );
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ScaffoldInput must be a JSON object at the top level.");
  }
  const obj = raw as Record<string, unknown>;

  if (!("tokens" in obj)) {
    throw new Error("ScaffoldInput: `tokens` is required (may be an empty array).");
  }
  if (!Array.isArray(obj.tokens)) {
    throw new Error("ScaffoldInput: `tokens` must be an array.");
  }

  const warnings: string[] = [];

  const tokens: ScaffoldInputToken[] = obj.tokens.map((entry, i) =>
    parseToken(entry, i, warnings),
  );

  const modes: ScaffoldInputMode[] =
    obj.modes === undefined
      ? []
      : parseModes(obj.modes);

  const components: ScaffoldInputComponent[] =
    obj.components === undefined
      ? []
      : parseComponents(obj.components);

  const source = obj.source === undefined ? undefined : parseSource(obj.source);

  return { tokens, modes, components, source, warnings };
}

// ─── Token parsing ──────────────────────────────────────────────────────────

function parseToken(
  entry: unknown,
  index: number,
  warnings: string[],
): ScaffoldInputToken {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`ScaffoldInput: tokens[${index}] must be an object.`);
  }
  const t = entry as Record<string, unknown>;

  if (typeof t.path !== "string" || t.path.length === 0) {
    throw new Error(`ScaffoldInput: tokens[${index}].path must be a non-empty string.`);
  }
  if (typeof t.value !== "string" && typeof t.value !== "number") {
    throw new Error(`ScaffoldInput: tokens[${index}].value must be string or number.`);
  }
  if (typeof t.type !== "string" || !VALID_TOKEN_TYPES.has(t.type as TokenType)) {
    throw new Error(
      `ScaffoldInput: tokens[${index}].type must be one of ${[...VALID_TOKEN_TYPES].join(", ")}.`,
    );
  }

  const path = normalizeSeparator(t.path);
  const type = t.type as TokenType;
  const value = t.value;

  // D3: detect obvious type/value-shape mismatches, emit warning, don't override.
  if (type === "string" && typeof value === "string") {
    if (looksLikeColor(value)) {
      warnings.push(
        `tokens[${index}] (${t.path}): value "${value}" looks like a color but declared type is "string". Consider type: "color".`,
      );
    } else if (looksLikeDimension(value)) {
      warnings.push(
        `tokens[${index}] (${t.path}): value "${value}" looks like a dimension but declared type is "string". Consider type: "dimension".`,
      );
    }
  }

  return { path, value, type };
}

function normalizeSeparator(path: string): string {
  // Accept `.` or `/` as hierarchical separator; canonical form is `.`.
  return path.includes("/") && !path.includes(".")
    ? path.replace(/\//g, ".")
    : path;
}

function looksLikeColor(v: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)
    || /^rgba?\(/i.test(v)
    || /^hsla?\(/i.test(v);
}

function looksLikeDimension(v: string): boolean {
  return /^-?\d*\.?\d+(px|rem|em|ch|%|vh|vw)$/i.test(v);
}

// ─── Modes / Components / Source ────────────────────────────────────────────

function parseModes(raw: unknown): ScaffoldInputMode[] {
  if (!Array.isArray(raw)) {
    throw new Error("ScaffoldInput: `modes` must be an array when present.");
  }
  return raw.map((entry, i) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`ScaffoldInput: modes[${i}] must be an object.`);
    }
    const m = entry as Record<string, unknown>;
    if (typeof m.collection !== "string" || m.collection.length === 0) {
      throw new Error(`ScaffoldInput: modes[${i}].collection must be a non-empty string.`);
    }
    if (!Array.isArray(m.values) || !m.values.every((v) => typeof v === "string")) {
      throw new Error(`ScaffoldInput: modes[${i}].values must be a string array.`);
    }
    return { collection: m.collection, values: m.values as string[] };
  });
}

function parseComponents(raw: unknown): ScaffoldInputComponent[] {
  if (!Array.isArray(raw)) {
    throw new Error("ScaffoldInput: `components` must be an array when present.");
  }
  return raw.map((entry, i) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`ScaffoldInput: components[${i}] must be an object.`);
    }
    const c = entry as Record<string, unknown>;
    if (typeof c.name !== "string" || c.name.length === 0) {
      throw new Error(`ScaffoldInput: components[${i}].name must be a non-empty string.`);
    }
    if (!Array.isArray(c.properties)) {
      throw new Error(`ScaffoldInput: components[${i}].properties must be an array.`);
    }

    const properties = c.properties.map((p, j) => parseProperty(p, i, j));

    let token_refs: string[] | undefined;
    if (c.token_refs !== undefined) {
      if (!Array.isArray(c.token_refs) || !c.token_refs.every((r) => typeof r === "string")) {
        throw new Error(`ScaffoldInput: components[${i}].token_refs must be a string array.`);
      }
      token_refs = (c.token_refs as string[]).map(normalizeSeparator);
    }

    return { name: c.name, properties, token_refs };
  });
}

function parseProperty(
  raw: unknown,
  componentIndex: number,
  propertyIndex: number,
): ScaffoldInputProperty {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `ScaffoldInput: components[${componentIndex}].properties[${propertyIndex}] must be an object.`,
    );
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.name !== "string" || p.name.length === 0) {
    throw new Error(
      `ScaffoldInput: components[${componentIndex}].properties[${propertyIndex}].name must be a non-empty string.`,
    );
  }
  if (typeof p.type !== "string" || !VALID_PROPERTY_TYPES.has(p.type as PropertyType)) {
    throw new Error(
      `ScaffoldInput: components[${componentIndex}].properties[${propertyIndex}].type must be one of ${[...VALID_PROPERTY_TYPES].join(", ")}.`,
    );
  }

  const type = p.type as PropertyType;
  let values: string[] | undefined;
  if (p.values !== undefined) {
    if (!Array.isArray(p.values) || !p.values.every((v) => typeof v === "string")) {
      throw new Error(
        `ScaffoldInput: components[${componentIndex}].properties[${propertyIndex}].values must be a string array.`,
      );
    }
    values = p.values as string[];
  }

  if (type === "variant" && (values === undefined || values.length === 0)) {
    throw new Error(
      `ScaffoldInput: components[${componentIndex}].properties[${propertyIndex}] — variant properties require non-empty \`values\`.`,
    );
  }

  return { name: p.name, type, values };
}

function parseSource(raw: unknown): ScaffoldInputSource {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ScaffoldInput: `source` must be an object when present.");
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.kind !== "string" || !VALID_SOURCE_KINDS.has(s.kind as ScaffoldInputSource["kind"])) {
    throw new Error(
      `ScaffoldInput: source.kind must be one of ${[...VALID_SOURCE_KINDS].join(", ")}.`,
    );
  }
  const source: ScaffoldInputSource = { kind: s.kind as ScaffoldInputSource["kind"] };
  if (s.ref !== undefined) {
    if (typeof s.ref !== "string") throw new Error("ScaffoldInput: source.ref must be a string.");
    source.ref = s.ref;
  }
  if (s.date !== undefined) {
    if (typeof s.date !== "string") throw new Error("ScaffoldInput: source.date must be a string.");
    source.date = s.date;
  }
  return source;
}
