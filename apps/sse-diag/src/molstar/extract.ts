// apps/sse-diag/src/molstar/extract.ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type { SseResidueKey } from '../domain/sse/types';
import { residueKeyToString } from '../domain/sse/compare';

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

function resolveSeqId(residues: any, ri: number): number | undefined {
  return (
    asInt(colValue(residues.label_seq_id, ri)) ??
    asInt(colValue(residues.auth_seq_id, ri)) ??
    asInt(colValue(residues.seq_id, ri))
  );
}

/**
 * chainId を頑丈に取る：
 * 1) residues.(label/auth)_asym_id
 * 2) residues.chain_index -> chains.(label/auth)_asym_id
 * 3) residueAtomSegments.offsets[ri] -> startAtom -> chainAtomSegments.index[startAtom] -> chains.(label/auth)_asym_id
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

  // デバッグ：列/segmentの存在（今回の原因究明用）
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
