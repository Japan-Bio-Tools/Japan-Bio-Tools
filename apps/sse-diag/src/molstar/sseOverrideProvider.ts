import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { CustomStructureProperty } from 'molstar/lib/mol-model-props/common/custom-structure-property';
import { Structure } from 'molstar/lib/mol-model/structure';

import { SecondaryStructureProvider } from 'molstar/lib/mol-model-props/computed/secondary-structure';
import { SecondaryStructure } from 'molstar/lib/mol-model/structure/model/properties/secondary-structure';

import type { SseEngineOutput, SseLabel } from '../domain/sse/types';
import { residueKeyToString } from '../domain/sse/compare';

/**
 * params（いまは最低限）
 * ※ PD.Params は使わない。PD.getDefaultValues を使う。
 */
export const OverrideSseParams = {
  enabled: PD.Boolean(true),
};
export type OverrideSseParams = PD.Values<typeof OverrideSseParams>;

type OverrideProps = { output: SseEngineOutput };

/**
 * output（WASM想定）を Mol* の SecondaryStructure 形式に変換
 * - Chainごと独立（keyに chainId を含めている）
 * - residue id は label_seq_id を使用
 */
function buildSecondaryStructure(structure: Structure, output: SseEngineOutput): SecondaryStructure {
  const model: any = (structure as any).model;
  const residues = model.atomicHierarchy.residues;
  const n: number = residues._rowCount;

  const wasmMap = new Map<string, SseLabel>();
  for (const r of output.residues) wasmMap.set(residueKeyToString(r), r.sse);

  // Mol* 内部 enum は変更されやすいので、存在するものを優先的に拾う
  const TypeObj: any = (SecondaryStructure as any).Type ?? {};
  const FlagObj: any = TypeObj.Flag ?? TypeObj;

  const HELIX = FlagObj.Helix ?? FlagObj.Alpha ?? 1;
  const BETA  = FlagObj.Beta ?? FlagObj.Sheet ?? 2;
  const NONE  = FlagObj.None ?? 0;

  const type = new Int8Array(n);
  type.fill(NONE);

  for (let i = 0; i < n; i++) {
    const chainId: string = residues.label_asym_id.value(i);
    const labelSeqId: number = residues.label_seq_id.value(i);
    const key = `${chainId}:${labelSeqId}`;

    const sse = wasmMap.get(key) ?? 'C';
    if (sse === 'H') type[i] = HELIX;
    else if (sse === 'E') type[i] = BETA;
    else type[i] = NONE;
  }

  // SecondaryStructure の実体は本来もう少し情報を持つが、Cartoon反映だけなら type が最重要
  return { type } as unknown as SecondaryStructure;
}

/**
 * ★ここが技術コア★
 * descriptor.name を SecondaryStructureProvider.descriptor.name と同一にすることで、
 * Mol* 標準の computed secondary structure を “強制上書き” する。
 */
export const OverrideSecondaryStructureProvider = CustomStructureProperty.createProvider<
  { params: typeof OverrideSseParams },
  SecondaryStructure,
  OverrideProps
>({
  label: 'SSE-Diag Override Secondary Structure',
  descriptor: { name: SecondaryStructureProvider.descriptor.name },
  type: 'local',

  defaultParams: PD.getDefaultValues(OverrideSseParams),
  getParams: () => OverrideSseParams,

  isApplicable: (s: Structure) => !!(s as any)?.model?.atomicHierarchy,

  obtain: async (_ctx, structure, props) => {
    const ss = buildSecondaryStructure(structure, props.output);
    return { value: ss };
  },
});

/**
 * 現在ロードされている structure に override を attach する
 */
export async function attachOverrideSse(plugin: PluginUIContext, output: SseEngineOutput) {
  // register（同名descriptorで上書きできるように）
  plugin.customStructureProperties.register(OverrideSecondaryStructureProvider, true);

  // 自動attachもON（なくても良いがMVPでは便利）
  plugin.customStructureProperties.setDefaultAutoAttach(
    OverrideSecondaryStructureProvider.descriptor.name,
    true
  );

  await plugin.dataTransaction(async () => {
    const structures = plugin.managers.structure.hierarchy.current.structures;
    for (const s of structures) {
      const structure = s.cell.obj?.data as Structure | undefined;
      if (!structure) continue;

      await plugin.customStructureProperties.attach(
        OverrideSecondaryStructureProvider.descriptor.name,
        structure,
        { output }
      );
    }
  });
}
