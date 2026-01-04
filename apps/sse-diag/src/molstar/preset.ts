// apps/sse-diag/src/molstar/preset.ts
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context'

export async function applyDefaultPreset(plugin: PluginUIContext) {
  // “今ロードされている構造”に対して default 表現（cartoon等）を作る
  const structures = plugin.managers.structure.hierarchy.current.structures
  if (structures.length === 0) return

  // Mol* の “auto” は内部で preset を選ぶ
  // バージョン差分があるので、まずは一番通りやすいルートを使う
  // （あなたの今の state.ts が updateRepresentations を呼んでいた流れに合わせる）
  // @ts-expect-error - mol* internal API
  await plugin.managers.structure.component.updateRepresentations(structures[0], { type: 'auto' })
}
