// apps/sse-diag/src/components/MolstarSseDiagViewer.tsx
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

import { createMolstarPlugin, disposeMolstarPlugin } from '../molstar/plugin';
import type {
  ComparisonStatus,
  DiagnosisRecord,
  DiagnosisStage,
  DiffKind,
  DiffRow,
  EngineCoverageReport,
  EngineDegradationReport,
  EngineExecutionRecord,
  EngineUnavailableReason,
  EngineResolutionMode,
  MetricValue,
  RawBackboneCarrier,
  SseComparisonSummary,
  SseEngineOutput,
  SseEngineStage,
  SseLabel,
  SseResidueKey,
  SseViewMode,
} from '../domain/sse/types';
import { loadMmcifText } from '../molstar/load';
import {
  extractRawBackboneCarrier,
  extractResidueDisplayLabels,
  extractResidueKeys,
} from '../molstar/extract';
import { getMolstarStandardSse } from '../molstar/standardSse';
import { rebuildCartoonOnly, forceSecondaryStructureColorTheme } from '../molstar/state';

import { createSseEngineRegistry } from '../domain/sse/engine';
import {
  DEFAULT_OVERRIDE_CANDIDATE_ENGINE_KEY,
  DEFAULT_SSE_ENGINE_KEY,
  PROTOTYPE_ENGINE_KEY,
  SSE_ENGINE_DESCRIPTORS,
} from '../domain/sse/engines/registry';
import { runDiagnosisPipeline } from '../application/diagnosis/runDiagnosisPipeline';
import type {
  DiagnosisContractContext,
  RunDiagnosisPipelineResult,
} from '../application/diagnosis/types';
import {
  applyOverrideSseToMolstarModel,
  captureBaselineSecondaryStructureSnapshot,
  restoreBaselineSecondaryStructureSnapshot,
  type SecondaryStructureBaselineSnapshot,
} from '../molstar/sseOverrideProvider';
import { clearDiffSelectionMarks, focusAndHighlightResidueByKey } from '../molstar/selection';

type LogFn = (msg: string, data?: unknown) => void;

type DiffKindFilter = 'all' | DiffKind;

const DIAGNOSIS_CONTRACT_CONTEXT: DiagnosisContractContext = {
  baseline_source_kind: 'molstar_auto',
  baseline_resolved_source: 'Mol* SecondaryStructureProvider auto',
  baseline_annotation_origin: null,
  baseline_profile: 'Mol* SecondaryStructureProvider (current structure)',
  comparison_scope: 'Baseline candidate_set (all baseline residue keys)',
  chain_policy: 'All chains in current structure',
  model_policy: 'Mol* current structure',
  residue_key_policy: 'label_asym_id + label_seq_id',
  mapping_basis: 'Residue key exact match (duplicate override keys -> ambiguous)',
};

export default function MolstarSseDiagViewer() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pluginRef = useRef<PluginUIContext | null>(null);

  // --- SSE-Diag-owned application state (authoritative product truth) ---
  const [fatal, setFatal] = useState<string | null>(null);
  const [mmcifText, setMmcifText] = useState('');
  const [prototypeRangeLo, setPrototypeRangeLo] = useState(10);
  const [prototypeRangeHi, setPrototypeRangeHi] = useState(20);
  const [requestedEngineKey, setRequestedEngineKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<SseViewMode>('baseline');
  const [comparisonStatus, setComparisonStatus] = useState<ComparisonStatus>('baseline_only');
  const [hudExpanded, setHudExpanded] = useState(false);
  const [hudSummary, setHudSummary] = useState<SseComparisonSummary>(() =>
    createEmptyComparisonSummary('baseline_only', 'baseline')
  );
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [kindFilter, setKindFilter] = useState<DiffKindFilter>('all');
  const [chainFilter, setChainFilter] = useState<string>('all');
  const [selectedDiffIndex, setSelectedDiffIndex] = useState<number | null>(null);
  const [engineExecutionRecords, setEngineExecutionRecords] = useState<EngineExecutionRecord[]>([]);

  // --- Mutable refs for orchestration, cache, and selection sync ---
  const viewModeRef = useRef<SseViewMode>('baseline');
  const comparisonStatusRef = useRef<ComparisonStatus>('baseline_only');
  const baselineSnapshotRef = useRef<SecondaryStructureBaselineSnapshot | null>(null);
  const baselineMapRef = useRef<Map<string, SseLabel> | null>(null);
  const residueKeysRef = useRef<SseResidueKey[]>([]);
  const rawBackboneRef = useRef<RawBackboneCarrier | null>(null);
  const residueDisplayLabelMapRef = useRef<Map<string, string>>(new Map());
  const nextRunIdRef = useRef(0);
  // Latest started run id; only this run may update current execution summary or visible comparison state.
  const latestRunIdRef = useRef<string | null>(null);
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

  const engineRegistry = useMemo(
    () => createSseEngineRegistry(SSE_ENGINE_DESCRIPTORS),
    []
  );
  const effectiveEngineKeyForParams = requestedEngineKey ?? DEFAULT_SSE_ENGINE_KEY;
  const showPrototypeParams = effectiveEngineKeyForParams === PROTOTYPE_ENGINE_KEY;

  // --- Diff table filters ---
  const kindFilterOptions = useMemo(() => {
    const options = new Map<DiffKind, string>();
    for (const row of diffRows) {
      if (!options.has(row.kind)) options.set(row.kind, row.kind_label);
    }
    return Array.from(options.entries());
  }, [diffRows]);

  const chainFilterOptions = useMemo(() => {
    const chainIds = new Set<string>();
    for (const row of diffRows) {
      chainIds.add(parseChainIdFromResidueKey(row.residue_key));
    }
    return Array.from(chainIds.values()).sort((a, b) => a.localeCompare(b));
  }, [diffRows]);

  const filteredDiffRows = useMemo(
    () => filterDiffRows(diffRows, kindFilter, chainFilter),
    [diffRows, kindFilter, chainFilter]
  );

  const selectedDiffRow =
    selectedDiffIndex !== null && selectedDiffIndex >= 0 && selectedDiffIndex < diffRows.length
      ? diffRows[selectedDiffIndex]
      : null;
  const selectedVisibleDiffIndex =
    selectedDiffRow === null
      ? -1
      : filteredDiffRows.findIndex((row) => row.residue_key === selectedDiffRow.residue_key);
  const currentDiffIndexText = formatCurrentDiffIndex(selectedDiffIndex, diffRows.length);
  const hasVisibleSelection = selectedVisibleDiffIndex >= 0;

  const prevDisabled =
    filteredDiffRows.length === 0 ||
    (hasVisibleSelection && selectedVisibleDiffIndex <= 0);
  const nextDisabled =
    filteredDiffRows.length === 0 ||
    (hasVisibleSelection && selectedVisibleDiffIndex >= filteredDiffRows.length - 1);

  // --- Selection and HUD trace logs ---
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
      total: filteredDiffRows.length,
      total_unfiltered: diffRows.length,
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
  }, [selectedDiffIndex, selectedDiffRow?.residue_key, filteredDiffRows.length, diffRows.length]);

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

  useEffect(() => {
    if (kindFilter === 'all') return;
    const isAvailable = kindFilterOptions.some(([kind]) => kind === kindFilter);
    if (!isAvailable) setKindFilter('all');
  }, [kindFilter, kindFilterOptions]);

  useEffect(() => {
    if (chainFilter === 'all') return;
    if (!chainFilterOptions.includes(chainFilter)) setChainFilter('all');
  }, [chainFilter, chainFilterOptions]);

  function isCurrentRun(runId: string): boolean {
    return latestRunIdRef.current === runId;
  }

  /**
   * Updates execution history and, optionally, the current execution summary shown in HUD/Diag.
   * History includes stale runs; the current summary is gated to the latest run id.
   */
  function upsertEngineExecutionRecord(
    record: EngineExecutionRecord,
    options?: { updateCurrentSummary?: boolean }
  ) {
    setEngineExecutionRecords((current) => {
      const index = current.findIndex((entry) => entry.run_id === record.run_id);
      if (index >= 0) {
        const next = [...current];
        next[index] = record;
        return next;
      }
      return [record, ...current].slice(0, 20);
    });
    const shouldUpdateCurrentSummary =
      options?.updateCurrentSummary ?? isCurrentRun(record.run_id);
    if (shouldUpdateCurrentSummary) {
      setHudSummary((current) => ({ ...current, engine_execution_record: record }));
    }
  }

  /** Monotonic run id source used for stale-discard decisions. */
  function nextRunId(): string {
    nextRunIdRef.current += 1;
    return `run-${nextRunIdRef.current}`;
  }

  // Central selection sync for table, HUD current row, and Mol* focus/highlight actions.
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
    const row = filteredDiffRows[index];
    if (!row) return;
    const canonicalIndex = diffRows.findIndex((entry) => entry.residue_key === row.residue_key);
    applySelectionState(canonicalIndex >= 0 ? canonicalIndex : null, diffRows, 'table row click', {
      focus: true,
      logSelectionEvent: true,
    });
  }

  function onPrevDiff() {
    pushLog('[SSE-Diag] Prev invoked:', {
      selected_index: selectedDiffIndexRef.current,
      selected_residue_key: selectedResidueKeyRef.current,
      total: filteredDiffRows.length,
      total_unfiltered: diffRows.length,
    });
    if (filteredDiffRows.length === 0) return;

    const currentVisibleIndex =
      selectedResidueKeyRef.current === null
        ? -1
        : filteredDiffRows.findIndex((row) => row.residue_key === selectedResidueKeyRef.current);
    if (currentVisibleIndex < 0) {
      pushLog('[SSE-Diag] no visible selection fallback:', { action: 'prev', fallbackVisibleIndex: 0 });
    }
    const nextVisibleIndex = currentVisibleIndex < 0 ? 0 : Math.max(0, currentVisibleIndex - 1);
    if (currentVisibleIndex >= 0 && nextVisibleIndex === currentVisibleIndex) {
      pushLog('[SSE-Diag] Prev boundary reached:', { visible_index: currentVisibleIndex });
    }
    const nextRow = filteredDiffRows[nextVisibleIndex];
    const nextIndex =
      nextRow === undefined
        ? null
        : diffRows.findIndex((row) => row.residue_key === nextRow.residue_key);
    applySelectionState(
      nextIndex !== null && nextIndex >= 0 ? nextIndex : null,
      diffRows,
      'prev',
      { focus: true }
    );
  }

  function onNextDiff() {
    pushLog('[SSE-Diag] Next invoked:', {
      selected_index: selectedDiffIndexRef.current,
      selected_residue_key: selectedResidueKeyRef.current,
      total: filteredDiffRows.length,
      total_unfiltered: diffRows.length,
    });
    if (filteredDiffRows.length === 0) return;

    const currentVisibleIndex =
      selectedResidueKeyRef.current === null
        ? -1
        : filteredDiffRows.findIndex((row) => row.residue_key === selectedResidueKeyRef.current);
    if (currentVisibleIndex < 0) {
      pushLog('[SSE-Diag] no visible selection fallback:', { action: 'next', fallbackVisibleIndex: 0 });
    }
    const nextVisibleIndex =
      currentVisibleIndex < 0 ? 0 : Math.min(filteredDiffRows.length - 1, currentVisibleIndex + 1);
    if (currentVisibleIndex >= 0 && nextVisibleIndex === currentVisibleIndex) {
      pushLog('[SSE-Diag] Next boundary reached:', { visible_index: currentVisibleIndex });
    }
    const nextRow = filteredDiffRows[nextVisibleIndex];
    const nextIndex =
      nextRow === undefined
        ? null
        : diffRows.findIndex((row) => row.residue_key === nextRow.residue_key);
    applySelectionState(
      nextIndex !== null && nextIndex >= 0 ? nextIndex : null,
      diffRows,
      'next',
      { focus: true }
    );
  }

  useEffect(() => {
    if (!selectedDiffRow) return;
    const rowEl = diffRowRefMap.current.get(selectedDiffRow.residue_key);
    rowEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedDiffRow?.residue_key]);

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
    rawBackboneRef.current = null;
    residueDisplayLabelMapRef.current = new Map();
    latestRunIdRef.current = null;
    setDiffRows([]);
    setKindFilter('all');
    setChainFilter('all');
    setEngineExecutionRecords([]);
    applySelectionState(null, [], `${reason}: reset`, { focus: false });
    updateViewMode('baseline');
    updateComparisonStatus('baseline_only');
    updateHudSummary(createEmptyComparisonSummary('baseline_only', 'baseline'), reason);
    pushLog('[SSE-Diag] analysis cache reset:', { reason });
  }

  function markRecordDiscardedAsStale(
    record: EngineExecutionRecord,
    reason: string
  ): EngineExecutionRecord {
    return {
      ...record,
      status: 'discarded_stale',
      error: record.error ?? reason,
      finished_at: record.finished_at ?? new Date().toISOString(),
    };
  }

  async function runDiagnosisForCurrentBaseline(
    trigger: string,
    viewModeForSummary: SseViewMode
  ): Promise<RunDiagnosisPipelineResult | null> {
    const baselineMap = baselineMapRef.current;
    if (!baselineMap) {
      pushLog('[SSE-Diag] diagnosis pipeline skipped: baseline unavailable', { trigger });
      return null;
    }

    const residueKeys = residueKeysRef.current;
    const rawBackbone = rawBackboneRef.current;
    if (!rawBackbone) {
      const note = 'Raw backbone unavailable: extraction missing';
      setFatal(note);
      updateComparisonStatus('baseline_only');
      setHudSummary((current) => ({
        ...current,
        comparison_status: 'baseline_only',
        view_mode: 'baseline',
        diagnosis_record: createDiagnosisRecord('baseline_ready', note),
      }));
      pushLog('[SSE-Diag] diagnosis pipeline blocked:', {
        trigger,
        reason: 'raw backbone unavailable',
      });
      return null;
    }
    const resolvedEngineKeyForParams = requestedEngineKey ?? DEFAULT_SSE_ENGINE_KEY;
    const engineParams = buildEngineParams(
      resolvedEngineKeyForParams,
      prototypeRangeLo,
      prototypeRangeHi
    );
    const runId = nextRunId();
    latestRunIdRef.current = runId;

    pushLog('[SSE-Diag] diagnosis pipeline start:', {
      trigger,
      run_id: runId,
      requested_engine_key: requestedEngineKey,
      resolved_engine_key_for_params: resolvedEngineKeyForParams,
      engine_params: engineParams,
      residues: residueKeys.length,
      raw_backbone_residue_count: rawBackbone.residue_count,
      raw_backbone_missing_required_count: rawBackbone.missing_required_count,
    });

    const result = await runDiagnosisPipeline({
      run_id: runId,
      requested_engine_key: requestedEngineKey,
      default_engine_key: DEFAULT_SSE_ENGINE_KEY,
      engine_registry: engineRegistry,
      engine_params: engineParams,
      baseline_map: baselineMap,
      residue_keys: residueKeys,
      residue_display_labels: residueDisplayLabelMapRef.current,
      raw_backbone: rawBackbone,
      derived_geometry: null,
      contract_context: DIAGNOSIS_CONTRACT_CONTEXT,
      view_mode: viewModeForSummary,
      is_run_current: isCurrentRun,
    });

    upsertEngineExecutionRecord(result.engine_execution_record);

    if (result.stale_disposition === 'stale_candidate') {
      const discardedRecord = markRecordDiscardedAsStale(
        result.engine_execution_record,
        'stale result discarded'
      );
      upsertEngineExecutionRecord(discardedRecord, { updateCurrentSummary: false });
      pushLog('[SSE-Diag] stale result discarded by shell:', {
        trigger,
        run_id: result.run_id,
        latest_run_id: latestRunIdRef.current,
      });
      return null;
    }

    pushLog('[SSE-Diag] diagnosis pipeline done:', {
      trigger,
      run_id: result.run_id,
      status: result.comparison_status,
      failed: result.failed,
      diff_rows: result.diff_rows.length,
    });
    return result;
  }

  function adoptDiagnosisRun(result: RunDiagnosisPipelineResult, reason: string) {
    updateComparisonStatus(result.comparison_status);
    updateHudSummary(result.comparison_summary, reason);
    setDiffRows(result.diff_rows);

    const selectedResidueKey = selectedResidueKeyRef.current;
    const nextSelectedIndex =
      selectedResidueKey === null
        ? -1
        : result.diff_rows.findIndex((row) => row.residue_key === selectedResidueKey);

    applySelectionState(
      nextSelectedIndex >= 0 ? nextSelectedIndex : null,
      result.diff_rows,
      `${reason}: adopt run`,
      { focus: false }
    );

    pushLog('[SSE-Diag] diagnosis run adopted:', {
      reason,
      run_id: result.run_id,
      comparison_status: result.comparison_status,
      diff_rows: result.diff_rows.length,
      selected_residue_key: selectedResidueKeyRef.current,
    });
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
      const result = await runDiagnosisForCurrentBaseline('view_mode switch', nextMode);
      if (!result) return;
      adoptDiagnosisRun(result, 'view_mode switch');

      if (!result.output || result.output.residues.length === 0 || result.failed) {
        await restoreBaselineAndRebuild('override unavailable');
        pushLog('[SSE-Diag] view_mode fixed to baseline: override unavailable');
        return;
      }

      stage = 'override apply';
      await applyOverrideAndRebuild(result.output, 'view_mode switch');
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
      rawBackboneRef.current = extractRawBackboneCarrier(plugin, residueKeys, pushLog);
      residueDisplayLabelMapRef.current = extractResidueDisplayLabels(plugin, pushLog);
      pushLog('[SSE-Diag] residueKeys:', residueKeys.length);

      stage = 'override compute';
      const result = await runDiagnosisForCurrentBaseline('pipeline', requestedViewMode);
      if (!result) return;
      adoptDiagnosisRun(result, 'pipeline');

      // quick stats
      pushLog('[SSE-Diag] molstarMap counts:', countLabelsFromMap(molstarMap));
      if (result.output) {
        pushLog('[SSE-Diag] output counts:', countLabelsFromOutput(result.output));
      }

      if (
        requestedViewMode === 'override' &&
        result.output &&
        result.output.residues.length > 0 &&
        !result.failed
      ) {
        stage = 'override apply';
        await applyOverrideAndRebuild(result.output, 'load');
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

  // --- UI composition: left (Table + Diag + controls) / right (Mol* viewer + HUD) ---
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
          Baseline（Mol*標準SSE）と、選択した Engine の Override を比較します。
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

        <label style={{ fontSize: 12 }}>engine</label>
        <select
          value={requestedEngineKey ?? ''}
          onChange={(e) => {
            const next = e.target.value.trim();
            setRequestedEngineKey(next.length > 0 ? next : null);
            pushLog('[SSE-Diag] requested_engine_key updated:', {
              requested_engine_key: next.length > 0 ? next : null,
            });
          }}
          style={{ width: '100%', marginBottom: 8 }}
        >
          <option value="">(default) {DEFAULT_SSE_ENGINE_KEY}</option>
          {SSE_ENGINE_DESCRIPTORS.map((descriptor) => (
            <option key={descriptor.engine_key} value={descriptor.engine_key}>
              {descriptor.engine_key} ({descriptor.engine_name})
              {descriptor.default_override_candidate ? ' [default候補]' : ''}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
          Baseline は Mol* auto を維持し、Override は known methods を軸に比較します。
          {' '}
          既定候補は <code>{DEFAULT_OVERRIDE_CANDIDATE_ENGINE_KEY}</code> です（切替ゲート充足前は固定切替しません）。
        </div>
        {showPrototypeParams && (
          <div style={{ marginBottom: 8, padding: '8px 10px', border: '1px solid #e5e5e5', borderRadius: 8 }}>
            <div style={{ fontSize: 12, marginBottom: 6, color: '#555' }}>
              `prototype.rule` 補助パラメータ
            </div>
            <label style={{ fontSize: 12 }}>param.rangeLo</label>
            <input
              type="number"
              value={prototypeRangeLo}
              onChange={(e) => setPrototypeRangeLo(Number(e.target.value))}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <label style={{ fontSize: 12 }}>param.rangeHi</label>
            <input
              type="number"
              value={prototypeRangeHi}
              onChange={(e) => setPrototypeRangeHi(Number(e.target.value))}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <div style={{ fontSize: 11, color: '#666' }}>
              Known methods には range パラメータを適用しません。
            </div>
          </div>
        )}
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

          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #eee',
              display: 'grid',
              gap: 6,
              background: '#fff',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: '#555' }}>Kind</label>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as DiffKindFilter)}
                style={{ width: '100%' }}
              >
                <option value="all">All</option>
                {kindFilterOptions.map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 12, color: '#555' }}>Chain</label>
              <select value={chainFilter} onChange={(e) => setChainFilter(e.target.value)} style={{ width: '100%' }}>
                <option value="all">All</option>
                {chainFilterOptions.map((chainId) => (
                  <option key={chainId} value={chainId}>
                    {chainId}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>
              Showing {filteredDiffRows.length} / {diffRows.length}
            </div>
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
                {filteredDiffRows.length === 0 ? (
                  <tr>
                    <td style={tableEmptyCellStyle} colSpan={4}>
                      No rows for current filter
                    </td>
                  </tr>
                ) : (
                  filteredDiffRows.map((row, index) => {
                    const selected = selectedDiffRow?.residue_key === row.residue_key;
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

        <SseDiagPanel summary={hudSummary} executionRecords={engineExecutionRecords} />

        {fatal && (
          <pre style={{ whiteSpace: 'pre-wrap', color: '#b00', background: '#fee', padding: 8, marginTop: 10 }}>
            {toUiMessage(fatal)}
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
          diffRowCount={filteredDiffRows.length}
          onPrev={onPrevDiff}
          onNext={onNextDiff}
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
        />
      </div>
    </div>
  );
}

// --- Generic formatting and table helper utilities ---
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

function parseChainIdFromResidueKey(residueKey: string): string {
  const lastColon = residueKey.lastIndexOf(':');
  if (lastColon <= 0) return residueKey;
  return residueKey.slice(0, lastColon);
}

// Applies user-facing table filters over mapped diff review rows.
function filterDiffRows(
  rows: DiffRow[],
  kindFilter: DiffKindFilter,
  chainFilter: string
): DiffRow[] {
  return rows.filter((row) => {
    if (!row.filterable) return false;
    if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
    if (chainFilter !== 'all' && parseChainIdFromResidueKey(row.residue_key) !== chainFilter) return false;
    return true;
  });
}

function buildEngineParams(
  engineKey: string,
  prototypeRangeLo: number,
  prototypeRangeHi: number
): Record<string, string | number | boolean | null | undefined> {
  if (engineKey === PROTOTYPE_ENGINE_KEY) {
    return {
      rangeLo: prototypeRangeLo,
      rangeHi: prototypeRangeHi,
    };
  }
  return {};
}

function createDiagnosisRecord(stage: DiagnosisStage, note: string): DiagnosisRecord {
  const baselineReady = stage !== 'not_ready';
  const overrideReady = stage === 'override_ready' || stage === 'comparison_ready';
  const comparisonReady = stage === 'comparison_ready';
  return {
    diagnosis_stage: stage,
    baseline_ready: baselineReady,
    override_ready: overrideReady,
    comparison_ready: comparisonReady,
    updated_at: new Date().toISOString(),
    note,
  };
}

function summarizeDiagnosisStage(stage: DiagnosisStage): string {
  if (stage === 'baseline_ready') return 'Baseline ready';
  if (stage === 'override_ready') return 'Override ready';
  if (stage === 'comparison_ready') return 'Comparison ready';
  return 'Not ready';
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
    engine_capability: null,
    comparable_count: metricUnavailable('not loaded'),
    candidate_count: metricUnavailable('not loaded'),
    mapped_count: metricUnavailable('not loaded'),
    mapped_rate: metricUnavailable('not loaded'),
    unmapped_total: metricUnavailable('not loaded'),
    ambiguous_count: metricUnavailable('not loaded'),
    review_points_count: metricUnavailable('not loaded'),
    coverage_rate: metricUnavailable('not loaded'),
    degraded_count: metricUnavailable('not loaded'),
    unavailable_count: metricUnavailable('not loaded'),
    unavailable_reasons: [],
    contract_summary: {
      model_policy: DIAGNOSIS_CONTRACT_CONTEXT.model_policy,
      residue_key_policy: DIAGNOSIS_CONTRACT_CONTEXT.residue_key_policy,
      mapping_basis: DIAGNOSIS_CONTRACT_CONTEXT.mapping_basis,
      mapped_count: null,
      candidate_count: null,
      mapped_rate: null,
      engine_summary: DASH,
    },
    contract_detail: {
      baseline_source_kind: DIAGNOSIS_CONTRACT_CONTEXT.baseline_source_kind,
      baseline_resolved_source: DIAGNOSIS_CONTRACT_CONTEXT.baseline_resolved_source,
      baseline_annotation_origin: DIAGNOSIS_CONTRACT_CONTEXT.baseline_annotation_origin ?? null,
      baseline_profile: DIAGNOSIS_CONTRACT_CONTEXT.baseline_profile,
      override_profile: DASH,
      comparison_scope: DIAGNOSIS_CONTRACT_CONTEXT.comparison_scope,
      chain_policy: DIAGNOSIS_CONTRACT_CONTEXT.chain_policy,
      model_policy: DIAGNOSIS_CONTRACT_CONTEXT.model_policy,
      mapping_basis: DIAGNOSIS_CONTRACT_CONTEXT.mapping_basis,
    },
    diagnosis_record: createDiagnosisRecord('not_ready', 'Awaiting mmCIF load'),
    engine_execution_record: null,
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
    ['coverage_rate', summary.coverage_rate],
    ['degraded_count', summary.degraded_count],
    ['unavailable_count', summary.unavailable_count],
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

function formatCoverageSummary(summary: SseComparisonSummary): string {
  if (!summary.coverage_rate.available) return DASH;
  const report = summary.engine_metadata?.coverage_report;
  const degraded = summary.degraded_count.available ? summary.degraded_count.value : 0;
  const unavailable = summary.unavailable_count.available ? summary.unavailable_count.value : 0;
  if (report) {
    return `${report.assigned_total}/${report.candidate_total} (${formatPercent(report.coverage_rate)}), degraded ${degraded}, unavailable ${unavailable}`;
  }
  return `${formatPercent(summary.coverage_rate.value)}, degraded ${degraded}, unavailable ${unavailable}`;
}

function formatContractMappedRate(summary: SseComparisonSummary): string {
  const mapped = summary.contract_summary.mapped_count;
  const candidate = summary.contract_summary.candidate_count;
  const rate = summary.contract_summary.mapped_rate;
  if (mapped === null || candidate === null || rate === null) {
    return DASH;
  }

  return `Mapped ${mapped} / Candidate ${candidate} (${formatPercent(rate)})`;
}

function formatInputProfile(summary: SseComparisonSummary): string {
  const profile = summary.engine_metadata?.input_profile;
  if (!profile) return DASH;
  const entries = Object.entries(profile).map(([key, value]) => `${key}=${String(value)}`);
  return entries.join(', ');
}

function formatCoverageReport(report: EngineCoverageReport | null): string {
  if (!report) return DASH;
  return `${report.assigned_total}/${report.candidate_total} (${formatPercent(report.coverage_rate)}), comparable=${report.comparable_total}`;
}

function formatDegradationSummary(report: EngineDegradationReport | null): string {
  if (!report) return DASH;
  const details = report.details.length > 0 ? report.details.join('; ') : 'details: none';
  return `${report.degraded ? 'degraded' : 'normal'} (${report.degraded_count}) / policy: ${report.policy} / ${details}`;
}

function formatUnavailableReasons(reasons: EngineUnavailableReason[]): string {
  if (reasons.length === 0) return DASH;
  return reasons.map((reason) => `${reason.reason} x${reason.count}`).join(', ');
}

function formatStringList(values: string[] | undefined): string {
  if (!values || values.length === 0) return DASH;
  return values.join(', ');
}

function formatEngineStageOrDash(stage: SseEngineStage | null): string {
  return stage ? formatEngineStage(stage) : DASH;
}

function formatEffectiveParams(exec: EngineExecutionRecord | null, summary: SseComparisonSummary): string {
  const effectiveParams = exec ? exec.effective_params : summary.engine_metadata?.effective_params;
  if (!effectiveParams) return DASH;
  const keys = Object.keys(effectiveParams);
  if (keys.length === 0) return DASH;
  return safeJson(effectiveParams);
}

function formatResolutionMode(mode: EngineResolutionMode): string {
  if (mode === 'direct') return 'direct';
  if (mode === 'default_used') return 'default_used';
  return 'failed_unknown_key';
}

function formatExecutionStatus(status: EngineExecutionRecord['status']): string {
  return status;
}

function toUiMessage(text: string): string {
  return text.replace(/\berror\b/gi, 'notice').replace(/\bfailed\b/gi, 'incomplete');
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
  const baselineResolvedSource = summary.contract_detail.baseline_resolved_source || DASH;
  const overrideAlgorithm =
    summary.comparison_status === 'baseline_only' ? DASH : formatEngineNameVersion(summary);

  const compactText = [
    `Status ${formatStatus(summary.comparison_status)}`,
    `View ${formatViewMode(summary.view_mode)}`,
    `Baseline ${baselineResolvedSource}`,
    `Override ${overrideAlgorithm}`,
    `Coverage ${formatCoverageSummary(summary)}`,
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
              <HudField label="Baseline source" value={baselineResolvedSource} />
              <HudField label="Override algorithm" value={overrideAlgorithm} />
              <HudField label="Coverage" value={formatCoverageSummary(summary)} />
              <HudField label="Degraded" value={formatMetric(summary.degraded_count)} />
              <HudField label="Unavailable" value={formatMetric(summary.unavailable_count)} />
              <HudField label="Comparable" value={formatMetric(summary.comparable_count)} />
              <HudField label="Candidate" value={formatMetric(summary.candidate_count)} />
              <HudField label="Mapped rate" value={formatMappedRate(summary)} />
              <HudField label="Unmapped total" value={formatMetric(summary.unmapped_total)} />
              <HudField label="Ambiguous" value={formatMetric(summary.ambiguous_count)} />
              <HudField label="Engine" value={formatEngineNameVersion(summary)} />
              <HudField label="Visible diff rows" value={String(diffRowCount)} />
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

function SseDiagPanel({
  summary,
  executionRecords,
}: {
  summary: SseComparisonSummary;
  executionRecords: EngineExecutionRecord[];
}) {
  // Current execution summary (single run) comes from summary.engine_execution_record.
  const diagnosisRecord = summary.diagnosis_record;
  const exec = summary.engine_execution_record;
  const engineMetadata = summary.engine_metadata;
  const engineCapability = summary.engine_capability;
  const coverageReport = engineMetadata?.coverage_report ?? exec?.coverage_report ?? null;
  const degradationReport = engineMetadata?.degradation_report ?? exec?.degradation_report ?? null;
  const unavailableReasons = summary.unavailable_reasons;
  // Stale/discard history remains visible separately for auditability.
  const recentStale = executionRecords.filter((record) => record.status === 'discarded_stale').slice(0, 3);
  const stageText = summarizeDiagnosisStage(diagnosisRecord.diagnosis_stage);
  const effectiveParamsText = formatEffectiveParams(exec, summary);
  const resolvedEngineName = exec ? (exec.engine_name ?? DASH) : (engineMetadata?.engine_name ?? DASH);
  const resolvedEngineVersion = exec ? (exec.engine_version ?? DASH) : (engineMetadata?.engine_version ?? DASH);
  const resolvedEngineStage = exec
    ? formatEngineStageOrDash(exec.engine_stage)
    : formatEngineStageOrDash(engineMetadata?.engine_stage ?? null);

  return (
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
        Diag
      </div>
      <div style={{ padding: 10, fontSize: 12, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{stageText}</div>
        <div style={{ color: '#333' }}>{diagnosisRecord.note}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px' }}>
          <HudField label="Diagnosis record" value={diagnosisRecord.updated_at ?? DASH} />
          <HudField label="Baseline ready" value={diagnosisRecord.baseline_ready ? 'Yes' : 'No'} />
          <HudField label="Override ready" value={diagnosisRecord.override_ready ? 'Yes' : 'No'} />
          <HudField label="Comparison ready" value={diagnosisRecord.comparison_ready ? 'Yes' : 'No'} />
          <HudField label="Baseline source kind" value={summary.contract_detail.baseline_source_kind} />
          <HudField label="Baseline resolved source" value={summary.contract_detail.baseline_resolved_source} />
          <HudField label="Baseline annotation origin" value={summary.contract_detail.baseline_annotation_origin ?? DASH} />
          <HudField label="Input profile" value={formatInputProfile(summary)} />
          <HudField label="Coverage summary" value={formatCoverageSummary(summary)} />
        </div>
        <div style={{ fontWeight: 600 }}>Engine execution detail</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px' }}>
          <HudField label="requested_engine_key" value={exec?.requested_engine_key ?? '(default)'} />
          <HudField label="resolved_engine_id" value={exec?.resolved_engine_id ?? DASH} />
          <HudField label="engine_name" value={resolvedEngineName} />
          <HudField label="engine_version" value={resolvedEngineVersion} />
          <HudField label="engine_stage" value={resolvedEngineStage} />
          <HudField label="algorithm_family" value={engineMetadata?.algorithm_family ?? DASH} />
          <HudField label="implementation_origin" value={engineMetadata?.implementation_origin ?? DASH} />
          <HudField label="reference_label" value={engineMetadata?.reference_label ?? DASH} />
          <HudField label="fidelity_class" value={engineMetadata?.fidelity_class ?? DASH} />
          <HudField label="compatibility_claim" value={engineMetadata?.compatibility_claim ?? DASH} />
          <HudField label="implementation_reference" value={engineMetadata?.implementation_reference ?? DASH} />
          <HudField label="upstream_version_label" value={engineMetadata?.upstream_version_label ?? DASH} />
          <HudField label="resolution_mode" value={exec ? formatResolutionMode(exec.resolution_mode) : DASH} />
          <HudField label="run_id" value={exec?.run_id ?? DASH} />
          <HudField label="started_at" value={exec?.started_at ?? DASH} />
          <HudField label="finished_at" value={exec?.finished_at ?? DASH} />
          <HudField label="run_status" value={exec ? formatExecutionStatus(exec.status) : DASH} />
          <HudField label="run_error" value={exec?.error ?? DASH} />
          <HudField label="effective_params" value={effectiveParamsText} />
          <HudField label="capability" value={engineMetadata?.capability_descriptor ?? exec?.capability_descriptor ?? DASH} />
          <HudField
            label="capability.required"
            value={formatStringList(engineCapability?.required_inputs)}
          />
          <HudField
            label="capability.optional"
            value={formatStringList(engineCapability?.optional_inputs)}
          />
          <HudField
            label="capability.unsupported"
            value={formatStringList(engineCapability?.unsupported_conditions)}
          />
          <HudField label="degradation" value={formatDegradationSummary(degradationReport)} />
          <HudField label="coverage" value={formatCoverageReport(coverageReport)} />
          <HudField label="unavailable reasons" value={formatUnavailableReasons(unavailableReasons)} />
        </div>
        {recentStale.length > 0 && (
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontWeight: 600 }}>Recent stale discards</div>
            {recentStale.map((record) => (
              <div key={record.run_id} style={{ color: '#444' }}>
                {record.run_id}: {record.requested_engine_key ?? '(default)'} →{' '}
                {record.resolved_engine_id ?? DASH} / {record.finished_at ?? DASH}
              </div>
            ))}
          </div>
        )}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Contract detail</summary>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px' }}>
            <HudField label="baseline_source_kind" value={summary.contract_detail.baseline_source_kind} />
            <HudField label="baseline_resolved_source" value={summary.contract_detail.baseline_resolved_source} />
            <HudField
              label="baseline_annotation_origin"
              value={summary.contract_detail.baseline_annotation_origin ?? DASH}
            />
            <HudField label="baseline_profile" value={summary.contract_detail.baseline_profile} />
            <HudField label="override_profile" value={summary.contract_detail.override_profile} />
            <HudField label="comparison_scope" value={summary.contract_detail.comparison_scope} />
            <HudField label="chain_policy" value={summary.contract_detail.chain_policy} />
            <HudField label="model_policy" value={summary.contract_detail.model_policy} />
            <HudField label="mapping_basis" value={summary.contract_detail.mapping_basis} />
          </div>
        </details>
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
