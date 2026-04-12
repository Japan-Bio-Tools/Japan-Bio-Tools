import type { ResidueKey, ResidueSseRecord, SseLabel } from './types';

export type SseDiff = ResidueKey & { molstar: SseLabel; wasm: SseLabel };

export type MappingClass =
  | 'mapped'
  | 'unmapped_baseline_only'
  | 'unmapped_override_only'
  | 'ambiguous';

export type MappingStats = {
  candidate_count: number;
  mapped_count: number;
  unmapped_baseline_only_count: number;
  unmapped_override_only_count: number;
  unmapped_total: number;
  ambiguous_count: number;
  mapped_rate: number;
};

export type SseMappingResult = {
  key_class: Map<string, MappingClass>;
  stats: MappingStats;
  mapped_override: Map<string, SseLabel>;
  diffs: SseDiff[];
};

export function residueKeyToString(k: ResidueKey): string {
  return `${k.chainId}:${k.labelSeqId}`;
}

export function diffSse(
  molstar: Map<string, SseLabel>,
  wasm: Map<string, SseLabel>
): SseDiff[] {
  const diffs: SseDiff[] = [];
  for (const [key, m] of molstar.entries()) {
    const w = wasm.get(key);
    if (!w) continue;
    if (m !== w) {
      const [chainId, seq] = key.split(':');
      diffs.push({ chainId, labelSeqId: Number(seq), molstar: m, wasm: w });
    }
  }
  return diffs;
}

export function buildSseMappingResult(
  baseline: Map<string, SseLabel>,
  overrideResidues: ResidueSseRecord[]
): SseMappingResult {
  const keyClass = new Map<string, MappingClass>();

  const overrideCounts = new Map<string, number>();
  const overrideSingleLabel = new Map<string, SseLabel>();
  const ambiguousKeys = new Set<string>();

  for (const residue of overrideResidues) {
    const key = residueKeyToString(residue);
    const nextCount = (overrideCounts.get(key) ?? 0) + 1;
    overrideCounts.set(key, nextCount);
    if (nextCount === 1) {
      overrideSingleLabel.set(key, residue.sse);
    } else {
      ambiguousKeys.add(key);
      overrideSingleLabel.delete(key);
    }
  }

  let mappedCount = 0;
  let unmappedBaselineOnlyCount = 0;

  for (const key of baseline.keys()) {
    if (ambiguousKeys.has(key)) {
      keyClass.set(key, 'ambiguous');
      continue;
    }

    if (overrideSingleLabel.has(key)) {
      keyClass.set(key, 'mapped');
      mappedCount += 1;
      continue;
    }

    keyClass.set(key, 'unmapped_baseline_only');
    unmappedBaselineOnlyCount += 1;
  }

  let unmappedOverrideOnlyCount = 0;
  for (const key of overrideCounts.keys()) {
    if (baseline.has(key)) continue;
    if (ambiguousKeys.has(key)) {
      keyClass.set(key, 'ambiguous');
      continue;
    }
    keyClass.set(key, 'unmapped_override_only');
    unmappedOverrideOnlyCount += 1;
  }

  const mappedOverride = new Map<string, SseLabel>();
  const diffs: SseDiff[] = [];

  for (const [key, baselineLabel] of baseline.entries()) {
    if (keyClass.get(key) !== 'mapped') continue;
    const overrideLabel = overrideSingleLabel.get(key);
    if (!overrideLabel) continue;
    mappedOverride.set(key, overrideLabel);
    if (baselineLabel !== overrideLabel) {
      const sep = key.lastIndexOf(':');
      const chainId = sep >= 0 ? key.slice(0, sep) : key;
      const seq = sep >= 0 ? key.slice(sep + 1) : '0';
      diffs.push({ chainId, labelSeqId: Number(seq), molstar: baselineLabel, wasm: overrideLabel });
    }
  }

  const candidateCount = baseline.size;
  const ambiguousCount = ambiguousKeys.size;
  const mappedRate = candidateCount === 0 ? 0 : mappedCount / candidateCount;

  return {
    key_class: keyClass,
    stats: {
      candidate_count: candidateCount,
      mapped_count: mappedCount,
      unmapped_baseline_only_count: unmappedBaselineOnlyCount,
      unmapped_override_only_count: unmappedOverrideOnlyCount,
      unmapped_total: unmappedBaselineOnlyCount + unmappedOverrideOnlyCount,
      ambiguous_count: ambiguousCount,
      mapped_rate: mappedRate,
    },
    mapped_override: mappedOverride,
    diffs,
  };
}
