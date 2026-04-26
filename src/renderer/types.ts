/**
 * Renderer types — both findings and snapshot.
 */

// ─── Snapshot ─────────────────────────────────────────────────────────

export interface SnapshotBlindSpotObject {
  claim?: string;
  tool_survey?: {
    probed?: string;
    result?: string;
    tools_not_probed?: string[];
  };
}

export type SnapshotBlindSpot = string | SnapshotBlindSpotObject;

export interface SnapshotProfile {
  snapshot_version: string;
  metadata?: {
    ds_name?: string;
    generated_at?: string;
    source?: {
      tier?: string;
      token_regime?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  blind_spots?: SnapshotBlindSpot[];
  upgrade_path?: string;
  [key: string]: unknown;
}

export interface SnapshotFinding {
  topic: string;
  observation: string;
  evidence_path: string;
}

export interface SnapshotFindings {
  schema_version: string;
  ds_name?: string;
  generated_at?: string;
  findings: SnapshotFinding[];
}

// ─── Findings (Production Scaffold) ───────────────────────────────────

export type Cluster = "A" | "B" | "C" | "D" | "E" | "Y" | "Z";

export type FindingDecision =
  | "pending"
  | "block"
  | "defer"
  | "accept-as-divergence"
  | "adopt-DTCG"
  | "adopt-as-is"
  | "open-question"
  | string; // forward-compat

export interface FindingDefaultIfUnsure {
  decision: string;
  rationale?: string;
}

export interface Finding {
  id: string;
  cluster: Cluster | string;
  title: string;
  observation: string;
  user_decision: FindingDecision;
  source_phase?: number;
  discrepancy?: string;
  sot_recommendation?: string;
  plain_language?: string;
  concrete_example?: string;
  default_if_unsure?: FindingDefaultIfUnsure;
  threshold_met?: string;
  // Bash test fixtures show string | string[] | object[].
  instances?: string | Array<string | Record<string, unknown>>;
}

export interface FindingsSummary {
  total_findings: number;
  by_cluster: Partial<Record<Cluster, number>> & Record<string, number>;
  by_decision: Record<string, number>;
  ship_blockers: string[];
  deferred_findings?: string[];
}

export interface FindingsInput {
  schema_version: string;
  ds_name: string;
  generated_at?: string;
  findings: Finding[];
  summary: FindingsSummary;
}
