// apps/sse-diag/src/molstar/sseOverrideProvider.ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { Model } from 'molstar/lib/mol-model/structure/model';
import type { ResidueIndex } from 'molstar/lib/mol-model/structure/model/indexing';

import { SecondaryStructure } from 'molstar/lib/mol-model/structure/model/properties/secondary-structure';
import { SecondaryStructureProvider } from 'molstar/lib/mol-model-props/computed/secondary-structure';
import { SecondaryStructureType } from 'molstar/lib/mol-model/structure/model/types';

import type { SseEngineOutput, SseLabel } from '../domain/sse/types';
import { residueKeyToString } from '../domain/sse/compare';

type LogFn = (msg: string, data?: unknown) => void;

// MVP: Cartoon が動けばOKな最小 elements
const NONE = { kind: 'none' } as const;
const HELIX = {
  kind: 'helix',
  flags: 0 as any,
  type_id: 'HELX_P',
  helix_class: '1',
  details: 'override',
} as const;
const SHEET = {
  kind: 'sheet',
  flags: 0 as any,
  sheet_id: 'SHEET1',
} as const;

const ELEMENTS = [NONE, HELIX, SHEET] as any;

async function safeAttachSecondaryStructureProvider(plugin: PluginContext, structure: Structure, log?: LogFn) {
  const ctx: any = { runtime: plugin.runtime, assetManager: (plugin as any).managers?.asset };
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

function pickRepresentativeTypes(ssOld: any) {
  let helixType: any = undefined;
  let sheetType: any = undefined;

  const SST: any = SecondaryStructureType as any;
  const isHelix = typeof SST.isHelix === 'function' ? SST.isHelix.bind(SST) : (t: any) => t !== 0;
  const isSheet = typeof SST.isSheet === 'function' ? SST.isSheet.bind(SST) : (_t: any) => false;

  for (let i = 0; i < (ssOld.type?.length ?? 0); i++) {
    const t = ssOld.type[i];
    if (helixType === undefined && isHelix(t) && !isSheet(t)) helixType = t;
    if (sheetType === undefined && isSheet(t)) sheetType = t;
    if (helixType !== undefined && sheetType !== undefined) break;
  }

  helixType ??= SST.Flag?.Helix ?? 1;
  sheetType ??= SST.Flag?.Beta ?? SST.Flag?.Sheet ?? 2;

  return { helixType, sheetType };
}

function buildOverrideSecondaryStructureForUnit(
  model: Model,
  ssOld: any,
  override: Map<string, SseLabel>,
  log?: LogFn
) {
  const residues: any = (model as any).atomicHierarchy.residues;
  const n: number = residues._rowCount;

  const len = ssOld.type.length;

  const type = new Uint32Array(len);
  const key = new Int32Array(len);

  const { helixType, sheetType } = pickRepresentativeTypes(ssOld);

  let setH = 0, setE = 0, setC = 0, hit = 0;

  for (let ri = 0; ri < n; ri++) {
    const idx = ssOld.getIndex(ri as any as ResidueIndex) as number;
    if (idx < 0 || idx >= len) continue;

    const chainId: string = residues.label_asym_id.value(ri);
    const labelSeqId: number = residues.label_seq_id.value(ri);
    const k = `${chainId}:${labelSeqId}`;

    const sse = override.get(k);
    if (sse) hit++;

    const v: SseLabel = sse ?? 'C';

    if (v === 'H') {
      type[idx] = helixType;
      key[idx] = 1;
      setH++;
    } else if (v === 'E') {
      type[idx] = sheetType;
      key[idx] = 2;
      setE++;
    } else {
      type[idx] = 0;
      key[idx] = 0;
      setC++;
    }
  }

  try {
    (ELEMENTS[1] as any).flags = helixType;
    (ELEMENTS[2] as any).flags = sheetType;
  } catch {
    // ignore
  }

  log?.('[SSE-Diag] unit override stats:', { modelResidues: n, ssLen: len, hit, setH, setE, setC });

  return SecondaryStructure(type as any, key as any, ELEMENTS as any, ssOld.getIndex as any);
}

/**
 * Mol* の Structure computed property（SecondaryStructureProvider）を上書きする。
 * ✅ logger を渡すと “どこまで効いてるか” を詳細に追える
 */
export async function applyOverrideSseToMolstarModel(
  plugin: PluginContext,
  output: SseEngineOutput,
  log?: LogFn
) {
  const override = new Map<string, SseLabel>();
  for (const r of output.residues) override.set(residueKeyToString(r), r.sse);
  log?.('[SSE-Diag] override map size:', override.size);

  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  log?.('[SSE-Diag] hierarchy.structures:', structures.length);

  for (const s of structures) {
    const structure: Structure | undefined = s.cell.obj?.data;
    if (!structure) {
      log?.('[SSE-Diag] structure missing on cell');
      continue;
    }

    await safeAttachSecondaryStructureProvider(plugin, structure, log);

    const prop: any = (SecondaryStructureProvider as any).get?.(structure);
    if (!prop) {
      log?.('[SSE-Diag] SecondaryStructureProvider.get(structure) returned null');
      continue;
    }

    const mapOld: any = prop.value;
    const oldIsMap = !!mapOld && typeof mapOld.get === 'function' && typeof mapOld.forEach === 'function';
    let sampleKeyType: string | null = null;
    try {
      if (oldIsMap) {
        const it = mapOld.keys().next();
        if (!it.done) sampleKeyType = typeof it.value;
      }
    } catch {
      // ignore
    }

    log?.('[SSE-Diag] ss prop:', {
      version: prop.version ?? '(none)',
      oldIsMap,
      sampleKeyType,
    });

    if (!oldIsMap) {
      // まずは “入れ物が違う” ことをログで確定させる
      prop.value = new Map();
      prop.version = (prop.version ?? 0) + 1;
      log?.('[SSE-Diag] prop.value was not Map -> replaced with empty Map, version++');
      continue;
    }

    const units: any[] = (structure as any).units ?? [];
    log?.('[SSE-Diag] structure.units:', units.length);

    const mapNew = new Map<any, any>();
    let built = 0;

    for (const u of units) {
      const unitId = u.invariantId ?? u.id ?? u;
      const ssOld = mapOld.get(unitId);
      if (!ssOld?.type || typeof ssOld.getIndex !== 'function') continue;

      const ssNew = buildOverrideSecondaryStructureForUnit(u.model, ssOld, override, log);
      mapNew.set(unitId, ssNew);
      built++;
    }

    // units 経由で拾えないケースの保険（mapOldをそのまま舐める）
    if (built === 0) {
      log?.('[SSE-Diag] unitId lookup failed -> fallback to mapOld.forEach');
      mapOld.forEach((ssOld: any, unitId: any) => {
        const model: any =
          (structure as any).models?.[0] ??
          (structure as any).model ??
          (structure as any).units?.[0]?.model;
        if (!model || !ssOld?.type || typeof ssOld.getIndex !== 'function') return;
        const ssNew = buildOverrideSecondaryStructureForUnit(model, ssOld, override, log);
        mapNew.set(unitId, ssNew);
        built++;
      });
    }

    const prevVer = prop.version ?? 0;
    prop.value = mapNew;
    prop.version = prevVer + 1;

    log?.('[SSE-Diag] prop replaced:', { mapNewSize: mapNew.size, version: prop.version });
  }
}
