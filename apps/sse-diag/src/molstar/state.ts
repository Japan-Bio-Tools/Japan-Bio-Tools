// apps/sse-diag/src/molstar/state.ts
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { SecondaryStructureColorThemeProvider } from 'molstar/lib/mol-theme/color/secondary-structure';

/**
 * Mol* representation adapter helpers.
 * These utilities only apply/rebuild visual state and must not own comparison truth.
 */

export type LogFn = (msg: string, data?: unknown) => void;

function logf(log: LogFn | undefined, msg: string, data?: unknown) {
  if (!log) return;
  log(msg, data);
}

function getHierarchy(plugin: PluginUIContext): any {
  return (plugin as any).managers?.structure?.hierarchy?.current;
}

function getAllComponents(plugin: PluginUIContext): any[] {
  const h = getHierarchy(plugin);
  const structures: any[] = h?.structures ?? [];
  const comps: any[] = [];
  for (const s of structures) {
    const cs: any[] = s?.components ?? [];
    for (const c of cs) comps.push(c);
  }
  return comps;
}

function getFirstReprColorTheme(plugin: PluginUIContext) {
  const h = getHierarchy(plugin);
  const structures: any[] = h?.structures ?? [];
  for (const s of structures) {
    for (const c of s?.components ?? []) {
      for (const r of c?.representations ?? []) {
        const params = r?.cell?.transform?.params as any;
        if (params?.colorTheme) return params.colorTheme;
      }
    }
  }
  return null;
}

/**
 * Forces component coloring to Secondary Structure,
 * equivalent to applying Mol* "Set coloring -> Secondary Structure".
 */
export async function forceSecondaryStructureColorTheme(
  plugin: PluginUIContext,
  log?: LogFn
): Promise<string> {
  const themeName = (SecondaryStructureColorThemeProvider as any).name ?? 'secondary-structure';

  // 1) Ensure theme registration.
  try {
    const registry = (plugin as any).representation?.structure?.themes?.colorThemeRegistry;
    if (registry?.add) {
      try {
        registry.add(SecondaryStructureColorThemeProvider);
      } catch (e) {
        // "already registered" is acceptable.
        logf(log, '[SSE-Diag] ensureSecondaryStructureThemeRegistered', { err: String(e) });
      }
    }
  } catch {
    // ignore
  }

  // 2) Apply theme to all current polymer components.
  const comps = getAllComponents(plugin);
  if (comps.length === 0) {
    logf(log, '[SSE-Diag] forceSecondaryStructureColorTheme: no components yet');
    return themeName;
  }

  const mgr: any = (plugin as any).managers?.structure?.component;
  const fn = mgr?.updateRepresentationsTheme;
  if (typeof fn !== 'function') {
    logf(log, '[SSE-Diag] forceSecondaryStructureColorTheme: updateRepresentationsTheme missing');
    return themeName;
  }

  // Mol* v5.5 expects `{ color }` (not `{ colorTheme }`).
  await fn.call(mgr, comps, { color: themeName });

  // 3) Optional post-check log.
  const after = getFirstReprColorTheme(plugin);
  logf(log, '[SSE-Diag] forceSecondaryStructureColorTheme applied', { themeName, after });

  return themeName;
}

/**
 * Rebuilds cartoon representation after override apply/restore.
 * Reapplying presets can reset coloring, so forceSecondaryStructureColorTheme() is called at the end.
 */
export async function rebuildCartoonOnly(plugin: PluginUIContext, log?: LogFn): Promise<void> {
  const h = getHierarchy(plugin);
  const structures: any[] = h?.structures ?? [];
  logf(log, '[SSE-Diag] rebuild start:', { structures: structures.length });
  if (structures.length === 0) {
    logf(log, '[SSE-Diag] rebuild skipped: no structures');
    return;
  }

  for (const s of structures) {
    const cell = s?.cell;
    if (!cell) continue;

    // Prefer polymer-cartoon; fallback to default if unavailable.
    try {
      await (plugin as any).builders?.structure?.representation?.applyPreset?.(cell, 'polymer-cartoon');
      logf(log, '[SSE-Diag] rebuild preset applied:', 'polymer-cartoon');
    } catch (e) {
      logf(log, '[SSE-Diag] rebuild polymer-cartoon failed, fallback default:', e instanceof Error ? e.message : String(e));
      await (plugin as any).builders?.structure?.representation?.applyPreset?.(cell, 'default');
      logf(log, '[SSE-Diag] rebuild preset applied:', 'default');
    }
  }

  await forceSecondaryStructureColorTheme(plugin, log);
  logf(log, '[SSE-Diag] rebuild done');
}
