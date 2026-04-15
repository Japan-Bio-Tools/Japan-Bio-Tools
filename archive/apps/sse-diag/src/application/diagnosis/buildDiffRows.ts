import { classifyDiffRows } from '../../domain/sse/classifyDiff';
import type { SseMappingResult } from '../../domain/sse/compare';
import type { DiffRow } from '../../domain/sse/types';

export function buildDiffRows(
  mapping: SseMappingResult | null,
  residueDisplayLabels: Map<string, string>
): DiffRow[] {
  if (!mapping) return [];

  const seeds = mapping.diffs.map((diff) => {
    const residueKey = toResidueKey(diff.chainId, diff.labelSeqId);
    return {
      residue_key: residueKey,
      display_residue:
        residueDisplayLabels.get(residueKey) ?? `${diff.chainId}:${diff.labelSeqId}`,
      baseline_label: diff.molstar,
      override_label: diff.wasm,
    };
  });

  return classifyDiffRows(seeds).rows;
}

function toResidueKey(chainId: string, labelSeqId: number): string {
  return `${chainId}:${labelSeqId}`;
}
