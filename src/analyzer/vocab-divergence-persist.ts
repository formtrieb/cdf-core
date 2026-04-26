import { parseDocument, isScalar, isMap, Scalar } from "yaml";

export interface PersistArgs {
  /**
   * Concept path whose target description should be updated.
   * Supported shapes:
   *   - "vocabularies.<name>"
   *   - "interaction_patterns.<name>.states"
   */
  concept: string;
  /** ISO date, e.g. "2026-04-18". */
  date: string;
  /** Winning canonical value. */
  canonical: string;
  /** Values that were renamed to canonical. */
  outliers: string[];
  /** Component names that were rewritten. */
  renamedIn: string[];
  /** Short one-line evidence summary (e.g. "self 3/4, profile-declared"). */
  evidence: string;
}

/**
 * Append a dated decision line to the target description in a Profile YAML.
 * Preserves other sections, comments, and whitespace via yaml Document API.
 * Idempotent — if the identical decision line is already present, no-op.
 */
export function persistVocabDecision(profileYaml: string, args: PersistArgs): string {
  const doc = parseDocument(profileYaml);
  const targetKeyPath = resolveDescriptionPath(args.concept);
  if (!targetKeyPath) return profileYaml;

  const existing = readDescription(doc, targetKeyPath);
  const decisionLine = formatDecisionLine(args);

  if (existing && existing.includes(decisionLine)) return profileYaml;

  const nextDescription = existing
    ? `${existing.trimEnd()}\n\n${decisionLine}\n`
    : `${decisionLine}\n`;

  writeDescription(doc, targetKeyPath, nextDescription);
  return doc.toString();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type KeyPath = readonly string[];

function resolveDescriptionPath(concept: string): KeyPath | undefined {
  const vocabMatch = concept.match(/^vocabularies\.([^.]+)$/);
  if (vocabMatch) return ["vocabularies", vocabMatch[1], "description"];

  const patternMatch = concept.match(/^interaction_patterns\.([^.]+)\.states$/);
  if (patternMatch) return ["interaction_patterns", patternMatch[1], "description"];

  return undefined;
}

function readDescription(
  doc: ReturnType<typeof parseDocument>,
  path: KeyPath,
): string | undefined {
  const node = doc.getIn(path, true);
  if (isScalar(node) && typeof node.value === "string") return node.value;
  if (typeof node === "string") return node;
  return undefined;
}

function writeDescription(
  doc: ReturnType<typeof parseDocument>,
  path: KeyPath,
  value: string,
): void {
  // Ensure the parent map exists before writing the description.
  const parentPath = path.slice(0, -1);
  const parent = doc.getIn(parentPath, true);
  if (!isMap(parent)) return; // target concept doesn't exist in this profile — no-op

  // Use a block-literal scalar so multi-line text stays readable in the file.
  const scalar = new Scalar(value);
  scalar.type = Scalar.BLOCK_LITERAL;
  doc.setIn(path, scalar);
}

function formatDecisionLine(args: PersistArgs): string {
  const quotedOutliers = args.outliers.map(o => `\`${o}\``).join(", ");
  const renamed = args.renamedIn.length > 0 ? args.renamedIn.join(", ") : "(none)";
  return (
    `Decision ${args.date}: \`${args.canonical}\` chosen over ${quotedOutliers} ` +
    `per cdf_vocab_diverge resolution. Evidence: ${args.evidence}. ` +
    `Renamed in: ${renamed}.`
  );
}
