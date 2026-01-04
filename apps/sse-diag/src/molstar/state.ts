// apps/sse-diag/src/molstar/state.ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';

export async function rebuildCartoonOnly(plugin: PluginContext) {
  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  if (!structures.length) return;

  // できるだけ「一旦消して → cartoon preset」を狙う
  for (const s of structures) {
    const cell = s.cell;
    try {
      // 既存 repr を削除
      const reprs = s.components?.flatMap((c: any) => c.representations ?? []) ?? [];
      for (const r of reprs) {
        try {
          await (plugin as any).builders.structure.representation.removeRepresentation(r.cell);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    // preset 適用（Mol* のビルダー差があるので段階的に試す）
    try {
      await (plugin as any).builders.structure.representation.applyPreset(cell, 'polymer-cartoon');
      continue;
    } catch {
      // ignore
    }
    try {
      await (plugin as any).builders.structure.representation.applyPreset(cell, 'default');
      continue;
    } catch {
      // ignore
    }
    // どうしてもダメなら何もしない（SSE override だけでも内部的には反映される）
  }
}
