// apps/sse-diag/src/components/MolstarSseDiagViewer.tsx
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

import { createMolstarPlugin, disposeMolstarPlugin } from '../molstar/plugin';
import type {
  ComparisonStatus,
  DiffRow,
  MetricValue,
  SseComparisonSummary,
  SseEngineOutput,
  SseEngineStage,
  SseLabel,
  SseResidueKey,
  SseViewMode,
} from '../domain/sse/types';
import { loadMmcifText } from '../molstar/load';
import { extractResidueKeys } from '../molstar/extract';
import { getMolstarStandardSse } from '../molstar/standardSse';
import { rebuildCartoonOnly, forceSecondaryStructureColorTheme } from '../molstar/state';

import { PrototypeRuleEngine } from '../domain/sse/engines/prototypeRuleEngine';
import { diffSse, residueKeyToString } from '../domain/sse/compare';
import { classifyDiffRows } from '../domain/sse/classifyDiff';
import {
  applyOverrideSseToMolstarModel,
  captureBaselineSecondaryStructureSnapshot,
  restoreBaselineSecondaryStructureSnapshot,
  type SecondaryStructureBaselineSnapshot,
} from '../molstar/sseOverrideProvider';
import { clearDiffSelectionMarks, focusAndHighlightResidueByKey } from '../molstar/selection';

type LogFn = (msg: string, data?: unknown) => void;

type OverrideOutputCache = {
  rangeLo: number;
  rangeHi: number;
  residueCount: number;
  output: SseEngineOutput;
};

export default function MolstarSseDiagViewer() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pluginRef = useRef<PluginUIContext | null>(null);

  const [fatal, setFatal] = useState<string | null>(null);
  const [mmcifText, setMmcifText] = useState('');
  const [rangeLo, setRangeLo] = useState(10);
  const [rangeHi, setRangeHi] = useState(20);
  const [viewMode, setViewMode] = useState<SseViewMode>('baseline');
  const [comparisonStatus, setComparisonStatus] = useState<ComparisonStatus>('baseline_only');
  const [hudExpanded, setHudExpanded] = useState(false);
  const [hudSummary, setHudSummary] = useState<SseComparisonSummary>(() =>
    createEmptyComparisonSummary('baseline_only', 'baseline')
  );
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [selectedDiffIndex, setSelectedDiffIndex] = useState<number | null>(null);

  const viewModeRef = useRef<SseViewMode>('baseline');
  const comparisonStatusRef = useRef<ComparisonStatus>('baseline_only');
  const baselineSnapshotRef = useRef<SecondaryStructureBaselineSnapshot | null>(null);
  const baselineMapRef = useRef<Map<string, SseLabel> | null>(null);
  const residueKeysRef = useRef<SseResidueKey[]>([]);
  const overrideOutputCacheRef = useRef<OverrideOutputCache | null>(null);
  const selectedDiffIndexRef = useRef<number | null>(null);
  const selectedResidueKeyRef = useRef<string | null>(null);
  const diffRowRefMap = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // UIログ（consoleに出なくても見える）
  const [logs, setLogs] = useState<string[]>([]);
  const pushLog: LogFn = (msg, data) => {
    const line =
      data === undefined
        ? String(msg)
        : `${msg} ${typeof data === 'string' ? data : safeJson(data)}`;

    // consoleにも出す（Vite側で見たい時用）
    // eslint-disable-next-line no-console
    console.log(line);

    setLogs((prev) => {
      const next = [...prev, line];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  };

  const engine = useMemo(
    () => new PrototypeRuleEngine([rangeLo, rangeHi]),
    [rangeLo, rangeHi]
  );

  const selectedDiffRow =
    selectedDiffIndex !== null && selectedDiffIndex >= 0 && selectedDiffIndex < diffRows.length
      ? diffRows[selectedDiffIndex]
      : null;
  const currentDiffIndexText = formatCurrentDiffIndex(selectedDiffIndex, diffRows.length);

  const prevDisabled =
    diffRows.length === 0 ||
    (selectedDiffIndex !== null && selectedDiffIndex <= 0);
  const nextDisabled =
    diffRows.length === 0 ||
    (selectedDiffIndex !== null && selectedDiffIndex >= diffRows.length - 1);

  useEffect(() => {
    const selected = selectedDiffRow;
    if (!selected) {
      pushLog('[SSE-Diag] no selection fallback:', {
        current_diff_index: currentDiffIndexText,
        current_class: DASH,
        selected_residue: DASH,
      });
      return;
    }

    const displayResidue = selected.display_residue?.trim();
    const resolvedResidue = displayResidue || DASH;
    if (!displayResidue) {
      pushLog('[SSE-Diag] selected residue display fallback:', {
        residue_key: selected.residue_key,
        fallback: DASH,
      });
    }

    pushLog('[SSE-Diag] current selection changed:', {
      index: selectedDiffIndex,
      total: diffRows.length,
      residue_key: selected.residue_key,
    });
    pushLog('[SSE-Diag] current class resolved:', {
      kind: selected.kind,
      kind_label: selected.kind_label,
    });
    pushLog('[SSE-Diag] selected residue resolved:', {
      display_residue: resolvedResidue,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDiffIndex, selectedDiffRow?.residue_key, diffRows.length]);

  useEffect(() => {
    pushLog('[SSE-Diag] HUD compact render summary:', {
      status: hudSummary.comparison_status,
      view: hudSummary.view_mode,
      engine_stage: formatEngineStageForHud(hudSummary),
      review_points: formatMetric(hudSummary.review_points_count),
      unmapped: formatMetric(hudSummary.unmapped_total),
      current_diff_index: currentDiffIndexText,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hudSummary.comparison_status,
    hudSummary.view_mode,
    hudSummary.engine_metadata?.engine_stage,
    hudSummary.review_points_count.available,
    hudSummary.review_points_count.value,
    hudSummary.unmapped_total.available,
    hudSummary.unmapped_total.value,
    currentDiffIndexText,
  ]);

  useEffect(() => {
    if (!hudExpanded) return;
    pushLog('[SSE-Diag] HUD expanded render summary:', {
      current_diff_index: currentDiffIndexText,
      current_class: selectedDiffRow?.kind_label ?? DASH,
      selected_residue: selectedDiffRow?.display_residue ?? DASH,
      mapped_rate: formatMappedRate(hudSummary),
      engine: formatEngineNameVersion(hudSummary),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hudExpanded,
    currentDiffIndexText,
    selectedDiffRow?.kind_label,
    selectedDiffRow?.display_residue,
    hudSummary.comparable_count.available,
    hudSummary.comparable_count.value,
    hudSummary.candidate_count.available,
    hudSummary.candidate_count.value,
    hudSummary.mapped_rate.available,
    hudSummary.mapped_rate.value,
    hudSummary.engine_metadata?.engine_name,
    hudSummary.engine_metadata?.engine_version,
  ]);

  function applySelectionState(
    nextIndex: number | null,
    rows: DiffRow[],
    reason: string,
    options?: { focus: boolean; logSelectionEvent?: boolean }
  ) {
    const prevIndex = selectedDiffIndexRef.current;
    const prevResidueKey = selectedResidueKeyRef.current;

    let resolvedIndex = nextIndex;
    if (resolvedIndex !== null && (resolvedIndex < 0 || resolvedIndex >= rows.length)) {
      resolvedIndex = null;
    }

    const nextRow = resolvedIndex === null ? null : rows[resolvedIndex];
    const nextResidueKey = nextRow?.residue_key ?? null;

    selectedDiffIndexRef.current = resolvedIndex;
    selectedResidueKeyRef.current = nextResidueKey;
    setSelectedDiffIndex(resolvedIndex);

    if (options?.logSelectionEvent) {
      pushLog('[SSE-Diag] diff row selected:', {
        reason,
        index: resolvedIndex,
        total: rows.length,
        residue_key: nextRow?.residue_key ?? null,
      });
    }

    if (prevIndex !== resolvedIndex || prevResidueKey !== nextResidueKey) {
      pushLog('[SSE-Diag] selected diff changed:', {
        reason,
        from: prevIndex,
        to: resolvedIndex,
        residue_key: nextResidueKey,
      });
      pushLog('[SSE-Diag] selected index changed:', {
        reason,
        from: prevIndex,
        to: resolvedIndex,
        residue_key: nextResidueKey,
        total: rows.length,
      });
    }

    if (options?.focus && nextRow) {
      focusDiffRow(nextRow, reason);
    } else if (!nextRow) {
      const plugin = pluginRef.current;
      if (plugin) clearDiffSelectionMarks(plugin, pushLog);
    }
  }

  function focusDiffRow(row: DiffRow, reason: string) {
    const plugin = pluginRef.current;
    if (!plugin) {
      pushLog('[SSE-Diag] focus skipped: plugin not ready', { reason, residue_key: row.residue_key });
      return;
    }

    const result = focusAndHighlightResidueByKey(plugin, row.residue_key, pushLog);
    pushLog('[SSE-Diag] focus/highlight result:', {
      reason,
      residue_key: row.residue_key,
      matchedStructures: result.matchedStructures,
      focusApplied: result.focusApplied,
      highlightApplied: result.highlightApplied,
      selectApplied: result.selectApplied,
    });
  }

  function onDiffRowClick(index: number) {
    applySelectionState(index, diffRows, 'table row click', { focus: true, logSelectionEvent: true });
  }

  function onPrevDiff() {
    pushLog('[SSE-Diag] Prev invoked:', {
      selected: selectedDiffIndexRef.current,
      total: diffRows.length,
    });
    if (diffRows.length === 0) return;

    const current = selectedDiffIndexRef.current;
    if (current === null) {
      pushLog('[SSE-Diag] no selection fallback:', { action: 'prev', fallbackIndex: 0 });
    }
    const nextIndex = current === null ? 0 : Math.max(0, current - 1);
    if (current !== null && nextIndex === current) {
      pushLog('[SSE-Diag] Prev boundary reached:', { index: current });
    }
    applySelectionState(nextIndex, diffRows, 'prev', { focus: true });
  }

  function onNextDiff() {
    pushLog('[SSE-Diag] Next invoked:', {
      selected: selectedDiffIndexRef.current,
      total: diffRows.length,
    });
    if (diffRows.length === 0) return;

    const current = selectedDiffIndexRef.current;
    if (current === null) {
      pushLog('[SSE-Diag] no selection fallback:', { action: 'next', fallbackIndex: 0 });
    }
    const nextIndex = current === null ? 0 : Math.min(diffRows.length - 1, current + 1);
    if (current !== null && nextIndex === current) {
      pushLog('[SSE-Diag] Next boundary reached:', { index: current });
    }
    applySelectionState(nextIndex, diffRows, 'next', { focus: true });
  }

  useEffect(() => {
    if (selectedDiffIndex === null) return;
    const row = diffRows[selectedDiffIndex];
    if (!row) return;

    const rowEl = diffRowRefMap.current.get(row.residue_key);
    rowEl?.scrollIntoView({ block: 'nearest' });
  }, [diffRows, selectedDiffIndex]);

  function updateViewMode(next: SseViewMode) {
    const prev = viewModeRef.current;
    viewModeRef.current = next;
    setViewMode(next);
    setHudSummary((current) => ({ ...current, view_mode: next }));
    if (prev !== next) {
      pushLog('[SSE-Diag] view_mode changed:', { from: prev, to: next });
    }
  }

  function updateComparisonStatus(next: ComparisonStatus) {
    const prev = comparisonStatusRef.current;
    comparisonStatusRef.current = next;
    setComparisonStatus(next);
    setHudSummary((current) => ({ ...current, comparison_status: next }));
    pushLog('[SSE-Diag] comparison_status decided:', { from: prev, to: next });
    if (next === 'baseline_only' && viewModeRef.current !== 'baseline') {
      updateViewMode('baseline');
      pushLog('[SSE-Diag] view_mode fixed for baseline_only');
    }
  }

  function updateHudSummary(next: SseComparisonSummary, reason: string) {
    setHudSummary(next);
    pushLog('[SSE-Diag] HUD summary data updated:', {
      reason,
      comparison_status: next.comparison_status,
      view_mode: next.view_mode,
      unavailable: listUnavailableMetrics(next),
    });
  }

  function resetAnalysisCache(reason: string) {
    baselineSnapshotRef.current = null;
    baselineMapRef.current = null;
    residueKeysRef.current = [];
    overrideOutputCacheRef.current = null;
    setDiffRows([]);
    applySelectionState(null, [], `${reason}: reset`, { focus: false });
    updateViewMode('baseline');
    updateComparisonStatus('baseline_only');
    updateHudSummary(createEmptyComparisonSummary('baseline_only', 'baseline'), reason);
    pushLog('[SSE-Diag] analysis cache reset:', { reason });
  }

  async function ensureOverrideOutput(): Promise<SseEngineOutput | null> {
    const residueKeys = residueKeysRef.current;
    const cached = overrideOutputCacheRef.current;

    if (
      cached &&
      cached.rangeLo === rangeLo &&
      cached.rangeHi === rangeHi &&
      cached.residueCount === residueKeys.length
    ) {
      pushLog('[SSE-Diag] override cache hit:', {
        rangeLo,
        rangeHi,
        residues: cached.output.residues.length,
      });
      return cached.output;
    }

    if (residueKeys.length === 0) {
      pushLog('[SSE-Diag] override compute skipped: no residue keys');
      return null;
    }

    pushLog('[SSE-Diag] override compute start:', { rangeLo, rangeHi, residues: residueKeys.length });
    const output = await engine.compute({ residues: residueKeys });
    overrideOutputCacheRef.current = {
      rangeLo,
      rangeHi,
      residueCount: residueKeys.length,
      output,
    };
    pushLog('[SSE-Diag] override cache updated:', { residues: output.residues.length, rangeLo, rangeHi });
    return output;
  }

  async function rebuildForStage(stage: string) {
    const plugin = pluginRef.current;
    if (!plugin) return;

    pushLog('[SSE-Diag] rebuild requested:', { stage });
    await rebuildCartoonOnly(plugin, pushLog);
  }

  async function restoreBaselineAndRebuild(reason: string): Promise<boolean> {
    const plugin = pluginRef.current;
    const snapshot = baselineSnapshotRef.current;

    if (!plugin || !snapshot) {
      pushLog('[SSE-Diag] baseline restore skipped:', { reason, hasPlugin: !!plugin, hasSnapshot: !!snapshot });
      return false;
    }

    pushLog('[SSE-Diag] baseline restore requested:', { reason });
    await restoreBaselineSecondaryStructureSnapshot(plugin, snapshot, pushLog);
    await rebuildForStage('baseline restore');
    updateViewMode('baseline');
    return true;
  }

  async function applyOverrideAndRebuild(output: SseEngineOutput, reason: string) {
    const plugin = pluginRef.current;
    if (!plugin) return;

    pushLog('[SSE-Diag] override apply start:', { reason, residues: output.residues.length });
    await applyOverrideSseToMolstarModel(plugin, output, pushLog);
    pushLog('[SSE-Diag] override apply done');
    await rebuildForStage('override apply');
    updateViewMode('override');
  }

  async function recoverBaselineAfterFailure(stage: string) {
    pushLog('[SSE-Diag] recovery baseline restore start:', { stage });
    try {
      await restoreBaselineAndRebuild(`recovery after ${stage}`);
    } catch (restoreError) {
      pushLog(
        '[SSE-Diag] recovery baseline restore FAILED:',
        restoreError instanceof Error ? restoreError.message : String(restoreError)
      );
    }
  }

  function updateHudSummaryForOutput(
    baselineMap: Map<string, SseLabel> | null,
    output: SseEngineOutput | null,
    nextStatus: ComparisonStatus,
    reviewPoints: MetricValue<number>,
    reason: string
  ) {
    updateHudSummary(
      buildComparisonSummary({
        baselineMap,
        output,
        comparisonStatus: nextStatus,
        viewMode: viewModeRef.current,
        reviewPoints,
      }),
      reason
    );
  }

  function updateDiffRows(
    baselineMap: Map<string, SseLabel> | null,
    output: SseEngineOutput | null,
    reason: string
  ) {
    if (!baselineMap || !output || output.residues.length === 0) {
      setDiffRows([]);
      applySelectionState(null, [], `${reason}: no diff rows`, { focus: false });
      pushLog('[SSE-Diag] diff rows skipped:', {
        reason,
        hasBaseline: !!baselineMap,
        hasOverride: !!output && output.residues.length > 0,
      });
      return;
    }

    const overrideMap = new Map<string, SseLabel>();
    for (const r of output.residues) overrideMap.set(residueKeyToString(r), r.sse);

    let mappedCount = 0;
    for (const key of baselineMap.keys()) {
      if (overrideMap.has(key)) mappedCount++;
    }

    const diffs = diffSse(baselineMap, overrideMap);
    const rowsForClassification = diffs.map((d) => {
      const residueKey = residueKeyToString({ chainId: d.chainId, labelSeqId: d.labelSeqId });
      return {
        residue_key: residueKey,
        display_residue: toDisplayResidueForTable(d.chainId, d.labelSeqId, residueKey, pushLog),
        baseline_label: d.molstar,
        override_label: d.wasm,
      };
    });

    const classified = classifyDiffRows(rowsForClassification);
    const rows: DiffRow[] = classified.rows;
    const nextSelectedIndex =
      selectedResidueKeyRef.current !== null
        ? rows.findIndex((row) => row.residue_key === selectedResidueKeyRef.current)
        : -1;

    setDiffRows(rows);
    applySelectionState(nextSelectedIndex >= 0 ? nextSelectedIndex : null, rows, `${reason}: rows refreshed`, {
      focus: false,
    });
    pushLog('[SSE-Diag] diff rows generated:', {
      reason,
      mappedCount,
      diffRows: rows.length,
      kindCounts: classified.stats.kindCounts,
      otherCount: classified.stats.otherCount,
      singletonCandidates: classified.stats.singletonCandidateCount,
      boundaryShiftCandidates: classified.stats.boundaryShiftCandidateCount,
    });
    pushLog('[SSE-Diag] table data updated:', {
      reason,
      totalRows: rows.length,
    });
  }

  async function switchViewMode(nextMode: SseViewMode) {
    const plugin = pluginRef.current;
    pushLog('[SSE-Diag] view_mode switch requested:', {
      from: viewModeRef.current,
      to: nextMode,
      comparison_status: comparisonStatusRef.current,
    });

    if (!plugin || !baselineSnapshotRef.current) {
      pushLog('[SSE-Diag] view_mode switch deferred: no loaded baseline snapshot');
      return;
    }

    let stage = nextMode === 'baseline' ? 'baseline restore' : 'override apply';
    try {
      if (nextMode === 'baseline') {
        await restoreBaselineAndRebuild('view_mode switch');
        pushLog('[SSE-Diag] view_mode switch done:', {
          view_mode: viewModeRef.current,
          comparison_status: comparisonStatusRef.current,
        });
        return;
      }

      stage = 'override compute';
      const output = await ensureOverrideOutput();
      const statusFromMapping = deriveComparisonStatus(baselineMapRef.current, output);
      const reviewResult = computeReviewPointsMetric(baselineMapRef.current, output, pushLog);
      const nextStatus = reviewResult.didFail ? 'partial' : statusFromMapping;
      updateComparisonStatus(nextStatus);
      updateHudSummaryForOutput(
        baselineMapRef.current,
        output,
        nextStatus,
        reviewResult.metric,
        'view_mode switch'
      );
      updateDiffRows(baselineMapRef.current, output, 'view_mode switch');

      if (!output || output.residues.length === 0) {
        await restoreBaselineAndRebuild('override unavailable');
        pushLog('[SSE-Diag] view_mode fixed to baseline: override unavailable');
        return;
      }

      stage = 'override apply';
      await applyOverrideAndRebuild(output, 'view_mode switch');
      pushLog('[SSE-Diag] view_mode switch done:', {
        view_mode: viewModeRef.current,
        comparison_status: comparisonStatusRef.current,
      });
    } catch (e) {
      const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
      updateComparisonStatus('partial');
      pushLog(`[SSE-Diag] view_mode switch FAILED at ${stage}:`, msg);
      await recoverBaselineAfterFailure(stage);
    }
  }

  async function applySseColorThemeNow() {
    const plugin = pluginRef.current;
    if (!plugin) return;
    try {
      const themeName = await forceSecondaryStructureColorTheme(plugin, pushLog);
      pushLog('[SSE-Diag] applySseColorThemeNow done:', { themeName });
    } catch (e) {
      pushLog('[SSE-Diag] applySseColorThemeNow failed:', e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        if (!hostRef.current) return;

        pushLog('[SSE-Diag] createMolstarPlugin() start');

        const plugin = await createMolstarPlugin(hostRef.current);

        // ✅ Mol* が全画面を覆わないように “右ペイン内” に閉じ込める保険
        try {
          const el = hostRef.current?.querySelector('.msp-plugin') as HTMLElement | null;
          if (el) {
            el.style.position = 'absolute';
            el.style.inset = '0';
          }
        } catch {
          // ignore
        }

        if (disposed) {
          disposeMolstarPlugin(plugin);
          return;
        }

        pluginRef.current = plugin;
        pushLog('[SSE-Diag] createMolstarPlugin() done');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
        setFatal(msg);
        pushLog('[SSE-Diag] Mol* init failed:', msg);
      }
    })();

    return () => {
      disposed = true;
      if (pluginRef.current) {
        disposeMolstarPlugin(pluginRef.current);
        pluginRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPipeline(text: string) {
    const plugin = pluginRef.current;
    if (!plugin) {
      pushLog('[SSE-Diag] plugin not ready yet');
      return;
    }

    const requestedViewMode = viewModeRef.current;
    let stage = 'load';

    try {
      setFatal(null);
      resetAnalysisCache('new mmCIF load');
      pushLog('[SSE-Diag] runPipeline() start:', { requestedViewMode });

      // 1) load structure
      pushLog('[SSE-Diag] load start');
      await loadMmcifText(plugin, text);
      pushLog('[SSE-Diag] load done');

      // 2) Baseline provider snapshot
      stage = 'baseline snapshot capture';
      baselineSnapshotRef.current = await captureBaselineSecondaryStructureSnapshot(plugin, pushLog);

      // 3) Mol*標準SSE（比較対象）
      stage = 'baseline extract';
      pushLog('[SSE-Diag] getMolstarStandardSse()');
      const molstarMap = await getMolstarStandardSse(plugin, pushLog);
      baselineMapRef.current = molstarMap;
      pushLog('[SSE-Diag] molstarMap size:', molstarMap.size);

      // 4) residue keys 抽出 → engine出力
      stage = 'residue extract';
      pushLog('[SSE-Diag] extractResidueKeys()');
      const residueKeys = extractResidueKeys(plugin, pushLog);
      residueKeysRef.current = residueKeys;
      pushLog('[SSE-Diag] residueKeys:', residueKeys.length);

      stage = 'override compute';
      let output: SseEngineOutput | null = null;
      let overrideComputeFailed = false;
      try {
        output = await ensureOverrideOutput();
      } catch (e) {
        overrideComputeFailed = true;
        updateComparisonStatus('partial');
        pushLog('[SSE-Diag] override compute FAILED:', e instanceof Error ? (e.stack ?? e.message) : String(e));
      }

      const statusFromMapping = overrideComputeFailed ? 'partial' : deriveComparisonStatus(molstarMap, output);
      const reviewResult = computeReviewPointsMetric(molstarMap, output, pushLog);
      const nextStatus = reviewResult.didFail ? 'partial' : statusFromMapping;
      updateComparisonStatus(nextStatus);
      updateHudSummaryForOutput(
        molstarMap,
        output,
        nextStatus,
        reviewResult.metric,
        'pipeline'
      );
      updateDiffRows(molstarMap, output, 'pipeline');

      // quick stats
      pushLog('[SSE-Diag] molstarMap counts:', countLabelsFromMap(molstarMap));
      if (output) {
        pushLog('[SSE-Diag] output counts:', countLabelsFromOutput(output));
      }

      if (requestedViewMode === 'override' && output && output.residues.length > 0) {
        stage = 'override apply';
        await applyOverrideAndRebuild(output, 'load');
      } else {
        stage = 'baseline restore';
        if (requestedViewMode === 'override') {
          pushLog('[SSE-Diag] view_mode fixed to baseline after load: override unavailable');
        }
        await restoreBaselineAndRebuild('load');
      }

      pushLog('[SSE-Diag] runPipeline() done:', {
        comparison_status: comparisonStatusRef.current,
        view_mode: viewModeRef.current,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
      setFatal(msg);
      updateComparisonStatus('partial');
      pushLog(`[SSE-Diag] runPipeline FAILED at ${stage}:`, msg);
      await recoverBaselineAfterFailure(stage);
    }
  }

  async function onDropFile(file: File) {
    const text = await file.text();
    setMmcifText(text);
    await runPipeline(text);
  }

  function toggleHudExpanded() {
    setHudExpanded((current) => {
      const next = !current;
      pushLog('[SSE-Diag] HUD expanded changed:', { expanded: next });
      return next;
    });
  }

  return (
    <div
      data-comparison-status={comparisonStatus}
      data-view-mode={viewMode}
      style={{ display: 'flex', height: '100vh', width: '100vw' }}
    >
      {/* 左ペイン */}
      <div style={{ width: 380, padding: 12, borderRight: '1px solid #ddd', overflow: 'auto' }}>
        <h2 style={{ margin: 0 }}>SSE-Diag</h2>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
          Mol* SSE を “WASM想定の出力” で上書き（MVP: rebuild cartoon）
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void onDropFile(f);
          }}
          style={{
            height: 80,
            border: '2px dashed #999',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          Drop mmCIF here
        </div>

        <div style={{ fontSize: 12, marginBottom: 6 }}>
          ルール：label_seq_id {rangeLo}–{rangeHi} = Sheet(E), その他 = Helix(H)
        </div>

        <label style={{ fontSize: 12 }}>rangeLo</label>
        <input
          type="number"
          value={rangeLo}
          onChange={(e) => setRangeLo(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 8 }}
        />


        <label style={{ fontSize: 12 }}>rangeHi</label>
        <input
          type="number"
          value={rangeHi}
          onChange={(e) => setRangeHi(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
          <button style={{ flex: 1 }} disabled={!mmcifText} onClick={() => void runPipeline(mmcifText)}>
            再解析（load → compare）
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 8,
            padding: '6px 8px',
            border: '1px solid #ddd',
            borderRadius: 8,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={viewMode === 'override'}
              onChange={(e) => {
                const nextMode: SseViewMode = e.target.checked ? 'override' : 'baseline';
                void switchViewMode(nextMode);
              }}
            />
            <span>Override（外部SSEで上書き）</span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              {viewMode === 'override' ? 'ON' : 'OFF'}
            </span>
          </label>

          <button type="button" onClick={() => void applySseColorThemeNow()} style={{ whiteSpace: 'nowrap' }}>
            色をSSEに固定
          </button>
        </div>

        <div style={{ marginTop: 10, border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #eee',
              fontSize: 12,
              fontWeight: 700,
              background: '#fafafa',
            }}
          >
            Diff Table
          </div>

          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={tableHeadCellStyle}>Residue</th>
                  <th style={tableHeadCellStyle}>Baseline</th>
                  <th style={tableHeadCellStyle}>Override</th>
                  <th style={tableHeadCellStyle}>Kind</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.length === 0 ? (
                  <tr>
                    <td style={tableEmptyCellStyle} colSpan={4}>
                      No diff rows
                    </td>
                  </tr>
                ) : (
                  diffRows.map((row, index) => {
                    const selected = selectedDiffIndex === index;
                    return (
                    <tr
                      key={row.residue_key}
                      ref={(el) => {
                        if (el) diffRowRefMap.current.set(row.residue_key, el);
                        else diffRowRefMap.current.delete(row.residue_key);
                      }}
                      onClick={() => onDiffRowClick(index)}
                      aria-selected={selected}
                      style={selected ? tableSelectedRowStyle : undefined}
                    >
                      <td style={tableBodyCellStyle}>{row.display_residue}</td>
                      <td style={tableBodyCellStyle}>{row.baseline_label}</td>
                      <td style={tableBodyCellStyle}>{row.override_label}</td>
                      <td style={tableBodyCellStyle}>{row.kind_label}</td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {fatal && (
          <pre style={{ whiteSpace: 'pre-wrap', color: '#b00', background: '#fee', padding: 8, marginTop: 10 }}>
            {fatal}
          </pre>
        )}

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button style={{ flex: 1 }} onClick={() => setLogs([])}>
            ログクリア
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 6, color: '#555' }}>Debug Log（UI表示）</div>
          <pre
            style={{
              height: 260,
              overflow: 'auto',
              background: '#111',
              color: '#eee',
              padding: 8,
              borderRadius: 6,
              fontSize: 11,
              whiteSpace: 'pre-wrap',
            }}
          >
            {logs.join('\n')}
          </pre>
        </div>
      </div>

      {/* 右ペイン（Mol* ホスト） */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        <div
          ref={hostRef}
          id="molstar-host"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
          }}
        />
        <SseDiagHud
          summary={hudSummary}
          expanded={hudExpanded}
          onToggle={toggleHudExpanded}
          currentDiffIndexText={currentDiffIndexText}
          selectedDiffRow={selectedDiffRow}
          diffRowCount={diffRows.length}
          onPrev={onPrevDiff}
          onNext={onNextDiff}
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
        />
      </div>
    </div>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const tableHeadCellStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid #eee',
  background: '#fff',
  whiteSpace: 'nowrap',
};

const tableBodyCellStyle: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #f1f1f1',
  verticalAlign: 'top',
  cursor: 'pointer',
};

const tableEmptyCellStyle: CSSProperties = {
  padding: '10px 8px',
  color: '#666',
};

const tableSelectedRowStyle: CSSProperties = {
  background: '#eef5ff',
};

const DASH = '—';

function toDisplayResidueForTable(
  chainId: string,
  labelSeqId: number,
  fallback: string,
  log: LogFn
): string {
  if (chainId && Number.isFinite(labelSeqId)) {
    return `${chainId}:${labelSeqId}`;
  }

  log('[SSE-Diag] display_residue fallback:', { chainId, labelSeqId, fallback });
  return fallback;
}

function metricAvailable<T>(value: T): MetricValue<T> {
  return { available: true, value };
}

function metricUnavailable<T>(reason: string): MetricValue<T> {
  return { available: false, value: null, reason };
}

function createEmptyComparisonSummary(
  comparisonStatus: ComparisonStatus,
  viewMode: SseViewMode
): SseComparisonSummary {
  return {
    comparison_status: comparisonStatus,
    view_mode: viewMode,
    engine_metadata: null,
    comparable_count: metricUnavailable('not loaded'),
    candidate_count: metricUnavailable('not loaded'),
    mapped_count: metricUnavailable('not loaded'),
    mapped_rate: metricUnavailable('not loaded'),
    unmapped_total: metricUnavailable('not loaded'),
    ambiguous_count: metricUnavailable('not loaded'),
    review_points_count: metricUnavailable('not loaded'),
    contract_summary: {
      model_policy: 'Mol* current structure',
      residue_key_policy: 'label_asym_id + label_seq_id',
      mapping_basis: 'Residue key exact match',
      engine_summary: DASH,
    },
  };
}

function listUnavailableMetrics(summary: SseComparisonSummary): string[] {
  const metrics: Array<[string, MetricValue<number>]> = [
    ['review_points', summary.review_points_count],
    ['comparable', summary.comparable_count],
    ['candidate_count', summary.candidate_count],
    ['unmapped_total', summary.unmapped_total],
    ['ambiguous_count', summary.ambiguous_count],
    ['mapped_rate', summary.mapped_rate],
  ];
  return metrics.filter(([, metric]) => !metric.available).map(([name]) => name);
}

function formatMetric(metric: MetricValue<number>): string {
  return metric.available ? String(metric.value) : DASH;
}

function formatStatus(status: ComparisonStatus): string {
  if (status === 'baseline_only') return 'Baseline only';
  if (status === 'partial') return 'Partial';
  return 'Full';
}

function formatViewMode(mode: SseViewMode): string {
  return mode === 'baseline' ? 'Baseline' : 'Override';
}

function formatEngineStage(stage: SseEngineStage): string {
  if (stage === 'reference_like') return 'Reference-like';
  if (stage === 'experimental') return 'Experimental';
  return 'Prototype';
}

function formatEngineStageForHud(summary: SseComparisonSummary): string {
  if (summary.comparison_status === 'baseline_only') return DASH;
  return summary.engine_metadata ? formatEngineStage(summary.engine_metadata.engine_stage) : DASH;
}

function formatEngineNameVersion(summary: SseComparisonSummary): string {
  const metadata = summary.engine_metadata;
  return metadata ? `${metadata.engine_name} / ${metadata.engine_version}` : DASH;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrentDiffIndex(selectedDiffIndex: number | null, diffRowCount: number): string {
  if (diffRowCount <= 0) return `${DASH} / 0`;
  if (selectedDiffIndex === null) return `${DASH} / ${diffRowCount}`;
  return `${selectedDiffIndex + 1} / ${diffRowCount}`;
}

function formatMappedRate(summary: SseComparisonSummary): string {
  if (
    !summary.comparable_count.available ||
    !summary.candidate_count.available ||
    !summary.mapped_rate.available
  ) {
    return DASH;
  }

  return `Comparable ${summary.comparable_count.value} / Candidate ${summary.candidate_count.value} (${formatPercent(summary.mapped_rate.value)})`;
}

function formatContractMappedRate(summary: SseComparisonSummary): string {
  if (
    !summary.mapped_count.available ||
    !summary.candidate_count.available ||
    !summary.mapped_rate.available
  ) {
    return DASH;
  }

  return `Mapped ${summary.mapped_count.value} / Candidate ${summary.candidate_count.value} (${formatPercent(summary.mapped_rate.value)})`;
}

function SseDiagHud({
  summary,
  expanded,
  onToggle,
  currentDiffIndexText,
  selectedDiffRow,
  diffRowCount,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}: {
  summary: SseComparisonSummary;
  expanded: boolean;
  onToggle: () => void;
  currentDiffIndexText: string;
  selectedDiffRow: DiffRow | null;
  diffRowCount: number;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
}) {
  const currentClassText = selectedDiffRow?.kind_label ?? DASH;
  const currentResidueText = selectedDiffRow?.display_residue ?? DASH;

  const compactText = [
    formatStatus(summary.comparison_status),
    `View: ${formatViewMode(summary.view_mode)}`,
    formatEngineStageForHud(summary),
    `Review points ${formatMetric(summary.review_points_count)}`,
    `Unmapped ${formatMetric(summary.unmapped_total)}`,
    `Current ${currentDiffIndexText}`,
  ].join(' · ');

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        zIndex: 30,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          border: '1px solid rgba(20, 20, 20, 0.22)',
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.94)',
          color: '#111',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
          pointerEvents: 'auto',
          overflow: 'hidden',
          fontSize: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>{compactText}</div>
          <button
            type="button"
            onClick={onPrev}
            disabled={prevDisabled}
            style={{
              border: '1px solid #bbb',
              borderRadius: 6,
              background: '#f7f7f7',
              padding: '3px 8px',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            style={{
              border: '1px solid #bbb',
              borderRadius: 6,
              background: '#f7f7f7',
              padding: '3px 8px',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            Next
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            style={{
              border: '1px solid #bbb',
              borderRadius: 6,
              background: '#f7f7f7',
              padding: '3px 8px',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            {expanded ? 'Compact' : 'Details'}
          </button>
        </div>

        {expanded && (
          <div
            style={{
              borderTop: '1px solid rgba(20, 20, 20, 0.16)',
              padding: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px' }}>
              <HudField label="Current diff index" value={currentDiffIndexText} />
              <HudField label="Current class" value={currentClassText} />
              <HudField label="Selected residue" value={currentResidueText} />
              <HudField label="Comparable" value={formatMetric(summary.comparable_count)} />
              <HudField label="Candidate" value={formatMetric(summary.candidate_count)} />
              <HudField label="Mapped rate" value={formatMappedRate(summary)} />
              <HudField label="Unmapped total" value={formatMetric(summary.unmapped_total)} />
              <HudField label="Ambiguous" value={formatMetric(summary.ambiguous_count)} />
              <HudField label="Engine" value={formatEngineNameVersion(summary)} />
              <HudField label="Total diff rows" value={String(diffRowCount)} />
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Contract Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px' }}>
                <HudField label="model_policy" value={summary.contract_summary.model_policy} />
                <HudField label="residue_key_policy" value={summary.contract_summary.residue_key_policy} />
                <HudField label="mapping_basis" value={summary.contract_summary.mapping_basis} />
                <HudField label="mapped" value={formatContractMappedRate(summary)} />
                <HudField label="engine_summary" value={summary.contract_summary.engine_summary} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HudField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={{ color: '#555', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{value}</div>
    </>
  );
}

function countLabelsFromMap(map: Map<string, SseLabel>) {
  const out = { H: 0, E: 0, C: 0 };
  for (const v of map.values()) out[v] += 1;
  return out;
}

function countLabelsFromOutput(output: SseEngineOutput) {
  const out = { H: 0, E: 0, C: 0 };
  for (const r of output.residues) out[r.sse] += 1;
  return out;
}

function buildComparisonSummary({
  baselineMap,
  output,
  comparisonStatus,
  viewMode,
  reviewPoints,
}: {
  baselineMap: Map<string, SseLabel> | null;
  output: SseEngineOutput | null;
  comparisonStatus: ComparisonStatus;
  viewMode: SseViewMode;
  reviewPoints: MetricValue<number>;
}): SseComparisonSummary {
  const hasBaseline = baselineMap !== null;
  const hasOverride = !!output && output.residues.length > 0;
  const candidateCount = baselineMap?.size ?? 0;
  const overrideKeys = new Set<string>();

  if (hasOverride && output) {
    for (const r of output.residues) overrideKeys.add(residueKeyToString(r));
  }

  let mappedCount = 0;
  if (baselineMap) {
    for (const key of baselineMap.keys()) {
      if (overrideKeys.has(key)) mappedCount++;
    }
  }

  let overrideOnlyCount = 0;
  if (baselineMap && output) {
    for (const key of overrideKeys) {
      if (!baselineMap.has(key)) overrideOnlyCount++;
    }
  }

  const unmappedTotal = Math.max(candidateCount - mappedCount, 0) + overrideOnlyCount;
  const mappedRate = candidateCount === 0 ? 0 : mappedCount / candidateCount;
  const mappingAvailable = hasBaseline && hasOverride;

  const engineSummary = output?.metadata
    ? `${output.metadata.engine_name} ${output.metadata.engine_version} (${formatEngineStage(output.metadata.engine_stage)})`
    : DASH;

  return {
    comparison_status: comparisonStatus,
    view_mode: viewMode,
    engine_metadata: output?.metadata ?? null,
    comparable_count: mappingAvailable ? metricAvailable(mappedCount) : metricUnavailable('mapping not available'),
    candidate_count: hasBaseline ? metricAvailable(candidateCount) : metricUnavailable('baseline not available'),
    mapped_count: mappingAvailable ? metricAvailable(mappedCount) : metricUnavailable('mapping not available'),
    mapped_rate: mappingAvailable ? metricAvailable(mappedRate) : metricUnavailable('mapping not available'),
    unmapped_total: mappingAvailable ? metricAvailable(unmappedTotal) : metricUnavailable('mapping not available'),
    ambiguous_count: mappingAvailable ? metricAvailable(0) : metricUnavailable('mapping not available'),
    review_points_count: reviewPoints,
    contract_summary: {
      model_policy: 'Mol* current structure',
      residue_key_policy: 'label_asym_id + label_seq_id',
      mapping_basis: 'Residue key exact match',
      engine_summary: comparisonStatus === 'baseline_only' ? DASH : engineSummary,
    },
  };
}

function computeReviewPointsMetric(
  baselineMap: Map<string, SseLabel> | null,
  output: SseEngineOutput | null,
  log: LogFn
): { metric: MetricValue<number>; didFail: boolean } {
  if (!baselineMap || !output || output.residues.length === 0) {
    return { metric: metricUnavailable('diff not available'), didFail: false };
  }

  try {
    const overrideMap = new Map<string, SseLabel>();
    for (const r of output.residues) overrideMap.set(residueKeyToString(r), r.sse);

    const candidateCount = baselineMap.size;
    let mappedCount = 0;
    for (const key of baselineMap.keys()) {
      if (overrideMap.has(key)) mappedCount++;
    }

    let overrideOnlyCount = 0;
    for (const key of overrideMap.keys()) {
      if (!baselineMap.has(key)) overrideOnlyCount++;
    }

    if (mappedCount < candidateCount || overrideOnlyCount > 0) {
      log('[SSE-Diag] review points unavailable: mapping incomplete', {
        candidateCount,
        mappedCount,
        overrideOnlyCount,
      });
      return { metric: metricUnavailable('mapping incomplete'), didFail: false };
    }

    const diffs = diffSse(baselineMap, overrideMap);
    log('[SSE-Diag] diffs count:', diffs.length);
    log('[SSE-Diag] diffs sample:', diffs.slice(0, 30));
    return { metric: metricAvailable(diffs.length), didFail: false };
  } catch (e) {
    log('[SSE-Diag] review points unavailable:', e instanceof Error ? e.message : String(e));
    return { metric: metricUnavailable('diff failed'), didFail: true };
  }
}

function deriveComparisonStatus(
  baselineMap: Map<string, SseLabel> | null,
  output: SseEngineOutput | null
): ComparisonStatus {
  if (!baselineMap || baselineMap.size === 0) return 'partial';
  if (!output || output.residues.length === 0) return 'baseline_only';

  const overrideKeys = new Set<string>();
  for (const r of output.residues) overrideKeys.add(residueKeyToString(r));

  let mappedCount = 0;
  for (const key of baselineMap.keys()) {
    if (overrideKeys.has(key)) mappedCount++;
  }

  if (mappedCount < baselineMap.size) return 'partial';
  if (overrideKeys.size > mappedCount) return 'partial';

  return 'full';
}
