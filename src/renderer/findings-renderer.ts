import { Document, Scalar } from "yaml";
import type { Finding, FindingsInput } from "./types.js";

export type { FindingsInput, Finding } from "./types.js";

const EXPECTED_SCHEMA = "findings-v1";
const Z_INLINE_THRESHOLD = 10;

const CLUSTER_LABELS: Record<string, string> = {
  A: "A · Token-Layer Architecture",
  B: "B · Theming & Coverage",
  C: "C · Component-Axis Consistency",
  D: "D · Accessibility Patterns",
  E: "E · Documentation Surfaces",
  Y: "Y · Placeholder-family",
  Z: "Z · Housekeeping",
};

function clusterLabel(cluster: string): string {
  return CLUSTER_LABELS[cluster] ?? cluster;
}

function assertSchema(input: FindingsInput): void {
  if (input.schema_version !== EXPECTED_SCHEMA) {
    throw new Error(
      `render-findings: schema mismatch — expected ${EXPECTED_SCHEMA}, got ${String(input.schema_version)}`,
    );
  }
}

function renderInstances(instances: Finding["instances"]): string {
  if (instances == null) return "";
  if (typeof instances === "string") {
    return instances === "" ? "" : `\n**Instance:** ${instances}`;
  }
  if (Array.isArray(instances) && instances.length > 0) {
    if (instances.every((i) => typeof i === "string")) {
      return `\n**Instances (${instances.length}):** ${(instances as string[]).join(", ")}`;
    }
    const lines = (instances as Array<string | Record<string, unknown>>).map((i) =>
      "  - " + (typeof i === "string" ? i : JSON.stringify(i)),
    );
    return `\n**Instances (${instances.length}):**\n${lines.join("\n")}`;
  }
  return "";
}

/**
 * Render one finding as a markdown block. Mirrors render-findings.sh
 * `render_finding_md` jq pipeline: Lever-5 prose fields take primacy
 * (`plain_language` → lead, `concrete_example` → "Example from your DS",
 * `default_if_unsure` → "Safe default"); technical observation collapses
 * into <details> when prose was used so the same point isn't said twice
 * in jargon and plain form.
 */
function renderFindingMd(f: Finding): string {
  const out: string[] = [];
  out.push(`### ${f.id} · ${f.title}`);
  out.push("");

  const hasPlain = typeof f.plain_language === "string" && f.plain_language !== "";
  if (hasPlain) {
    out.push(f.plain_language as string);
  } else {
    out.push(`**Observation:** ${f.observation}`);
  }

  if (typeof f.concrete_example === "string" && f.concrete_example !== "") {
    out.push("\n\n**Example from your DS:** " + f.concrete_example);
  } else {
    out.push("");
  }

  if (f.default_if_unsure?.decision) {
    const rationale = f.default_if_unsure.rationale ?? "(no rationale provided)";
    out.push(
      `\n\n**Safe default if unsure:** \`${f.default_if_unsure.decision}\` — ${rationale}`,
    );
  } else {
    out.push("");
  }

  out.push(`\n\n**User-Decision:** \`${f.user_decision}\``);

  if (hasPlain) {
    let detail = `\n\n<details><summary>Technical detail</summary>\n\n**Observation:** ${f.observation}`;
    if (typeof f.discrepancy === "string" && f.discrepancy !== "") {
      detail += `\n\n**Discrepancy:** ${f.discrepancy}`;
    }
    if (typeof f.sot_recommendation === "string" && f.sot_recommendation !== "") {
      detail += `\n\n**Source-of-Truth-Recommendation:** ${f.sot_recommendation}`;
    }
    detail += "\n\n</details>";
    out.push(detail);
  } else {
    let extras = "";
    if (typeof f.discrepancy === "string" && f.discrepancy !== "") {
      extras += `\n\n**Discrepancy:** ${f.discrepancy}`;
    }
    if (typeof f.sot_recommendation === "string" && f.sot_recommendation !== "") {
      extras += `\n\n**Source-of-Truth-Recommendation:** ${f.sot_recommendation}`;
    }
    out.push(extras);
  }

  out.push(renderInstances(f.instances));

  if (typeof f.threshold_met === "string" && f.threshold_met !== "") {
    out.push(`\n\n_seeded mechanically: ${f.threshold_met}_`);
  } else {
    out.push("");
  }

  out.push("");
  out.push("---");
  out.push("");

  // jq -r emits each item with a trailing newline; emulate by appending one
  // so successive findings concatenate to `---\n\n### next` (one blank line).
  return out.join("\n") + "\n";
}

function summaryBlock(input: FindingsInput): string {
  const s = input.summary;
  const lines: string[] = [];
  lines.push(`- **Total findings:** ${s.total_findings}`);

  const byClusterParts = Object.entries(s.by_cluster).map(([k, v]) => `${k}=${v}`);
  lines.push(`- **By cluster:** ${byClusterParts.join(", ")}`);

  const byDecisionParts = Object.entries(s.by_decision).map(([k, v]) => `${k}=${v}`);
  lines.push(`- **By decision:** ${byDecisionParts.join(", ")}`);

  if (s.ship_blockers.length > 0) {
    lines.push(
      `- **Ship blockers (${s.ship_blockers.length}) — STOPS RELEASE:** ${s.ship_blockers.join(", ")}`,
    );
  } else {
    lines.push("- **Ship blockers:** none — Profile is ship-ready.");
  }

  if (s.deferred_findings && s.deferred_findings.length > 0) {
    lines.push(
      `- **Deferred (${s.deferred_findings.length}) — advisory, Profile ships:** ${s.deferred_findings.join(", ")}`,
    );
  }

  return lines.join("\n");
}

export function renderFindingsMd(input: FindingsInput): string {
  assertSchema(input);
  const dsName = input.ds_name ?? "<unknown>";
  const generatedAt = input.generated_at ?? "";
  const zCount = input.summary.by_cluster?.Z ?? 0;
  const zInline = zCount <= Z_INLINE_THRESHOLD;

  let out = `# ${dsName} · Findings\n\n`;
  out += `_Generated ${generatedAt} from \`${dsName}.findings.yaml\` via \`scripts/render-findings.sh\`.\n`;
  out += `This document is a rendered view — edit the YAML, not this file._\n\n`;
  out += "## Summary\n\n";
  out += summaryBlock(input);
  out += "\n";

  // Per-cluster sections A→E, Y.
  for (const cl of ["A", "B", "C", "D", "E", "Y"] as const) {
    const items = input.findings.filter((f) => f.cluster === cl);
    if (items.length === 0) continue;
    out += `\n## Cluster ${clusterLabel(cl)}\n\n`;
    for (const f of items) out += renderFindingMd(f);
  }

  // Cluster Z handling.
  if (zInline) {
    const zItems = input.findings.filter((f) => f.cluster === "Z");
    if (zItems.length > 0) {
      out += `\n## Housekeeping (quality / naming) — ${zItems.length} entries\n\n`;
      for (const f of zItems) out += renderFindingMd(f);
    }
  } else {
    out += "\n## Housekeeping\n\n";
    out +=
      `${zCount} housekeeping (cluster Z) findings split to sibling file ` +
      `\`${dsName}.housekeeping.md\` per skill §4 threshold (>${Z_INLINE_THRESHOLD} entries).\n`;
  }

  return out;
}

export function renderHousekeepingMd(input: FindingsInput): string {
  assertSchema(input);
  const zCount = input.summary.by_cluster?.Z ?? 0;
  if (zCount <= Z_INLINE_THRESHOLD) return "";

  const dsName = input.ds_name ?? "<unknown>";
  const generatedAt = input.generated_at ?? "";

  let out = `# ${dsName} · Housekeeping\n\n`;
  out += `_Generated ${generatedAt}. Sibling to \`${dsName}.findings.md\` — split out\n`;
  out += `because cluster Z exceeded ${Z_INLINE_THRESHOLD} entries (${zCount}).\n`;
  out += `Edit \`${dsName}.findings.yaml\`; this file is rendered._\n\n`;
  for (const f of input.findings) {
    if (f.cluster === "Z") out += renderFindingMd(f);
  }
  return out;
}

export function renderShipBlockers(input: FindingsInput): string {
  assertSchema(input);
  const blockers = input.summary.ship_blockers ?? [];
  if (blockers.length === 0) return "No ship blockers.\n";
  const lines = [`Ship blockers (${blockers.length}):`];
  for (const id of blockers) lines.push(`  - ${id}`);
  return lines.join("\n") + "\n";
}

export function renderConformanceYaml(input: FindingsInput): string {
  assertSchema(input);
  const dsName = input.ds_name ?? "<unknown>";
  const generatedAt = input.generated_at ?? "";

  const divergences = input.findings
    .filter((f) => f.user_decision === "accept-as-divergence")
    .map((f) => ({
      finding_ref: `#${f.id}`,
      cluster: f.cluster,
      title: f.title,
      scope: "tbd",
      target: "tbd",
      status: "accepted",
      known_issue: f.observation,
      sunset: null,
    }));

  const overlay = {
    conformance_overlay: {
      profile: `${dsName}.profile.yaml`,
      generated: generatedAt,
      findings_source: `${dsName}.findings.yaml`,
      divergences,
    },
  };
  const doc = new Document(overlay);
  // Match yq: ISO-8601 timestamp emitted as double-quoted (so YAML 1.1
  // resolution can't reinterpret it as a Date); other quote-required strings
  // (e.g. `#§...` finding_refs which start with the YAML comment indicator)
  // get single-quotes to match yq's default style.
  const genNode = doc.getIn(["conformance_overlay", "generated"], true);
  if (genNode instanceof Scalar) genNode.type = Scalar.QUOTE_DOUBLE;
  return doc.toString({ indent: 2, lineWidth: 0, singleQuote: true });
}
