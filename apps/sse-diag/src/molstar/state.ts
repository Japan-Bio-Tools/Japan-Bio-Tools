// apps/sse-diag/src/molstar/state.ts
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { SecondaryStructureColorThemeProvider } from 'molstar/lib/mol-theme/color/secondary-structure';

/**
 * 目的:
 * - Mol* の GUI: Component → polymer → Set coloring → (Residue Property) → Secondary Structure
 *   をコード側から強制する。
 *
 * 重要:
 * - Mol* v5.5.0 の updateRepresentationsTheme は
 *     updateRepresentationsTheme(components, { color, colorParams, ... })
 *   であり、{ colorTheme: ... } ではない。
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
 * 表示の coloring を「Secondary Structure」に寄せる
 * (= GUI の Set coloring を自動で押すのと同等)
 */
export async function forceSecondaryStructureColorTheme(
  plugin: PluginUIContext,
  log?: LogFn
): Promise<string> {
  const themeName = (SecondaryStructureColorThemeProvider as any).name ?? 'secondary-structure';

  // 1) テーマ登録（既に登録済みなら例外が出ても無視でOK）
  try {
    const registry = (plugin as any).representation?.structure?.themes?.colorThemeRegistry;
    if (registry?.add) {
      try {
        registry.add(SecondaryStructureColorThemeProvider);
      } catch (e) {
        // "already registered." 想定
        logf(log, '[SSE-Diag] ensureSecondaryStructureThemeRegistered', { err: String(e) });
      }
    }
  } catch {
    // ignore
  }

  // 2) すべての polymer component に対してテーマ適用
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

  // ★ここが本丸: { color } が正しい
  await fn.call(mgr, comps, { color: themeName });

  // 3) 反映確認ログ（任意）
  const after = getFirstReprColorTheme(plugin);
  logf(log, '[SSE-Diag] forceSecondaryStructureColorTheme applied', { themeName, after });

  return themeName;
}

/**
 * SSE override の後に cartoon 表示だけ作り直す（POC用途）
 *
 * - preset を再適用すると coloring がデフォルト（chain-id等）に戻るので、
 *   最後に forceSecondaryStructureColorTheme() を必ず呼ぶ。
 */
export async function rebuildCartoonOnly(plugin: PluginUIContext, log?: LogFn): Promise<void> {
  const h = getHierarchy(plugin);
  const structures: any[] = h?.structures ?? [];
  if (structures.length === 0) return;

  for (const s of structures) {
    const cell = s?.cell;
    if (!cell) continue;

    // polymer-cartoon があれば優先、ダメなら default
    try {
      await (plugin as any).builders?.structure?.representation?.applyPreset?.(cell, 'polymer-cartoon');
    } catch {
      await (plugin as any).builders?.structure?.representation?.applyPreset?.(cell, 'default');
    }
  }

  await forceSecondaryStructureColorTheme(plugin, log);
}
