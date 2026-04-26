import {
  DEFAULT_GENERATED_BY,
  type ComponentPropertyDefinition,
  type ComponentSetEntry,
  type DocFrameEntry,
  type FigmaFile,
  type FigmaRestNode,
  type Phase1Output,
  type SeededFinding,
  type StandaloneRole,
  type WalkerOptions,
} from "./types.js";

const DOC_FRAME_RE = /^_?doc|docu|description/i;
const DOC_NAME_RE = /^_?doc|docu|description|guide/i;
const ICON_RE = /icon|illustration|logo|badge|glyph/i;
const UTILITY_RE = /focus|ring|divider|backdrop|scrim|overlay|surface/i;
const FRAME_N_RE = /^Frame [0-9]+$/;

function classifyStandalone(name: string): StandaloneRole {
  if (UTILITY_RE.test(name)) return "utility";
  if (DOC_NAME_RE.test(name)) return "documentation";
  if (ICON_RE.test(name)) return "asset";
  return "widget";
}

interface RawSet {
  id: string;
  name: string;
  page: string;
  variantCount: number;
  propertyDefinitions: Record<string, ComponentPropertyDefinition>;
}

interface RawStandalone {
  id: string;
  name: string;
  page: string;
}

interface RawDocFrame {
  id: string;
  name: string;
  type: string;
  page: string;
}

interface WalkerAccumulator {
  sets: RawSet[];
  standalones: RawStandalone[];
  docframes: RawDocFrame[];
}

function stripPreferredValues(
  defs: Record<string, ComponentPropertyDefinition> | undefined,
): Record<string, ComponentPropertyDefinition> {
  const out: Record<string, ComponentPropertyDefinition> = {};
  if (!defs) return out;
  for (const [key, def] of Object.entries(defs)) {
    const { preferredValues: _drop, ...rest } = def as ComponentPropertyDefinition & {
      preferredValues?: unknown;
    };
    out[key] = rest;
  }
  return out;
}

function walkNode(
  node: FigmaRestNode,
  pageName: string,
  parentType: string | undefined,
  acc: WalkerAccumulator,
): void {
  const id = node.id ?? "";
  const name = node.name ?? "";
  const type = node.type;

  if (type === "COMPONENT_SET" && id) {
    acc.sets.push({
      id,
      name,
      page: pageName,
      variantCount: (node.children ?? []).length,
      propertyDefinitions: stripPreferredValues(node.componentPropertyDefinitions),
    });
  } else if (type === "COMPONENT" && parentType !== "COMPONENT_SET" && id) {
    acc.standalones.push({ id, name, page: pageName });
  }

  if (name && DOC_FRAME_RE.test(name) && id) {
    acc.docframes.push({ id, name, type: type ?? "", page: pageName });
  }

  if (node.children) {
    for (const child of node.children) {
      walkNode(child, pageName, type, acc);
    }
  }
}

/**
 * Dedupe by `id`, keeping first occurrence, and sort lexicographically by
 * `id` to match jq's `group_by(.id) | map(.[0])` (group_by sorts by key).
 */
function dedupById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

function buildSeededFindings(args: {
  indexed: number;
  withDescription: number;
  treeUnique: number;
  remoteOnly: number;
  pagesContent: number;
  pageRatio: number;
  frameMatches: string[];
}): SeededFinding[] {
  const { indexed, withDescription, treeUnique, remoteOnly, pagesContent, pageRatio, frameMatches } =
    args;
  const findings: SeededFinding[] = [];

  // Mirror jq: (ratio * 1000 | floor) / 10 → 1-decimal percent.
  const descRatio = indexed > 0 ? withDescription / indexed : 0;

  if (indexed > 0 && descRatio < 0.1) {
    const pct = Math.floor(descRatio * 1000) / 10;
    findings.push({
      id: "§A",
      cluster: "E",
      title: "Systematic Figma-description gap",
      observation: `${withDescription} of ${indexed} sets (${pct}%) carry a Figma description`,
      threshold_met: "with_description/total < 0.1",
      sot_recommendation:
        "If doc-frames cover the missing semantics → accept-as-divergence (doc-frames are the SoT). Otherwise populate descriptions for LLM-authoring downstream.",
      default_if_unsure: {
        decision: "accept-as-divergence",
        rationale:
          "If doc-frames already carry the missing semantics, absent Figma descriptions are by design — not a ship-blocker. Promote to a different decision only after confirming doc-frame coverage.",
      },
      user_decision: "pending",
    });
  }

  if (remoteOnly > 0) {
    findings.push({
      id: "§C",
      cluster: "A",
      title: "Remote-library drift",
      observation: `${remoteOnly} component sets resolve only from remote library`,
      threshold_met: "remote_only_count > 0",
      sot_recommendation:
        "Check whether the remote library is an explicit DS dependency (vocabulary-source ≠ render-source by design) or a legacy unresolved reference. Former: record in Profile; latter: backlog.",
      plain_language: `${remoteOnly} of ${indexed} components in this Figma library resolve from a remote library — not from the local tree of this file. This can be intentional (a foundation library shared across multiple design systems) or legacy (a once-linked library whose components have moved or been deprecated).`,
      concrete_example: `Counts: ${remoteOnly} of ${indexed} total component sets are absent from the local tree (indexed_count − tree_unique_count = ${indexed} − ${treeUnique} = ${remoteOnly}).`,
      default_if_unsure: {
        decision: "accept-as-divergence",
        rationale:
          "Treating an external library as a vocabulary source is a common DS pattern; default to accept so the Profile ships, escalate only if the origin is genuinely unknown.",
      },
      user_decision: "pending",
    });
  }

  if (frameMatches.length > 0) {
    findings.push({
      id: "§Z-frame-named",
      cluster: "Z",
      title: "Abandoned-work candidates (Frame-N pattern)",
      observation: `${frameMatches.length} components match /^Frame \\d+$/`,
      instances: frameMatches,
      threshold_met: "pattern match count > 0",
      sot_recommendation:
        "Usually abandoned-work residue — default-named Figma frames that were never renamed. Confirm with DS team; drop if stale.",
      user_decision: "pending",
    });
  }

  if (pagesContent > 0 && pageRatio > 1.5) {
    findings.push({
      id: "§Z-page-ratio",
      cluster: "Z",
      title: "Separator/meta page dominance",
      observation: `pages.total/content ratio = ${Math.floor(pageRatio * 100) / 100}`,
      threshold_met: "ratio > 1.5",
      sot_recommendation:
        "File-organisation signal. Verify doc-frame conventions and whether separator-pages carry meaning (section headings) or are pure whitespace.",
      user_decision: "pending",
    });
  }

  return findings;
}

/**
 * Walk a parsed Figma REST file and produce a Phase-1-output object.
 *
 * Pure function: no FS-I/O, no clock reads when `options.generatedAt` is set.
 * Mirrors the bash pipeline `figma-phase1-extract.sh` → `extract-to-yaml.sh`.
 */
export function walkFigmaFile(file: FigmaFile, options: WalkerOptions = {}): Phase1Output {
  const generatedAt = options.generatedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const generatedBy = options.generatedBy ?? { ...DEFAULT_GENERATED_BY };

  const acc: WalkerAccumulator = { sets: [], standalones: [], docframes: [] };
  const pages = file.document.children;

  for (const page of pages) {
    const pageName = page.name ?? "";
    const pageType = page.type;
    for (const child of page.children ?? []) {
      walkNode(child, pageName, pageType, acc);
    }
  }

  const dedupedSets = dedupById(acc.sets);
  const dedupedStandalones = dedupById(acc.standalones);
  const dedupedDocframes = dedupById(acc.docframes);

  const standaloneByRole: Record<StandaloneRole, string[]> = {
    utility: [],
    documentation: [],
    widget: [],
    asset: [],
  };
  for (const s of dedupedStandalones) {
    standaloneByRole[classifyStandalone(s.name)].push(s.name);
  }

  const pagesEntries = pages.map((p) => ({
    name: p.name ?? "",
    childCount: (p.children ?? []).length,
  }));
  const pagesTotal = pagesEntries.length;
  const pagesContent = pagesEntries.filter((p) => p.childCount > 0).length;

  const componentSetsDict = file.componentSets ?? {};
  const indexed = Object.keys(componentSetsDict).length;
  const withDescription = Object.values(componentSetsDict).filter(
    (v) => typeof v.description === "string" && v.description.length > 0,
  ).length;
  const treeUnique = dedupedSets.length;
  const remoteOnly = indexed - treeUnique;

  const byPageMap = new Map<string, number>();
  for (const s of dedupedSets) {
    byPageMap.set(s.page, (byPageMap.get(s.page) ?? 0) + 1);
  }
  // Use UTF-16 codepoint order (matches jq's UTF-8 byte order for ASCII +
  // BMP-emoji boundaries — `localeCompare` puts emoji before ASCII in some
  // locales, which would break byte-parity with the bash transformer).
  const byPage = Array.from(byPageMap, ([name, count]) => ({ name, count })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  const allStandaloneNames = [
    ...standaloneByRole.utility,
    ...standaloneByRole.documentation,
    ...standaloneByRole.widget,
    ...standaloneByRole.asset,
  ];
  const allNames = [...dedupedSets.map((s) => s.name), ...allStandaloneNames];
  const frameMatches = Array.from(new Set(allNames.filter((n) => FRAME_N_RE.test(n)))).sort();

  const descRatio = indexed > 0 ? withDescription / indexed : 0;
  const pageRatio = pagesContent > 0 ? pagesTotal / pagesContent : 0;

  const seededFindings = buildSeededFindings({
    indexed,
    withDescription,
    treeUnique,
    remoteOnly,
    pagesContent,
    pageRatio,
    frameMatches,
  });

  const entries: ComponentSetEntry[] = dedupedSets;
  const docFrameSamples: DocFrameEntry[] = dedupedDocframes.slice(0, 5);

  return {
    schema_version: "phase-1-output-v1",
    generated_at: generatedAt,
    generated_by: generatedBy,
    figma_file: {
      file_key: options.fileKey ?? null,
      file_name: file.name && file.name !== "" ? file.name : null,
    },
    ds_inventory: {
      pages: {
        total: pagesTotal,
        content: pagesContent,
        separator_or_meta: pagesTotal - pagesContent,
      },
      component_sets: {
        total: indexed,
        tree_unique_count: treeUnique,
        remote_only_count: remoteOnly,
        by_page: byPage,
        entries,
      },
      standalone_components: standaloneByRole,
      figma_component_descriptions: {
        with_description: withDescription,
        without_description: indexed - withDescription,
        ratio: descRatio,
      },
      doc_frames_info: {
        count: dedupedDocframes.length,
        samples: docFrameSamples,
      },
    },
    libraries: {
      linked: [],
      remote_components: null,
    },
    token_regime: {
      detected: null,
      evidence: [],
    },
    theming_matrix: {
      collections: [],
    },
    seeded_findings: seededFindings,
    interpretation: [],
  };
}
