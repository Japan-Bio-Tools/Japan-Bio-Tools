import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";

export async function createMolstarPlugin(target: HTMLElement): Promise<PluginUIContext> {
  // HMR/再マウント時の衝突を避ける
  target.innerHTML = "";

  const spec = DefaultPluginUISpec();

  // ✅ 重要：renderReact18 を render として渡す
  const plugin = await createPluginUI({
    target,
    spec,
    render: renderReact18 as any,
  });

  return plugin;
}

export function disposeMolstarPlugin(plugin: PluginUIContext) {
  try {
    plugin.dispose();
  } catch {
    // ignore
  }
}
