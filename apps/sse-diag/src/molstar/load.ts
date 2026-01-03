import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

export async function loadMmcifText(plugin: PluginUIContext, mmcifText: string) {
  await plugin.clear();

  const data = await plugin.builders.data.rawData({ data: mmcifText, label: 'input.cif' });
  const trajectory = await plugin.builders.structure.parseTrajectory(data, 'mmcif');

  // “表示 preset” を適用（Cartoonを含むデフォルト）
  await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
    representationPreset: 'auto',
  });
}
