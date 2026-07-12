export interface CandidateAxis {
  name: string;                    // 'interaction' | 'content' | 'validation' | 'selection' | 'readonly' | 'disclosure' | 'unclassified'
  values: string[];                // observed values; boolean axes: ['false','true']
  source: 'prior' | 'boolean-presence' | 'residue';
  defaultValue: string;            // implicit value when no atom of this axis is present in a composite
}
export type CellCoord = Record<string, string>;   // axisName → value
export interface ObservedCell { coord: CellCoord; rawValue: string; tokenBacked?: boolean }
export interface MissingCell { coord: CellCoord; question: string }
export interface DecollapseResult {
  input: { axisName: string; values: string[] };
  axes: CandidateAxis[];
  observedCells: ObservedCell[];
  missingCells: MissingCell[];
  residue: string[];               // raw values that produced unknown atoms
  truncated?: boolean;             // set true when productSize(axes) > MAX_PRODUCT (missingCells short-circuited to [])
}
