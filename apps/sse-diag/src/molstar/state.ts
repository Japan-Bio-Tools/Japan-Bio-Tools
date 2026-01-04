// apps/sse-diag/src/molstar/state.ts
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

export async function rebuildCartoonOnly(plugin: PluginUIContext) {
  const hierarchy = plugin.managers.structure.hierarchy;
  const current = hierarchy.current;

  await plugin.dataTransaction(async () => {
    // 1) 既存の component/representation を全削除
    // （MVP：確実性優先。最適化は後で）
    const toRemove: string[] = [];
    for (const s of current.structures) {
      for (const c of s.components) toRemove.push(c.cell.transform.ref);
    }
    if (toRemove.length) {
      await hierarchy.remove(toRemove);
    }

    // 2) 各 structure から polymer component を作って cartoon を追加
    for (const s of current.structures) {
      const structureRef = s.cell.transform.ref;

      // polymer component を作る（Mol* が内部 selection で作る）
      const comp = await plugin.builders.structure.tryCreateComponentStatic(structureRef, 'polymer');
      if (!comp) continue;

      // cartoon rep を追加
      await plugin.builders.structure.representation.addRepresentation(comp, {
        type: 'cartoon',
        // 色は secondary-structure にしておくと、上書きが “目視で確実に分かる”
        color: 'secondary-structure',
      });
    }
  });
}
