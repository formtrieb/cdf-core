/**
 * Figma name → CDF name normalization.
 *
 * Plan 1.3.5 ships a minimalist v1.0 — whitespace cruft only:
 *   R1: trim leading/trailing whitespace
 *   R2: collapse internal multiple whitespace (space, tab, newline) to single space
 *
 * KEEPS literal (drift/helper/category/casing signal — see plan D1.3.5-G):
 *   - bracket/paren prefix ([v2], (deprecated))
 *   - leading underscore (Figma helper-component convention)
 *   - trailing (Copy), (N) (Figma duplication artifact)
 *   - slashes (preserves nested category for componentSetCategories)
 *   - casing (casing-collision-detector relies on raw casing)
 *
 * Rationale: snapshot is a mirror, not an iron. Drift/duplicate signal is
 * more valuable than silent merging. Future plans can tighten with empirical
 * evidence.
 */
export function normalizeFigmaName(rawName: string): string {
  return rawName.trim().replace(/\s+/g, ' ');
}
