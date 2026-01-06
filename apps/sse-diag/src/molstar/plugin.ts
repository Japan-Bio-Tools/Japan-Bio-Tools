// apps/sse-diag/src/molstar/plugin.ts
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec, type PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

export async function createMolstarPlugin(target: HTMLElement): Promise<PluginUIContext> {
  // HMR/再マウント時の衝突を避ける
  target.innerHTML = '';

  // ✅ Mol* UI（左右パネル等）を「必ず展開」して起動する
  const base = DefaultPluginUISpec();
  const spec: PluginUISpec = {
    ...base,
    layout: {
      ...(base as any).layout,
      initial: {
        // ここがポイント：折りたたみを解除
        isExpanded: true,
        showControls: true,
        // "reactive" で十分。常時表示したいなら "always" でもOK
        controlsDisplay: 'reactive',
      },
    },
  };

  const plugin = await createPluginUI({
    target,
    spec,
    // ✅ 重要：React18レンダラ
    render: renderReact18,
  });

  // さらに保険（バージョン差異・埋め込み環境で initial が効かないケース対策）
  try {
    const layout: any = (plugin as any).layout;
    layout?.setProps?.({
      isExpanded: true,
      showControls: true,
      controlsDisplay: 'reactive',
    });
  } catch {
    // ignore
  }

  return plugin;
}

export function disposeMolstarPlugin(plugin: PluginUIContext) {
  try {
    plugin.dispose();
  } catch {
    // ignore
  }
}
