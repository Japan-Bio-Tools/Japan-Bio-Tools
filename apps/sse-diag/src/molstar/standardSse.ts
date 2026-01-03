import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import type { SseLabel } from '../domain/sse/types';
import { residueKeyToString } from '../domain/sse/compare';
import { SecondaryStructureProvider } from 'molstar/lib/mol-model-props/computed/secondary-structure';

export async function getMolstarStandardSse(plugin: PluginUIContext): Promise<Map<string, SseLabel>> {
  const out = new Map<string, SseLabel>();

  const structures = plugin.managers.structure.hierarchy.current.structures;
  for (const s of structures) {
    const structure = s.cell.obj?.data as any;
    if (!structure) continue;

    // computed SSE を保証
    await SecondaryStructureProvider.attach({ runtime: plugin.runtime } as any, structure);

    const ss: any = SecondaryStructureProvider.get(structure)?.value;
    if (!ss?.type) continue;

    const model: any = structure.model;
    const residues = model.atomicHierarchy.residues;
    const n: number = residues._rowCount;

    for (let i = 0; i < n; i++) {
      const chainId: string = residues.label_asym_id.value(i);
      const labelSeqId: number = residues.label_seq_id.value(i);

      // ここは “比較用の暫定マッピング”
      const t = ss.type[i];
      const label: SseLabel = (t === 0) ? 'C' : (t === 2) ? 'E' : 'H';

      out.set(residueKeyToString({ chainId, labelSeqId }), label);
    }
  }

  return out;
}
