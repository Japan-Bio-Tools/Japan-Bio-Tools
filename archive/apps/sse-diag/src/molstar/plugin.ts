// apps/sse-diag/src/molstar/plugin.ts
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec, type PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

/**
 * Mol* host bootstrapping adapter.
 * This module owns Mol* mounting/disposal only; comparison/contract truth stays in SSE-Diag.
 */
const DEFAULT_EXPANDED = false; // true keeps Mol* side panels expanded.

export async function createMolstarPlugin(target: HTMLElement): Promise<PluginUIContext> {
  // Avoid collisions on remount/HMR.
  target.innerHTML = '';

  // Keep Mol* UI scoped to the right pane host.
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

  // Fallback for environments where initial layout props are ignored.
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
