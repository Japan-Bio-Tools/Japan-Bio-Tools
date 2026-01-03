import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

export async function rebuildRepresentations(plugin: PluginUIContext) {
  // いまの “表示階層” を作り直す。Mol*内部状態の差分更新より安全。
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return;

  // “representation preset” を再適用（MVPの確実性優先）
  await plugin.managers.structure.component.updateRepresentations(structures, { type: 'auto' } as any);
}
