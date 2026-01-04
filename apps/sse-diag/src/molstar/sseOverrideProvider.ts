// apps/sse-diag/src/molstar/sseOverrideProvider.ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { Model } from 'molstar/lib/mol-model/structure/model';
import type { ResidueIndex } from 'molstar/lib/mol-model/structure/model/indexing';

import { SecondaryStructure } from 'molstar/lib/mol-model/structure/model/properties/secondary-structure';
import { SecondaryStructureProvider } from 'molstar/lib/mol-model-props/computed/secondary-structure';

import type { SseEngineOutput, SseLabel } from '../domain/sse/types';
import { residueKeyToString } from '../domain/sse/compare';

type LogFn = (msg: string, data?: unknown) => void;

const NONE = { kind: 'none' } as const;
const HELIX = { kind: 'helix', flags: 0 as any, type_id: 'HELX_P', helix_class: '1', details: 'override' } as const;
const SHEET = { kind: 'sheet', flags: 0 as any, sheet_id: 'SHEET1' } as const;
const ELEMENTS = [NONE, HELIX, SHEET] as any;

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

function pickRepresentativeTypes(ssOld: any, log?: LogFn) {
  let helixType: number | undefined;
  let sheetType: number | undefined;

  const typeArr: any = ssOld?.type;
  const keyArr: any = ssOld?.key;
  const elements: any[] | undefined = ssOld?.elements;

  if (typeArr && keyArr && elements && typeof elements.length === 'number') {
    const len = typeArr.length ?? 0;
    for (let i = 0; i < len; i++) {
      const elemIndex = keyArr[i];
      const elem = elements[elemIndex];
      const kind = typeof elem?.kind === 'string' ? elem.kind.toLowerCase() : '';
      if (helixType === undefined && kind.includes('helix')) helixType = Number(typeArr[i]);
      if (sheetType === undefined && (kind.includes('sheet') || kind.includes('beta'))) sheetType = Number(typeArr[i]);
      if (helixType !== undefined && sheetType !== undefined) break;
    }
  }

  if (helixType === undefined || sheetType === undefined) {
    const uniq: number[] = [];
    const seen = new Set<number>();
    const len = typeArr?.length ?? 0;
    for (let i = 0; i < len; i++) {
      const v = Number(typeArr[i]);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      uniq.push(v);
    }
    uniq.sort((a, b) => a - b);
    helixType ??= uniq[0] ?? 1;
    sheetType ??= uniq[1] ?? uniq[0] ?? 2;
    log?.('[SSE-Diag] pickRepresentativeTypes fallback:', { uniq, helixType, sheetType });
  }

  return { helixType, sheetType };
}

function buildOverrideSecondaryStructureForUnit(model: Model, ssOld: any, override: Map<string, SseLabel>, log?: LogFn) {
  const residues: any = (model as any).atomicHierarchy?.residues;
  const n: number = residues?._rowCount ?? 0;

  const len = ssOld.type.length;
  const type = new Uint32Array(len);
  const key = new Int32Array(len);

  const { helixType, sheetType } = pickRepresentativeTypes(ssOld, log);

  let setH = 0, setE = 0, setC = 0, hit = 0, skippedChain = 0, skippedSeq = 0;

  for (let ri = 0; ri < n; ri++) {
    const idx = ssOld.getIndex(ri as any as ResidueIndex) as number;
    if (idx < 0 || idx >= len) continue;

    const chainId = resolveChainId(model, ri);
    if (!chainId) {
      skippedChain++;
      continue;
    }
    const labelSeqId = resolveSeqId(residues, ri);
    if (labelSeqId == null) {
      skippedSeq++;
      continue;
    }

    const k = residueKeyToString({ chainId, labelSeqId });
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
  } catch {}

  log?.('[SSE-Diag] unit override stats:', { modelResidues: n, ssLen: len, hit, skippedChain, skippedSeq, setH, setE, setC });

  return SecondaryStructure(type as any, key as any, ELEMENTS as any, ssOld.getIndex as any);
}

export async function applyOverrideSseToMolstarModel(plugin: PluginContext, output: SseEngineOutput, log?: LogFn) {
  const override = new Map<string, SseLabel>();
  for (const r of output.residues) override.set(residueKeyToString(r), r.sse);
  log?.('[SSE-Diag] override map size:', override.size);

  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  log?.('[SSE-Diag] hierarchy.structures:', structures.length);

  for (const s of structures) {
    const structure: Structure | undefined = s.cell.obj?.data;
    if (!structure) continue;

    await safeAttachSecondaryStructureProvider(plugin, structure, log);

    const prop: any = (SecondaryStructureProvider as any).get?.(structure);
    if (!prop) {
      log?.('[SSE-Diag] SecondaryStructureProvider.get(structure) returned null');
      continue;
    }

    const mapOld: any = prop.value;
    const oldIsMap = !!mapOld && typeof mapOld.get === 'function' && typeof mapOld.forEach === 'function';
    log?.('[SSE-Diag] ss prop:', { version: prop.version ?? '(none)', oldIsMap });

    if (!oldIsMap) {
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

    const prevVer = prop.version ?? 0;
    prop.value = mapNew;
    prop.version = prevVer + 1;

    log?.('[SSE-Diag] prop replaced:', { mapNewSize: mapNew.size, version: prop.version });
  }
}
