// apps/sse-diag/src/molstar/standardSse.ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { ResidueIndex } from 'molstar/lib/mol-model/structure/model/indexing';

import { SecondaryStructureProvider } from 'molstar/lib/mol-model-props/computed/secondary-structure';

import type { SseLabel } from '../domain/sse/types';
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
function resolveChainId(model: any, ri: number): string | undefined {
  const residues: any = model?.atomicHierarchy?.residues;
  const chains: any = model?.atomicHierarchy?.chains;

  const direct =
    (colValue(residues?.label_asym_id, ri) as string | undefined) ??
    (colValue(residues?.auth_asym_id, ri) as string | undefined);
  if (direct) return direct;

  const chainIndex = asInt(colValue(residues?.chain_index, ri));
  if (chainIndex != null) {
    return (
      (colValue(chains?.label_asym_id, chainIndex) as string | undefined) ??
      (colValue(chains?.auth_asym_id, chainIndex) as string | undefined)
    );
  }

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

async function safeAttachSecondaryStructureProvider(plugin: PluginContext, structure: Structure, log?: LogFn) {
  const ctx: any = { runtime: (plugin as any).runtime, assetManager: (plugin as any).managers?.asset };
  try {
    await (SecondaryStructureProvider as any).attach(ctx, structure, void 0, true);
    log?.('[SSE-Diag] SecondaryStructureProvider.attach(ctx, structure, void0, true) OK');
    return;
  } catch (e) {
    log?.('[SSE-Diag] attach(…, true) failed:', e instanceof Error ? e.message : String(e));
  }
  try {
    await (SecondaryStructureProvider as any).attach(ctx, structure);
    log?.('[SSE-Diag] SecondaryStructureProvider.attach(ctx, structure) OK');
  } catch (e) {
    log?.('[SSE-Diag] attach(ctx, structure) failed:', e instanceof Error ? e.message : String(e));
  }
}

export async function getMolstarStandardSse(plugin: PluginContext, log?: LogFn): Promise<Map<string, SseLabel>> {
  const out = new Map<string, SseLabel>();

  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  log?.('[SSE-Diag] getMolstarStandardSse structures:', structures.length);

  for (const s of structures) {
    const structure: Structure | undefined = s.cell.obj?.data;
    if (!structure) continue;

    await safeAttachSecondaryStructureProvider(plugin, structure, log);

    const prop: any = (SecondaryStructureProvider as any).get?.(structure);
    if (!prop?.value) {
      log?.('[SSE-Diag] SecondaryStructureProvider.get(structure) returned null');
      continue;
    }

    const map: any = prop.value;
    const ok = !!map && typeof map.get === 'function' && typeof map.forEach === 'function';
    if (!ok) {
      log?.('[SSE-Diag] ss prop.value is not Map');
      continue;
    }

    const units: any[] = (structure as any).units ?? [];
    log?.('[SSE-Diag] getMolstarStandardSse units:', units.length);

    let added = 0;
    let skipped = 0;

    for (const u of units) {
      const unitId = u.invariantId ?? u.id ?? u;
      const ss = map.get(unitId);
      if (!ss?.type || typeof ss.getIndex !== 'function') continue;

      const model: any = u.model;
      const residues: any = model?.atomicHierarchy?.residues;
      const n: number = residues?._rowCount ?? 0;

      for (let ri = 0; ri < n; ri++) {
        const idx = ss.getIndex(ri as any as ResidueIndex) as number;
        if (idx < 0) continue;

        const chainId = resolveChainId(model, ri);
        const labelSeqId = resolveSeqId(residues, ri);
        if (!chainId || labelSeqId == null) {
          skipped++;
          continue;
        }

        const elemIndex = ss.key?.[idx];
        const elem = ss.elements?.[elemIndex];
        const kind = typeof elem?.kind === 'string' ? elem.kind.toLowerCase() : '';

        let sse: SseLabel = 'C';
        if (kind.includes('helix')) sse = 'H';
        else if (kind.includes('sheet') || kind.includes('beta')) sse = 'E';

        out.set(residueKeyToString({ chainId, labelSeqId }), sse);
        added++;
      }
    }

    log?.('[SSE-Diag] getMolstarStandardSse added/skipped:', { added, skipped });
  }

  log?.('[SSE-Diag] getMolstarStandardSse map size:', out.size);
  return out;
}
