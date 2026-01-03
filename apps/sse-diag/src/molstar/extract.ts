import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import type { ResidueKey } from '../domain/sse/types';

export function extractResidueKeys(plugin: PluginUIContext): ResidueKey[] {
  const out: ResidueKey[] = [];

  const structures = plugin.managers.structure.hierarchy.current.structures;
  for (const s of structures) {
    const structure = s.cell.obj?.data as any;
    if (!structure) continue;

    const model = structure.model as any;
    const residues = model.atomicHierarchy.residues;
    const n: number = residues._rowCount;

    for (let i = 0; i < n; i++) {
      const chainId: string = residues.label_asym_id.value(i);
      const labelSeqId: number = residues.label_seq_id.value(i);
      out.push({ chainId, labelSeqId });
    }
  }

  const seen = new Set<string>();
  return out.filter(r => {
    const k = `${r.chainId}:${r.labelSeqId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
