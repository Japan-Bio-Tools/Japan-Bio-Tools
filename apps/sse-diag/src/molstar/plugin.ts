// apps/sse-diag/src/molstar/plugin.ts
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec, type PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

const DEFAULT_EXPANDED = false; // ← true にすると Mol* の左右パネルを常時展開

export async function createMolstarPlugin(target: HTMLElement): Promise<PluginUIContext> {
  // HMR/再マウント時の衝突を避ける
  target.innerHTML = '';

  // Mol* UI を「右ペイン内」に閉じ込めるためのクラス（App.css側で使用）
  target.classList.add('molstar-host');

  const base = DefaultPluginUISpec();
  const spec: PluginUISpec = {
    ...base,
    layout: {
      ...(base as any).layout,
      initial: {
        ...((base as any).layout?.initial ?? {}),
        isExpanded: DEFAULT_EXPANDED,
        showControls: true,
        controlsDisplay: 'reactive',
      },
    },
  };

  const plugin = await createPluginUI({
    target,
    spec,
    render: renderReact18,
  });

  // 保険：initial が効かないケース対策
  try {
    const layout: any = (plugin as any).layout;
    layout?.setProps?.({
      isExpanded: DEFAULT_EXPANDED,
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
