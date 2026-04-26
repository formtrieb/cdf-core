import type { CDFComponent } from "./cdf.js";
import type { DSProfile } from "./profile.js";

export type OrphanType = "vocab-orphan" | "grammar-orphan" | "pattern-orphan";
export type OrphanScope = "profile-internal" | "cross-layer";

export interface ProfileOrphan {
  type: OrphanType;
  scope: OrphanScope;
  path: string;
  file?: string;
  line?: number;
  checked_against: string[];
  reason: string;
}

export interface SkippedCheck {
  check: OrphanType;
  reason: string;
}

export interface ProfileCoverageResult {
  profile: string;
  components_considered: number;
  checks_run: OrphanType[];
  checks_skipped: SkippedCheck[];
  orphans: ProfileOrphan[];
}

export interface CoverageInput {
  profile: DSProfile;
  profilePath?: string; // optional; used only for file-field on orphans
  components: CDFComponent[]; // empty array triggers cross-layer skips
}
