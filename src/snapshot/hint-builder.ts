import type { HintContext } from './types.js';

export function hasStage1Context(ctx: HintContext): boolean {
  return Object.values(ctx).some((v) => v !== undefined);
}

export function buildHint(template: string, ctx: HintContext): string {
  if (!hasStage1Context(ctx)) {
    throw new Error('HintContext is empty — D3 forbids context-less hints');
  }

  const parts: string[] = [template];

  if (ctx.setCoverage !== undefined) {
    parts.push(`Used in ${ctx.setCoverage} component_sets.`);
  }
  if (ctx.valueCoverage !== undefined) {
    parts.push(`Value-coverage ${ctx.valueCoverage}%.`);
  }
  if (ctx.siblingVocabs && ctx.siblingVocabs.length > 0) {
    const siblings = ctx.siblingVocabs.map((v) => `'${v}'`).join(', ');
    parts.push(`sibling vocab ${siblings} carries an overlapping value-set.`);
  }
  if (ctx.modalValueSet) {
    parts.push(`Modal value-set is [${ctx.modalValueSet.join(', ')}].`);
  }
  if (ctx.outlierValue) {
    parts.push(`Outlier value: '${ctx.outlierValue}'.`);
  }
  if (ctx.jaccardSimilarity !== undefined && ctx.collisionMembers) {
    parts.push(
      `Jaccard ${ctx.jaccardSimilarity.toFixed(2)} between '${ctx.collisionMembers[0]}' and '${ctx.collisionMembers[1]}'.`,
    );
  }

  return parts.join(' ');
}
