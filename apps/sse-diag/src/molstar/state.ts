// apps/sse-diag/src/molstar/state.ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { SecondaryStructureColorThemeProvider } from 'molstar/lib/mol-theme/color/secondary-structure';

type LogFn = (msg: string, data?: unknown) => void;
type ThemeRef = { name: string; params: Record<string, unknown> };

function getColorThemeRegistry(plugin: PluginContext): any {
  return (
    (plugin as any).representation?.structure?.themes?.colorThemeRegistry ??
    (plugin as any).managers?.structure?.themes?.colorThemeRegistry
  );
}

function ensureSecondaryStructureThemeRegistered(plugin: PluginContext, log?: LogFn) {
  const reg = getColorThemeRegistry(plugin);
  if (!reg) {
    log?.('[SSE-Diag] ensureSecondaryStructureThemeRegistered: registry not found');
    return;
  }
  try {
    // 多重登録だと例外になる実装があるので握りつぶし
    reg.add(SecondaryStructureColorThemeProvider);
    log?.('[SSE-Diag] ensureSecondaryStructureThemeRegistered: added');
  } catch (e) {
    log?.('[SSE-Diag] ensureSecondaryStructureThemeRegistered: add failed', {
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

function resolveSecondaryStructureTheme(_plugin: PluginContext, log?: LogFn): ThemeRef {
  // ここは固定でOK（Mol* 標準テーマ）
  const theme: ThemeRef = { name: 'secondary-structure', params: {} };
  log?.('[SSE-Diag] resolveSecondaryStructureTheme:', theme);
  return theme;
}

function collectRepresentationCells(plugin: PluginContext): any[] {
  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  const cells: any[] = [];

  for (const s of structures) {
    const comps = s.components ?? [];
    for (const c of comps) {
      const reprs = c.representations ?? [];
      for (const r of reprs) {
        const cell = r.cell;
        if (!cell?.transform?.params) continue;
        cells.push(cell);
      }
    }
  }

  return cells;
}

async function applyColorThemeByStateUpdate(plugin: PluginContext, theme: ThemeRef, log?: LogFn) {
  const cells = collectRepresentationCells(plugin);
  if (!cells.length) {
    log?.('[SSE-Diag] applyColorThemeByStateUpdate: no representation cells');
    return { updated: 0, failed: 0 };
  }

  const dataState: any = (plugin as any).state?.data;
  if (!dataState?.build) {
    log?.('[SSE-Diag] applyColorThemeByStateUpdate: plugin.state.data.build not found');
    return { updated: 0, failed: cells.length };
  }

  const b = dataState.build();
  let updated = 0;
  let failed = 0;

  for (const cell of cells) {
    try {
      const ref = cell.transform.ref ?? cell.ref;
      const oldParams = cell.transform.params ?? {};

      // ✅ 実際に使われているのは params.colorTheme（ログで chain-id がここに居た）
      const newParams = {
        ...oldParams,
        colorTheme: { name: theme.name, params: theme.params },
      };

      b.to(ref).update(newParams);
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  try {
    await b.commit();
  } catch (e) {
    log?.('[SSE-Diag] applyColorThemeByStateUpdate: commit failed', {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  return { updated, failed };
}

function debugDumpFirstReprTheme(plugin: PluginContext, log?: LogFn) {
  try {
    const cells = collectRepresentationCells(plugin);
    if (!cells.length) return;

    const p = cells[0]?.transform?.params;
    log?.('[SSE-Diag] repr theme debug:', {
      hasParams: !!p,
      colorTheme: p?.colorTheme,
    });
  } catch {
    // ignore
  }
}

export async function forceSecondaryStructureColorTheme(plugin: PluginContext, log?: LogFn): Promise<string> {
  const theme = resolveSecondaryStructureTheme(plugin, log);

  ensureSecondaryStructureThemeRegistered(plugin, log);

  // preset直後は 0ms でも1回 event loop を回すと安定することがある
  await new Promise((r) => setTimeout(r, 0));

  const result = await applyColorThemeByStateUpdate(plugin, theme, log);

  log?.('[SSE-Diag] forceSecondaryStructureColorTheme done:', {
    themeName: theme.name,
    updated: result.updated,
    failed: result.failed,
  });

  debugDumpFirstReprTheme(plugin, log);

  return theme.name;
}

/**
 * cartoon 表現を作り直す（既存reprを消して preset を再適用）
 * 最後に secondary structure coloring を強制して「色が変わる」観測を安定させる
 */
export async function rebuildCartoonOnly(plugin: PluginContext, log?: LogFn) {
  const hierarchy = (plugin as any).managers?.structure?.hierarchy?.current;
  const structures = hierarchy?.structures ?? [];
  if (!structures.length) return;

  for (const s of structures) {
    const cell = s.cell;

    // 既存reprをまとめて削除
    try {
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

    // presetを再適用（cartoon優先）
    try {
      await (plugin as any).builders.structure.representation.applyPreset(cell, 'polymer-cartoon');
      await forceSecondaryStructureColorTheme(plugin, log);
      continue;
    } catch {
      // ignore
    }

    // fallback
    try {
      await (plugin as any).builders.structure.representation.applyPreset(cell, 'default');
      await forceSecondaryStructureColorTheme(plugin, log);
      continue;
    } catch {
      // ignore
    }

    // どうしてもダメなら何もしない
  }
}
