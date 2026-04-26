import type {
  SnapshotBlindSpot,
  SnapshotBlindSpotObject,
  SnapshotFinding,
  SnapshotFindings,
  SnapshotProfile,
} from "./types.js";

export type { SnapshotProfile, SnapshotFindings, SnapshotFinding } from "./types.js";

const EXPECTED_PROFILE_SCHEMA = "snapshot-profile-v1";
const EXPECTED_FINDINGS_SCHEMA = "snapshot-findings-v1";
const FINDINGS_CAP = 15;

export interface SnapshotRenderOptions {
  /** Override the prefix used in `<prefix>.snapshot.profile.yaml` references.
   *  Defaults to `metadata.ds_name`. */
  prefix?: string;
  /** Sink for the ds-name-mismatch warning. Defaults to `console.warn`. */
  onWarn?: (message: string) => void;
}

export function renderSnapshot(
  profile: SnapshotProfile,
  findings: SnapshotFindings,
  options: SnapshotRenderOptions = {},
): string {
  if (profile.snapshot_version !== EXPECTED_PROFILE_SCHEMA) {
    throw new Error(
      `render-snapshot: profile schema mismatch — expected ${EXPECTED_PROFILE_SCHEMA}, got ${String(
        profile.snapshot_version,
      )}`,
    );
  }
  if (findings.schema_version !== EXPECTED_FINDINGS_SCHEMA) {
    throw new Error(
      `render-snapshot: findings schema mismatch — expected ${EXPECTED_FINDINGS_SCHEMA}, got ${String(
        findings.schema_version,
      )}`,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(findings, "findings")) {
    throw new Error(
      "render-snapshot: findings YAML missing required top-level 'findings:' key (per snapshot-findings-v1 schema); synthesis MUST emit it (use [] for the empty-state case, never omit)",
    );
  }
  if (!Array.isArray(findings.findings)) {
    throw new Error(
      `render-snapshot: 'findings' must be an array (per snapshot-findings-v1 schema); got ${typeof findings.findings}`,
    );
  }
  if (findings.findings.length > FINDINGS_CAP) {
    throw new Error(
      `render-snapshot: findings count (${findings.findings.length}) exceeds cap (${FINDINGS_CAP}) — synthesis MUST prune before render`,
    );
  }

  const dsName = profile.metadata?.ds_name ?? "<unknown>";
  const generatedAt = profile.metadata?.generated_at ?? "";
  const tier = profile.metadata?.source?.tier ?? "?";
  const tokenRegime = profile.metadata?.source?.token_regime ?? "?";
  const upgradePath = (profile.upgrade_path ?? "").replace(/\s+$/, "");
  const prefix = options.prefix ?? dsName;
  const warn = options.onWarn ?? ((msg: string) => console.warn(msg));

  if (findings.ds_name && findings.ds_name !== dsName) {
    warn(
      `render-snapshot.sh: warning — ds_name mismatch (${dsName} vs ${findings.ds_name}); using profile value`,
    );
  }

  const banner = renderBanner({ dsName, prefix, generatedAt, tier, tokenRegime });
  const findingsSection = renderFindings(findings.findings);
  const blindSpotsSection = renderBlindSpots(profile.blind_spots ?? []);
  const upgradeSection = renderUpgrade({ upgradePath, dsName, prefix });

  // Layout mirrors render-snapshot.sh:
  //   `# <ds> — Snapshot\n\n` + BANNER + `\n\n` + hr + FINDINGS + hr + BLIND_SPOTS + hr + UPGRADE
  // hr := `---\n\n`. Each render_* helper handles its own internal trailing
  // whitespace so the joins below stay regular.
  // Bash heredoc adds \n after the last banner line, then `printf '\n\n'`
  // adds two more, then hr is `---\n\n`. Net 3 newlines between banner end
  // and the divider — matches bash byte-for-byte.
  return (
    `# ${dsName} — Snapshot\n\n` +
    banner +
    "\n\n\n" +
    "---\n\n" +
    findingsSection +
    "---\n\n" +
    blindSpotsSection +
    "---\n\n" +
    upgradeSection
  );
}

function renderBanner(args: {
  dsName: string;
  prefix: string;
  generatedAt: string;
  tier: string;
  tokenRegime: string;
}): string {
  const { dsName, prefix, generatedAt, tier, tokenRegime } = args;
  return [
    "> [!WARNING]",
    "> # ⚠ DRAFT — UNCLASSIFIED ⚠",
    ">",
    "> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ">",
    `> First-look snapshot of **${dsName}** produced by \`cdf-profile-snapshot\``,
    "> in ~5–10 min. **Not** a Production CDF Profile. Findings are",
    "> **unclassified** (no block / defer / adopt decisions). The companion",
    `> \`${prefix}.snapshot.profile.yaml\` carries \`_quality: draft\``,
    "> markers on every inferred section — sketch-grade.",
    ">",
    `> Generated ${generatedAt} · tier \`${tier}\` · token regime \`${tokenRegime}\`.`,
    ">",
    "> **For production-grade Profile authoring, run `/scaffold-profile`** —",
    "> see *Upgrade path* at the end of this document.",
  ].join("\n");
}

/**
 * jq's collapse helper: `gsub("\\s+"; " ") | sub("^\\s+"; "") | sub("\\s+$"; "")`.
 * Replace runs of whitespace with a single space, then trim ends.
 */
function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").replace(/^\s+/, "").replace(/\s+$/, "");
}

function renderFindings(items: SnapshotFinding[]): string {
  let out = `## Findings — flag-only (max ${FINDINGS_CAP})\n\n`;
  if (items.length === 0) {
    out += "_No findings surfaced in this snapshot pass._\n\n";
    return out;
  }
  out +=
    "These observations stood out during single-pass synthesis. They are\n" +
    "**NOT classified** — production classification (block / defer / adopt)\n" +
    "lives in `cdf-profile-scaffold` Phase 6.\n\n";
  for (const f of items) {
    out += `- **${f.topic}** — ${collapseWhitespace(f.observation)}\n  *Evidence:* \`${f.evidence_path}\`\n`;
  }
  out += "\n";
  return out;
}

function renderBlindSpots(items: SnapshotBlindSpot[]): string {
  let out =
    "## What this snapshot did NOT check\n\n" +
    "This is the honest list — read it before trusting anything above.\n\n";
  if (items.length === 0) {
    out +=
      "_No blind-spots declared. (This is unusual — Snapshot output without_\n" +
      "_explicit blind-spots violates the trust handshake. File a skill bug.)_\n\n";
    return out;
  }
  for (const item of items) {
    if (typeof item === "string") {
      out += `- ${item}\n`;
      continue;
    }
    out += renderStructuredBlindSpot(item);
  }
  out += "\n";
  out +=
    "If any of the items above matters for your evaluation, the Production\n" +
    "Scaffold (next section) covers them. The Snapshot deliberately does\n" +
    "not, in exchange for time-to-first-output.\n\n";
  return out;
}

function renderStructuredBlindSpot(item: SnapshotBlindSpotObject): string {
  let line = `- ${item.claim ?? "(missing claim)"}`;
  if (item.tool_survey) {
    const probed = item.tool_survey.probed ?? "(none)";
    const result = item.tool_survey.result ?? "(none)";
    const notProbed = item.tool_survey.tools_not_probed ?? [];
    line += `\n  - *Probe:* ${probed}`;
    line += `\n    *Result:* ${result}`;
    if (notProbed.length > 0) {
      line += `\n    *Tools not probed:* ${notProbed.join(", ")}`;
    }
  }
  return line + "\n";
}

function renderUpgrade(args: { upgradePath: string; dsName: string; prefix: string }): string {
  const { upgradePath, dsName, prefix } = args;
  let out = "## Upgrade path\n\n";
  if (upgradePath !== "") {
    out += `${upgradePath}\n\n`;
  }
  out +=
    "Want a Production-grade Profile? Run:\n\n" +
    "```\n/scaffold-profile\n```\n\n" +
    `against \`${dsName}\` for a validator-checkable Profile (~25–35 min, full\n` +
    "7-phase pipeline, classified findings, generator-consumable). The\n" +
    "Production Scaffold reads this snapshot’s\n" +
    `\`${prefix}.snapshot.profile.yaml\` as a Phase-1 seed (~5 min savings vs\n` +
    "from-scratch) and emits a validator-checkable\n" +
    `\`${prefix}.profile.yaml\` plus a fully classified \`${prefix}.findings.md\`.\n`;
  return out;
}
