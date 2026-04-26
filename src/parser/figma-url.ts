/**
 * Parse a canonical Figma URL into its identifying parts.
 *
 * Supported shapes:
 *   https://www.figma.com/design/<fileKey>/<name>?node-id=<nodeId>
 *   https://www.figma.com/file/<fileKey>/<name>?node-id=<nodeId>
 *   https://www.figma.com/board/<fileKey>/<name>?node-id=<nodeId>
 *   https://www.figma.com/design/<fileKey>/branch/<branchKey>/<name>?node-id=<nodeId>
 *
 * Figma's URLs encode node IDs with a dash ("138-342"), while the Figma API
 * expects a colon ("138:342"). This parser returns both: `nodeId` in API
 * form and `nodeIdUrl` in URL form, so callers can pick what they need.
 *
 * Throws with a descriptive message when the URL cannot be parsed — this
 * is intentional: a bad Figma URL in a profile is a configuration error
 * we want to surface loudly at parse time, not silently degrade.
 */
export interface ParsedFigmaUrl {
  fileKey: string;
  /** Node id in Figma API form (colon separator): "138:342". Absent when URL has no node-id. */
  nodeId?: string;
  /** Node id as it appears in the URL (dash separator): "138-342". */
  nodeIdUrl?: string;
  /** Path kind from the URL: "design", "file", "board". */
  kind: "design" | "file" | "board";
  /** Branch key, when the URL references a branch. */
  branchKey?: string;
}

const FIGMA_HOST_PATTERN = /^https:\/\/(?:www\.)?figma\.com\//;
const FIGMA_PATH_PATTERN =
  /^https:\/\/(?:www\.)?figma\.com\/(design|file|board)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?\/[^?]*(?:\?(.*))?$/;

export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("Figma URL is empty");
  }
  if (!FIGMA_HOST_PATTERN.test(url)) {
    throw new Error(
      `Figma URL must start with https://figma.com or https://www.figma.com — got: ${url}`
    );
  }

  const match = url.match(FIGMA_PATH_PATTERN);
  if (!match) {
    throw new Error(
      `Figma URL could not be parsed (expected /design|file|board/<fileKey>/...): ${url}`
    );
  }

  const [, kindRaw, fileKey, branchKey, queryString] = match;
  const kind = kindRaw as ParsedFigmaUrl["kind"];

  let nodeIdUrl: string | undefined;
  let nodeId: string | undefined;
  if (queryString) {
    const params = new URLSearchParams(queryString);
    nodeIdUrl = params.get("node-id") ?? undefined;
    if (nodeIdUrl) nodeId = nodeIdUrl.replace(/-/g, ":");
  }

  return { fileKey, nodeId, nodeIdUrl, kind, branchKey };
}
