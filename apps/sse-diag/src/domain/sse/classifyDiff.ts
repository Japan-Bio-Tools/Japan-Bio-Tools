import type { DiffKind, DiffKindLabel, DiffRow, SseLabel } from './types';

export type DiffRowSeed = Pick<
  DiffRow,
  'residue_key' | 'display_residue' | 'baseline_label' | 'override_label'
>;

export type DiffClassificationStats = {
  kindCounts: Record<DiffKind, number>;
  otherCount: number;
  singletonCandidateCount: number;
  boundaryShiftCandidateCount: number;
};

export type ClassifiedDiffRowsResult = {
  rows: DiffRow[];
  stats: DiffClassificationStats;
};

type ResiduePosition = {
  chainId: string;
  labelSeqId: number;
};

type SeedWithKind = {
  seed: DiffRowSeed;
  baseKind: DiffKind;
  position: ResiduePosition | null;
};

type PositionedSeed = SeedWithKind & { position: ResiduePosition };

const KIND_LABELS: Record<DiffKind, DiffKindLabel> = {
  LabelFlip_HC: 'Helix/Coil反転',
  LabelFlip_EC: 'Sheet/Coil反転',
  LabelFlip_HE: 'Helix/Sheet反転',
  BoundaryShift: '境界ズレ',
  Singleton: '孤立差分',
  Other: 'その他',
};

const KIND_ORDER: Record<DiffKind, number> = {
  LabelFlip_HE: 100,
  LabelFlip_HC: 200,
  LabelFlip_EC: 300,
  BoundaryShift: 400,
  Singleton: 500,
  Other: 600,
};

/**
 * Classifies mapped diff rows into product-facing kinds and stable table sort order.
 * Caller must pass review-row seeds only (unmapped/ambiguous are intentionally excluded upstream).
 */
export function classifyDiffRows(seeds: DiffRowSeed[]): ClassifiedDiffRowsResult {
  const prepared = seeds.map((seed): SeedWithKind => ({
    seed,
    baseKind: classifyLabelPair(seed.baseline_label, seed.override_label),
    position: parseResidueKey(seed.residue_key),
  }));

  const singletonCandidates = detectSingletonCandidates(prepared);
  const boundaryShiftCandidates = detectBoundaryShiftCandidates(prepared);

  const rows = prepared
    .map(({ seed, baseKind }): DiffRow => {
      const kind = resolveKind(baseKind, seed.residue_key, singletonCandidates, boundaryShiftCandidates);
      return {
        ...seed,
        kind,
        kind_label: toKindLabel(kind),
        sort_key: toSortKey(kind),
        filterable: toFilterable(kind),
      };
    })
    .sort((a, b) => {
      if (a.sort_key !== b.sort_key) return a.sort_key - b.sort_key;
      const residueCmp = a.display_residue.localeCompare(b.display_residue);
      if (residueCmp !== 0) return residueCmp;
      return a.residue_key.localeCompare(b.residue_key);
    });

  const kindCounts = createKindCounts();
  for (const row of rows) {
    kindCounts[row.kind] += 1;
  }

  return {
    rows,
    stats: {
      kindCounts,
      otherCount: kindCounts.Other,
      singletonCandidateCount: singletonCandidates.size,
      boundaryShiftCandidateCount: boundaryShiftCandidates.size,
    },
  };
}

export function toKindLabel(kind: DiffKind): DiffKindLabel {
  return KIND_LABELS[kind];
}

export function toSortKey(kind: DiffKind): number {
  return KIND_ORDER[kind];
}

function classifyLabelPair(baseline: SseLabel, override: SseLabel): DiffKind {
  if (
    (baseline === 'H' && override === 'C') ||
    (baseline === 'C' && override === 'H')
  ) {
    return 'LabelFlip_HC';
  }
  if (
    (baseline === 'E' && override === 'C') ||
    (baseline === 'C' && override === 'E')
  ) {
    return 'LabelFlip_EC';
  }
  if (
    (baseline === 'H' && override === 'E') ||
    (baseline === 'E' && override === 'H')
  ) {
    return 'LabelFlip_HE';
  }
  return 'Other';
}

function toFilterable(_kind: DiffKind): boolean {
  return true;
}

function createKindCounts(): Record<DiffKind, number> {
  return {
    LabelFlip_HC: 0,
    LabelFlip_EC: 0,
    LabelFlip_HE: 0,
    BoundaryShift: 0,
    Singleton: 0,
    Other: 0,
  };
}

function resolveKind(
  baseKind: DiffKind,
  residueKey: string,
  singletonCandidates: Set<string>,
  boundaryShiftCandidates: Set<string>
): DiffKind {
  // LabelFlip kinds are required by the R2.5 contract and must take precedence.
  if (baseKind !== 'Other') return baseKind;

  if (singletonCandidates.has(residueKey)) return 'Singleton';
  if (boundaryShiftCandidates.has(residueKey)) return 'BoundaryShift';
  return 'Other';
}

function parseResidueKey(residueKey: string): ResiduePosition | null {
  const lastColon = residueKey.lastIndexOf(':');
  if (lastColon <= 0 || lastColon >= residueKey.length - 1) return null;

  const chainId = residueKey.slice(0, lastColon);
  const labelSeqId = Number(residueKey.slice(lastColon + 1));
  if (!Number.isInteger(labelSeqId)) return null;
  return { chainId, labelSeqId };
}

function isBoundaryRelatedKind(kind: DiffKind): boolean {
  return kind === 'LabelFlip_HC' || kind === 'LabelFlip_EC' || kind === 'Other';
}

function detectSingletonCandidates(rows: SeedWithKind[]): Set<string> {
  const groups = toContiguousGroups(rows);
  const singletonResidues = new Set<string>();

  for (const group of groups) {
    if (group.length !== 1) continue;
    if (!isBoundaryRelatedKind(group[0].baseKind)) continue;
    singletonResidues.add(group[0].seed.residue_key);
  }

  return singletonResidues;
}

function detectBoundaryShiftCandidates(rows: SeedWithKind[]): Set<string> {
  const groups = toContiguousGroups(rows);
  const boundaryResidues = new Set<string>();

  for (const group of groups) {
    if (group.length < 2 || group.length > 3) continue;
    if (!group.every((entry) => isBoundaryRelatedKind(entry.baseKind))) continue;
    for (const entry of group) {
      boundaryResidues.add(entry.seed.residue_key);
    }
  }

  return boundaryResidues;
}

function toContiguousGroups(rows: SeedWithKind[]): PositionedSeed[][] {
  const positioned = rows
    .filter((row): row is PositionedSeed => row.position !== null)
    .sort((a, b) => {
      const chainCmp = a.position.chainId.localeCompare(b.position.chainId);
      if (chainCmp !== 0) return chainCmp;
      const seqCmp = a.position.labelSeqId - b.position.labelSeqId;
      if (seqCmp !== 0) return seqCmp;
      return a.seed.residue_key.localeCompare(b.seed.residue_key);
    });

  const groups: PositionedSeed[][] = [];
  let current: PositionedSeed[] = [];

  for (const row of positioned) {
    if (current.length === 0) {
      current = [row];
      continue;
    }

    const prev = current[current.length - 1];
    const sameChain = prev.position.chainId === row.position.chainId;
    const contiguous = row.position.labelSeqId === prev.position.labelSeqId + 1;
    if (sameChain && contiguous) {
      current.push(row);
      continue;
    }

    groups.push(current);
    current = [row];
  }

  if (current.length > 0) groups.push(current);
  return groups;
}
