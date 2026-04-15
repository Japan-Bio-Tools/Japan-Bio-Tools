import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { forceSecondaryStructureColorTheme } from './state';

/**
 * Mol* loading adapter.
 * It prepares structure/preset/theme in Mol* but does not decide comparison state.
 */
export async function loadMmcifText(plugin: PluginUIContext, mmcifText: string) {
  await plugin.clear();

  const data = await plugin.builders.data.rawData({ data: mmcifText, label: 'input.cif' });
  const trajectory = await plugin.builders.structure.parseTrajectory(data, 'mmcif');

  // Apply default presentation preset (including cartoon representation).
  await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
    representationPreset: 'auto',
  });

  // Keep coloring aligned with SSE-focused viewing.
  await forceSecondaryStructureColorTheme(plugin as any);
}
