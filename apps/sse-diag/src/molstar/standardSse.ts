import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import type { SseLabel } from '../domain/sse/types';
import { residueKeyToString } from '../domain/sse/compare';

import { SecondaryStructureProvider } from 'molstar/lib/mol-model-props/computed/secondary-structure';
import { SecondaryStructureType } from 'molstar/lib/mol-model/structure/model/types';

type LogFn = (msg: string, data?: unknown) => void;

function typeToLabel(t: any): SseLabel {
  try {
    const SST: any = SecondaryStructureType as any;
    if (typeof SST.isSheet === 'function' && SST.isSheet(t)) return 'E';
    if (typeof SST.isHelix === 'function' && SST.isHelix(t)) return 'H';
    return 'C';
  } catch {
    return (t === 0) ? 'C' : (t === 2) ? 'E' : 'H';
  }
}

async function safeAttach(plugin: PluginUIContext, structure: any, log?: LogFn) {
  const ctx: any = { runtime: plugin.runtime, assetManager: (plugin as any).managers?.asset };
  try {
    await (SecondaryStructureProvider as any).attach(ctx, structure, void 0, true);
    log?.('[SSE-Diag] standardSse attach(…, true) OK');
    return;
  } catch {}
  try {
    await (SecondaryStructureProvider as any).attach(ctx, structure);
    log?.('[SSE-Diag] standardSse attach() OK');
  } catch (e) {
    log?.('[SSE-Diag] standardSse attach() failed:', e instanceof Error ? e.message : String(e));
  }
}

function colValue<T>(col: any, i: number): T | undefined {
  if (!col) return undefined;
  if (typeof col.value === 'function') return col.value(i) as T;
  return undefined;
}

export async function getMolstarStandardSse(
  plugin: PluginUIContext,
  log?: LogFn
): Promise<Map<string, SseLabel>> {
  const out = new Map<string, SseLabel>();
  let h = 0, e = 0, c = 0;

  const structures = plugin.managers.structure.hierarchy.current.structures;
  log?.('[SSE-Diag] standardSse structures:', structures.length);

  for (const s of structures) {
    const structure = s.cell.obj?.data as any;
    if (!structure) continue;

    await safeAttach(plugin, structure, log);

    const map: any = SecondaryStructureProvider.get(structure)?.value;
    const ok = !!map && typeof map.get === 'function';
    log?.('[SSE-Diag] standardSse provider map ok:', ok);
    if (!ok) continue;

    const units: any[] = structure.units ?? [];
    for (const u of units) {
      const unitId = u.invariantId ?? u.id ?? u;

      const ss: any = map.get(unitId) ?? map.get(u.id) ?? map.get(u.invariantId);
      if (!ss?.type || typeof ss.getIndex !== 'function') continue;

      const model: any = u.model;
      const residues = model.atomicHierarchy?.residues;
      const chains = model.atomicHierarchy?.chains;
      if (!residues || !chains) continue;

      const n: number = residues._rowCount;

      for (let ri = 0; ri < n; ri++) {
        const idx = ss.getIndex(ri as any) as number;
        if (idx < 0 || idx >= ss.type.length) continue;

        // ★修正ポイント：chainId は residues ではなく chains から引く
        const chainIndex = colValue<number>(residues.chain_index, ri);
        const chainId =
          (chainIndex !== undefined)
            ? (colValue<string>(chains.label_asym_id, chainIndex) ?? colValue<string>(chains.auth_asym_id, chainIndex))
            : undefined;

        // label_seq_id が無い構造もあり得るので fallback
        const labelSeqId =
          colValue<number>(residues.label_seq_id, ri) ?? colValue<number>(residues.auth_seq_id, ri);

        if (!chainId || labelSeqId === undefined) continue;

        const label: SseLabel = typeToLabel(ss.type[idx]);
        if (label === 'H') h++; else if (label === 'E') e++; else c++;

        out.set(residueKeyToString({ chainId, labelSeqId }), label);
      }
    }
  }

  log?.('[SSE-Diag] standardSse counts:', { H: h, E: e, C: c, unique: out.size });
  return out;
}
