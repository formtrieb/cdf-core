import type { CollisionFinding, SnapshotVocabulary } from '../types.js';

const JACCARD_THRESHOLD = 0.7;

export function detectCollisions(vocabs: SnapshotVocabulary[]): CollisionFinding[] {
  const findings: CollisionFinding[] = [];

  for (let i = 0; i < vocabs.length; i++) {
    for (let j = i + 1; j < vocabs.length; j++) {
      const a = vocabs[i];
      const b = vocabs[j];

      const jaccard = jaccardSimilarity(a.values, b.values);
      if (jaccard >= JACCARD_THRESHOLD) {
        findings.push(buildJaccardFinding(a, b, jaccard));
        continue; // don't double-report a-b as both Jaccard and casing
      }

      if (a.name.toLowerCase() === b.name.toLowerCase() && a.name !== b.name) {
        findings.push(buildCasingFinding(a, b));
      }
    }
  }

  return findings;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((v) => setB.has(v)).length;
  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0;
  return intersection / union;
}

function buildJaccardFinding(
  a: SnapshotVocabulary,
  b: SnapshotVocabulary,
  jaccard: number,
): CollisionFinding {
  const intersection = a.values.filter((v) => b.values.includes(v));
  return {
    type: 'collision',
    members: [a.name, b.name],
    evidence: `Jaccard ${jaccard.toFixed(2)} between '${a.name}' (${a.values.length} values) and '${b.name}' (${b.values.length} values); shared: [${intersection.join(', ')}]`,
    hintContext: {
      jaccardSimilarity: jaccard,
      collisionMembers: [a.name, b.name],
    },
    classificationCandidates: ['minor', 'medium', 'major'],
    suggestCanonical: a.setCoverage !== b.setCoverage,
  };
}

function buildCasingFinding(a: SnapshotVocabulary, b: SnapshotVocabulary): CollisionFinding {
  return {
    type: 'casing-collision',
    members: [a.name, b.name],
    evidence: `Case-insensitive name match: '${a.name}' vs '${b.name}'`,
    hintContext: {
      collisionMembers: [a.name, b.name],
    },
    classificationCandidates: ['minor', 'medium', 'major'],
    suggestCanonical: a.setCoverage !== b.setCoverage,
  };
}
