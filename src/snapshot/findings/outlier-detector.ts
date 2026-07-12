import type { OutlierFinding, SnapshotVocabulary } from '../types.js';

const VOCAB_ELIGIBILITY_THRESHOLD = 3;

interface WalkerLike {
  componentSets: Array<{
    name: string;
    rawName?: string;  // NEW Plan 1.3.5 — populated by walker-adapter; may equal name
    properties: Record<string, string[]>;
  }>;
}

export function detectOutliers(
  vocabs: SnapshotVocabulary[],
  walker: WalkerLike,
): OutlierFinding[] {
  const findings: OutlierFinding[] = [];

  for (const vocab of vocabs) {
    if (vocab.setCoverage < VOCAB_ELIGIBILITY_THRESHOLD) continue;

    // Build value → [setName] occurrence map AND retain rawName per setName.
    const valueOccurrences = new Map<string, string[]>();
    const rawNameByName = new Map<string, string>();
    for (const cset of walker.componentSets) {
      if (cset.rawName !== undefined) rawNameByName.set(cset.name, cset.rawName);
      const setValues = cset.properties[vocab.name];
      if (!setValues) continue;
      for (const v of setValues) {
        if (!valueOccurrences.has(v)) valueOccurrences.set(v, []);
        valueOccurrences.get(v)!.push(cset.name);
      }
    }

    // Determine modal values (values appearing in >= 2 sets).
    const modalValues: string[] = [];
    for (const [val, sets] of valueOccurrences.entries()) {
      if (sets.length >= 2) modalValues.push(val);
    }

    // No modal anchor → all values are equally rare → not an outlier-pattern.
    if (modalValues.length === 0) continue;

    for (const [val, sets] of valueOccurrences.entries()) {
      if (sets.length === 1) {
        const setName = sets[0];
        const rawName = rawNameByName.get(setName);
        const rawSuffix =
          rawName !== undefined && rawName !== setName
            ? ` (Figma raw: '${rawName}')`
            : '';
        findings.push({
          type: 'outlier',
          vocab: vocab.name,
          set: setName,
          outlierValue: val,
          evidence: `Modal value-set is [${modalValues.sort().join(', ')}]; '${val}' appears only in '${setName}'${rawSuffix}.`,
          hintContext: {
            modalValueSet: modalValues.sort(),
            outlierValue: val,
          },
        });
      }
    }
  }

  return findings;
}
