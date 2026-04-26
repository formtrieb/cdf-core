export interface ProfileDiffChange {
  type: "added" | "removed" | "changed";
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface DiffImpact {
  vocabularies_changed: boolean;
  token_grammar_changed: boolean;
  theming_changed: boolean;
  interaction_patterns_changed: boolean;
  set_mapping_changed: boolean;
  token_layers_changed: boolean;
  extends_chain_changed: boolean;
}

export interface ProfileDiffResult {
  changes: ProfileDiffChange[];
  impact: DiffImpact;
}

export interface DiffOptions {
  raw?: boolean;       // default false → merge extends on both sides before diff
  section?: string;    // restrict diff to a single top-level section
}
