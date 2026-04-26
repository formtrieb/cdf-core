import type { DSProfile } from "./profile.js";

export type ProvenanceAction = "added" | "overridden";

export interface ProvenanceEntry {
  action: ProvenanceAction;
  source: string;                // absolute path of profile that owns this field
  parent_source?: string;        // only set for action: "overridden"
  parent_value?: unknown;        // only set for action: "overridden"
  own_value?: unknown;           // only set for action: "overridden"
}

export interface ResolveExtendsResult {
  profile: string;               // canonicalized absolute path of the leaf profile
  extends_chain: string[];       // ordered root → leaf (length 1 if no extends)
  merged: DSProfile;             // structured parsed form
  provenance: Record<string, ProvenanceEntry>;  // dotted-path keys, non-baseline only
}
