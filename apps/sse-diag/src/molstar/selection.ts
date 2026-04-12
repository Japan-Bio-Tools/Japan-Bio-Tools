import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { Loci } from 'molstar/lib/mol-model/loci';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';

/**
 * Mol* selection/focus adapter.
 * Receives residue keys from SSE-Diag state and applies highlight/select/camera actions only.
 */
type LogFn = (msg: string, data?: unknown) => void;

export type ResidueFocusResult = {
  residueKey: string;
  matchedStructures: number;
  highlightApplied: boolean;
  selectApplied: boolean;
  focusApplied: boolean;
};

type ResiduePosition = {
  chainId: string;
  labelSeqId: number;
};

function parseResidueKey(residueKey: string): ResiduePosition | null {
  const i = residueKey.lastIndexOf(':');
  if (i <= 0 || i >= residueKey.length - 1) return null;

  const chainId = residueKey.slice(0, i);
  const labelSeqId = Number(residueKey.slice(i + 1));
  if (!chainId || !Number.isInteger(labelSeqId)) return null;
  return { chainId, labelSeqId };
}

function getCurrentStructures(plugin: PluginUIContext): Structure[] {
  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  const out: Structure[] = [];

  for (const s of structures) {
    const structure: Structure | undefined = s?.cell?.obj?.data;
    if (structure) out.push(structure);
  }

  return out;
}

function toResidueSchema(chainId: string, labelSeqId: number) {
  return {
    items: [
      { label_asym_id: chainId, label_seq_id: labelSeqId },
      { auth_asym_id: chainId, auth_seq_id: labelSeqId },
    ],
  };
}

/** Applies highlight/select/focus to the residue represented by canonical residue_key. */
export function focusAndHighlightResidueByKey(
  plugin: PluginUIContext,
  residueKey: string,
  log?: LogFn
): ResidueFocusResult {
  const parsed = parseResidueKey(residueKey);
  const result: ResidueFocusResult = {
    residueKey,
    matchedStructures: 0,
    highlightApplied: false,
    selectApplied: false,
    focusApplied: false,
  };

  log?.('[SSE-Diag] focus requested:', { residueKey });

  if (!parsed) {
    log?.('[SSE-Diag] focus failed: residue_key parse error', { residueKey });
    return result;
  }

  const structures = getCurrentStructures(plugin);
  const schema = toResidueSchema(parsed.chainId, parsed.labelSeqId);
  let lociForAction: Loci | null = null;

  for (const structure of structures) {
    const loci = StructureElement.Schema.toLoci(structure, schema);
    if (Loci.isEmpty(loci)) continue;
    result.matchedStructures += 1;
    if (!lociForAction) lociForAction = loci;
  }

  if (!lociForAction) {
    log?.('[SSE-Diag] focus failed: residue not found in current structures', {
      residueKey,
      structures: structures.length,
    });
    return result;
  }

  try {
    log?.('[SSE-Diag] highlight requested:', { residueKey });
    (plugin as any).managers?.interactivity?.lociHighlights?.highlightOnly?.({ loci: lociForAction }, true);
    result.highlightApplied = true;
    log?.('[SSE-Diag] highlight applied:', { residueKey });
  } catch (e) {
    log?.('[SSE-Diag] highlight failed:', e instanceof Error ? e.message : String(e));
  }

  try {
    (plugin as any).managers?.interactivity?.lociSelects?.selectOnly?.({ loci: lociForAction }, true);
    result.selectApplied = true;
  } catch (e) {
    log?.('[SSE-Diag] selection mark failed:', e instanceof Error ? e.message : String(e));
  }

  try {
    log?.('[SSE-Diag] focus requested (camera):', { residueKey });
    (plugin as any).managers?.camera?.focusLoci?.(lociForAction, { durationMs: 250 });
    result.focusApplied = true;
    log?.('[SSE-Diag] focus applied:', { residueKey });
  } catch (e) {
    log?.('[SSE-Diag] focus failed:', e instanceof Error ? e.message : String(e));
  }

  return result;
}

/** Clears Mol* visual selection markers when table selection is reset. */
export function clearDiffSelectionMarks(plugin: PluginUIContext, log?: LogFn): void {
  try {
    (plugin as any).managers?.interactivity?.lociHighlights?.clearHighlights?.();
  } catch (e) {
    log?.('[SSE-Diag] clear highlight failed:', e instanceof Error ? e.message : String(e));
  }

  try {
    (plugin as any).managers?.interactivity?.lociSelects?.deselectAll?.();
  } catch (e) {
    log?.('[SSE-Diag] clear selection failed:', e instanceof Error ? e.message : String(e));
  }
}
