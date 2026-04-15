// apps/sse-diag/src/molstar/extract.ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type {
  BackboneAtomName,
  Coordinate3D,
  RawBackboneCarrier,
  SseResidueKey,
} from '../domain/sse/types';
import { residueKeyToString } from '../domain/sse/compare';

/**
 * Mol* extraction adapter.
 * This module only reads normalized structure data from Mol* and must not own comparison truth.
 */
type LogFn = (msg: string, data?: unknown) => void;

function colValue(col: any, row: number) {
  if (!col) return void 0;
  if (typeof col.value === 'function') return col.value(row);
  if (Array.isArray(col.value) || ArrayBuffer.isView(col.value)) return col.value[row];
  if (typeof col === 'function') return col(row);
  return void 0;
}

function asInt(v: any): number | undefined {
  if (v == null) return void 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : void 0;
}

function asFiniteNumber(v: any): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : void 0;
}

function resolveSeqId(residues: any, ri: number): number | undefined {
  return (
    asInt(colValue(residues.label_seq_id, ri)) ??
    asInt(colValue(residues.auth_seq_id, ri)) ??
    asInt(colValue(residues.seq_id, ri))
  );
}

function resolveAtomName(atoms: any, atomIndex: number): string | undefined {
  const raw =
    (colValue(atoms?.label_atom_id, atomIndex) as string | undefined) ??
    (colValue(atoms?.auth_atom_id, atomIndex) as string | undefined) ??
    (colValue(atoms?.atom_id, atomIndex) as string | undefined);
  if (!raw || typeof raw !== 'string') return void 0;
  const normalized = raw.trim().toUpperCase();
  return normalized.length > 0 ? normalized : void 0;
}

function toCoordinate3D(model: any, atomIndex: number): Coordinate3D | undefined {
  const x = asFiniteNumber(colValue(model?.atomicConformation?.x, atomIndex));
  const y = asFiniteNumber(colValue(model?.atomicConformation?.y, atomIndex));
  const z = asFiniteNumber(colValue(model?.atomicConformation?.z, atomIndex));
  if (x === undefined || y === undefined || z === undefined) return void 0;
  return [x, y, z];
}

/**
 * Resolves chain id with multiple fallbacks across Mol* hierarchy shapes.
 */
function resolveChainId(model: any, ri: number): string | undefined {
  const residues: any = model?.atomicHierarchy?.residues;
  const chains: any = model?.atomicHierarchy?.chains;

  // 1) residues 直
  const direct =
    (colValue(residues?.label_asym_id, ri) as string | undefined) ??
    (colValue(residues?.auth_asym_id, ri) as string | undefined);
  if (direct) return direct;

  // 2) residues.chain_index がある場合
  const chainIndex = asInt(colValue(residues?.chain_index, ri));
  if (chainIndex != null) {
    return (
      (colValue(chains?.label_asym_id, chainIndex) as string | undefined) ??
      (colValue(chains?.auth_asym_id, chainIndex) as string | undefined)
    );
  }

  // 3) Segments から辿る（今回のログ条件はほぼこれ）
  const segRes = model?.atomicHierarchy?.residueAtomSegments;
  const segChain = model?.atomicHierarchy?.chainAtomSegments;
  const offsets: any = segRes?.offsets;
  const chainIndexByAtom: any = segChain?.index;

  if (offsets && chainIndexByAtom && (offsets.length ?? 0) > ri) {
    const startAtom = offsets[ri];
    const ci = chainIndexByAtom[startAtom];
    if (ci != null && ci >= 0) {
      return (
        (colValue(chains?.label_asym_id, ci) as string | undefined) ??
        (colValue(chains?.auth_asym_id, ci) as string | undefined)
      );
    }
  }

  return void 0;
}

/** Extracts canonical residue keys from the current Mol* structure. */
export function extractResidueKeys(plugin: PluginContext, log?: LogFn): SseResidueKey[] {
  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  const structure = structures?.[0]?.cell?.obj?.data;

  if (!structure) {
    log?.('[SSE-Diag] extractResidueKeys: no structure');
    return [];
  }

  const unit0: any = (structure as any).units?.[0];
  const model: any = unit0?.model ?? (structure as any).models?.[0] ?? (structure as any).model;

  const residues: any = model?.atomicHierarchy?.residues;
  const chains: any = model?.atomicHierarchy?.chains;

  const n: number = residues?._rowCount ?? 0;
  log?.('[SSE-Diag] extractResidueKeys residue rows:', n);

  // Debug details kept to diagnose mmCIF/schema variants.
  log?.('[SSE-Diag] extractResidueKeys columns:', {
    residues_label_asym_id: !!residues?.label_asym_id,
    residues_auth_asym_id: !!residues?.auth_asym_id,
    residues_chain_index: !!residues?.chain_index,
    chains_label_asym_id: !!chains?.label_asym_id,
    chains_auth_asym_id: !!chains?.auth_asym_id,
    has_residueAtomSegments: !!model?.atomicHierarchy?.residueAtomSegments?.offsets,
    has_chainAtomSegments_index: !!model?.atomicHierarchy?.chainAtomSegments?.index,
    residues_label_seq_id: !!residues?.label_seq_id,
    residues_auth_seq_id: !!residues?.auth_seq_id,
  });

  const seen = new Set<string>();
  const out: SseResidueKey[] = [];

  let missingChain = 0;
  let missingSeq = 0;

  for (let ri = 0; ri < n; ri++) {
    const chainId = resolveChainId(model, ri);
    const labelSeqId = resolveSeqId(residues, ri);

    if (!chainId) {
      missingChain++;
      continue;
    }
    if (labelSeqId == null) {
      missingSeq++;
      continue;
    }

    const key = residueKeyToString({ chainId, labelSeqId });
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ chainId, labelSeqId });
  }

  out.sort((a, b) => (a.chainId === b.chainId ? a.labelSeqId - b.labelSeqId : a.chainId.localeCompare(b.chainId)));

  log?.('[SSE-Diag] extractResidueKeys result:', out.length);
  log?.('[SSE-Diag] extractResidueKeys missing:', { missingChain, missingSeq });
  log?.('[SSE-Diag] extractResidueKeys sample:', out.slice(0, 10));

  return out;
}

function resolveResidueName(residues: any, ri: number): string | undefined {
  const raw =
    (colValue(residues?.label_comp_id, ri) as string | undefined) ??
    (colValue(residues?.auth_comp_id, ri) as string | undefined) ??
    (colValue(residues?.comp_id, ri) as string | undefined);

  if (!raw || typeof raw !== 'string') return void 0;
  const trimmed = raw.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : void 0;
}

/** Extracts human-readable residue labels used for Diff table display only. */
export function extractResidueDisplayLabels(plugin: PluginContext, log?: LogFn): Map<string, string> {
  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  const structure = structures?.[0]?.cell?.obj?.data;
  const out = new Map<string, string>();

  if (!structure) {
    log?.('[SSE-Diag] extractResidueDisplayLabels: no structure');
    return out;
  }

  const unit0: any = (structure as any).units?.[0];
  const model: any = unit0?.model ?? (structure as any).models?.[0] ?? (structure as any).model;
  const residues: any = model?.atomicHierarchy?.residues;
  const n: number = residues?._rowCount ?? 0;

  for (let ri = 0; ri < n; ri++) {
    const chainId = resolveChainId(model, ri);
    const labelSeqId = resolveSeqId(residues, ri);
    if (!chainId || labelSeqId == null) continue;

    const residueName = resolveResidueName(residues, ri);
    const key = residueKeyToString({ chainId, labelSeqId });
    const label = residueName ? `${chainId}:${residueName}${labelSeqId}` : `${chainId}:${labelSeqId}`;
    if (!out.has(key)) out.set(key, label);
  }

  log?.('[SSE-Diag] extractResidueDisplayLabels result:', out.size);
  return out;
}

const REQUIRED_BACKBONE_ATOMS: BackboneAtomName[] = ['N', 'CA', 'C'];
const OPTIONAL_BACKBONE_ATOMS: BackboneAtomName[] = ['O'];

/**
 * Extracts raw backbone carrier from Mol* hierarchy for EngineInput v2.
 * This adapter only forwards structure-derived atom data and does not infer SSE truth.
 */
export function extractRawBackboneCarrier(
  plugin: PluginContext,
  residueKeys: SseResidueKey[],
  log?: LogFn
): RawBackboneCarrier {
  const emptyCarrier = createEmptyRawBackboneCarrier(residueKeys, 'molstar.atomic_hierarchy');
  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  const structure = structures?.[0]?.cell?.obj?.data;
  if (!structure) {
    log?.('[SSE-Diag] extractRawBackboneCarrier: no structure');
    return emptyCarrier;
  }

  const unit0: any = (structure as any).units?.[0];
  const model: any = unit0?.model ?? (structure as any).models?.[0] ?? (structure as any).model;
  const residues: any = model?.atomicHierarchy?.residues;
  const atoms: any = model?.atomicHierarchy?.atoms;
  const residueAtomSegments: any = model?.atomicHierarchy?.residueAtomSegments;
  const offsets: any = residueAtomSegments?.offsets;
  const rowCount: number = residues?._rowCount ?? 0;

  if (!offsets || rowCount === 0) {
    log?.('[SSE-Diag] extractRawBackboneCarrier: residue atom segments unavailable');
    return emptyCarrier;
  }

  const requested = new Map<string, { chainId: string; labelSeqId: number }>();
  const residueAtoms = new Map<string, Partial<Record<BackboneAtomName, Coordinate3D>>>();
  for (const residue of residueKeys) {
    const key = residueKeyToString(residue);
    requested.set(key, residue);
    residueAtoms.set(key, {});
  }

  let scannedRows = 0;
  for (let ri = 0; ri < rowCount; ri += 1) {
    const chainId = resolveChainId(model, ri);
    const labelSeqId = resolveSeqId(residues, ri);
    if (!chainId || labelSeqId == null) continue;
    const residueKey = residueKeyToString({ chainId, labelSeqId });
    if (!requested.has(residueKey)) continue;

    const start = asInt(offsets[ri]);
    const end = asInt(offsets[ri + 1]);
    if (start == null || end == null || end <= start) continue;
    scannedRows += 1;

    const atomMap = residueAtoms.get(residueKey);
    if (!atomMap) continue;

    for (let atomIndex = start; atomIndex < end; atomIndex += 1) {
      const atomName = resolveAtomName(atoms, atomIndex);
      if (!isBackboneAtom(atomName)) continue;
      if (atomMap[atomName]) continue;

      const coordinate = toCoordinate3D(model, atomIndex);
      if (!coordinate) continue;
      atomMap[atomName] = coordinate;
    }
  }

  let missingRequiredCount = 0;
  let missingOptionalCount = 0;
  const residuesOut: RawBackboneCarrier['residues'] = residueKeys.map((residue) => {
    const residueKey = residueKeyToString(residue);
    const atomsMap = residueAtoms.get(residueKey) ?? {};
    const missingRequiredAtoms = REQUIRED_BACKBONE_ATOMS.filter((atom) => !atomsMap[atom]);
    const missingOptionalAtoms = OPTIONAL_BACKBONE_ATOMS.filter((atom) => !atomsMap[atom]);
    if (missingRequiredAtoms.length > 0) missingRequiredCount += 1;
    if (missingOptionalAtoms.length > 0) missingOptionalCount += 1;
    return {
      chainId: residue.chainId,
      labelSeqId: residue.labelSeqId,
      residue_key: residueKey,
      atoms: atomsMap,
      has_required_backbone: missingRequiredAtoms.length === 0,
      missing_required_atoms: missingRequiredAtoms,
      missing_optional_atoms: missingOptionalAtoms,
    };
  });

  const carrier: RawBackboneCarrier = {
    source: 'molstar.atomic_hierarchy',
    required_atoms: REQUIRED_BACKBONE_ATOMS,
    optional_atoms: OPTIONAL_BACKBONE_ATOMS,
    residue_count: residuesOut.length,
    missing_required_count: missingRequiredCount,
    missing_optional_count: missingOptionalCount,
    residues: residuesOut,
  };

  log?.('[SSE-Diag] extractRawBackboneCarrier result:', {
    residue_count: carrier.residue_count,
    scanned_rows: scannedRows,
    missing_required_count: carrier.missing_required_count,
    missing_optional_count: carrier.missing_optional_count,
  });
  return carrier;
}

function createEmptyRawBackboneCarrier(
  residueKeys: SseResidueKey[],
  source: string
): RawBackboneCarrier {
  return {
    source,
    required_atoms: REQUIRED_BACKBONE_ATOMS,
    optional_atoms: OPTIONAL_BACKBONE_ATOMS,
    residue_count: residueKeys.length,
    missing_required_count: residueKeys.length,
    missing_optional_count: residueKeys.length,
    residues: residueKeys.map((residue) => ({
      chainId: residue.chainId,
      labelSeqId: residue.labelSeqId,
      residue_key: residueKeyToString(residue),
      atoms: {},
      has_required_backbone: false,
      missing_required_atoms: [...REQUIRED_BACKBONE_ATOMS],
      missing_optional_atoms: [...OPTIONAL_BACKBONE_ATOMS],
    })),
  };
}

function isBackboneAtom(atomName: string | undefined): atomName is BackboneAtomName {
  return atomName === 'N' || atomName === 'CA' || atomName === 'C' || atomName === 'O';
}
