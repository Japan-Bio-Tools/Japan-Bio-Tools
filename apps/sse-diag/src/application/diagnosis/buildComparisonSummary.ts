import type { SseMappingResult } from '../../domain/sse/compare';
import type {
  ComparisonStatus,
  DiagnosisRecord,
  DiagnosisStage,
  DiffRow,
  EngineCapabilityReport,
  EngineCoverageReport,
  EngineDegradationReport,
  EngineExecutionRecord,
  EngineUnavailableReason,
  MetricValue,
  SseComparisonSummary,
  SseEngineOutput,
  SseLabel,
  SseViewMode,
} from '../../domain/sse/types';
import { buildContract } from './buildContract';
import type { DiagnosisContractContext } from './types';

type BuildComparisonSummaryInput = {
  baseline_map: Map<string, SseLabel>;
  output: SseEngineOutput | null;
  mapping: SseMappingResult | null;
  diff_rows: DiffRow[];
  comparison_status: ComparisonStatus;
  view_mode: SseViewMode;
  contract_context: DiagnosisContractContext;
  engine_execution_record: EngineExecutionRecord;
  engine_capability: EngineCapabilityReport | null;
  engine_degradation: EngineDegradationReport | null;
  engine_coverage: EngineCoverageReport | null;
  unavailable_reasons: EngineUnavailableReason[];
};

type BuildComparisonSummaryResult = {
  comparison_summary: SseComparisonSummary;
  diagnosis_record: DiagnosisRecord;
};

export function buildComparisonSummary(
  input: BuildComparisonSummaryInput
): BuildComparisonSummaryResult {
  const {
    baseline_map: baselineMap,
    output,
    mapping,
    diff_rows: diffRows,
    comparison_status: comparisonStatus,
    view_mode: viewMode,
    contract_context: contractContext,
    engine_execution_record: executionRecord,
    engine_capability: engineCapability,
    engine_degradation: engineDegradation,
    engine_coverage: engineCoverage,
    unavailable_reasons: unavailableReasons,
  } = input;

  const hasBaseline = baselineMap.size > 0;
  const hasOverride = !!output && output.residues.length > 0;
  const mappingAvailable = hasBaseline && hasOverride && mapping !== null;
  const coverage = engineCoverage ?? output?.coverage ?? output?.metadata?.coverage_report ?? null;
  const degradation =
    engineDegradation ?? output?.degradation ?? output?.metadata?.degradation_report ?? null;
  const unavailableCount =
    coverage?.unavailable_total ?? unavailableReasons.reduce((sum, reason) => sum + reason.count, 0);
  const degradedCount = degradation?.degraded_count ?? coverage?.degraded_total ?? 0;

  const stage = deriveDiagnosisStage(baselineMap, output, mapping);
  const diagnosisRecord = createDiagnosisRecord(
    stage,
    toDiagnosisNote(stage, output, diffRows, coverage, degradedCount, unavailableCount)
  );
  const contract = buildContract({
    comparison_status: comparisonStatus,
    baseline_candidate_count: baselineMap.size,
    mapping: mappingAvailable ? mapping : null,
    engine_metadata: output?.metadata ?? null,
    engine_execution_record: executionRecord,
    contract_context: contractContext,
  });

  return {
    diagnosis_record: diagnosisRecord,
    comparison_summary: {
      comparison_status: comparisonStatus,
      view_mode: viewMode,
      engine_metadata: output?.metadata ?? null,
      engine_capability: engineCapability,
      comparable_count: mappingAvailable
        ? metricAvailable(mapping.stats.mapped_count)
        : metricUnavailable('mapping not available'),
      candidate_count: hasBaseline
        ? metricAvailable(mapping ? mapping.stats.candidate_count : baselineMap.size)
        : metricUnavailable('baseline not available'),
      mapped_count: mappingAvailable
        ? metricAvailable(mapping.stats.mapped_count)
        : metricUnavailable('mapping not available'),
      mapped_rate: mappingAvailable
        ? metricAvailable(mapping.stats.mapped_rate)
        : metricUnavailable('mapping not available'),
      unmapped_total: mappingAvailable
        ? metricAvailable(mapping.stats.unmapped_total)
        : metricUnavailable('mapping not available'),
      ambiguous_count: mappingAvailable
        ? metricAvailable(mapping.stats.ambiguous_count)
        : metricUnavailable('mapping not available'),
      review_points_count: mappingAvailable
        ? metricAvailable(diffRows.length)
        : metricUnavailable('diff not available'),
      coverage_rate: coverage
        ? metricAvailable(coverage.coverage_rate)
        : metricUnavailable('coverage not available'),
      degraded_count: coverage || degradation
        ? metricAvailable(degradedCount)
        : metricUnavailable('degradation not available'),
      unavailable_count: coverage || unavailableReasons.length > 0
        ? metricAvailable(unavailableCount)
        : metricUnavailable('unavailable not available'),
      unavailable_reasons: unavailableReasons,
      contract_summary: contract.contract_summary,
      contract_detail: contract.contract_detail,
      diagnosis_record: diagnosisRecord,
      engine_execution_record: executionRecord,
    },
  };
}

function deriveDiagnosisStage(
  baselineMap: Map<string, SseLabel>,
  output: SseEngineOutput | null,
  mapping: SseMappingResult | null
): DiagnosisStage {
  if (baselineMap.size === 0) return 'not_ready';
  if (!output || output.residues.length === 0) return 'baseline_ready';
  if (!mapping) return 'override_ready';
  return 'comparison_ready';
}

function toDiagnosisNote(
  stage: DiagnosisStage,
  output: SseEngineOutput | null,
  diffRows: DiffRow[],
  coverage: EngineCoverageReport | null,
  degradedCount: number,
  unavailableCount: number
): string {
  if (stage === 'comparison_ready') {
    if (coverage) {
      const rate = (coverage.coverage_rate * 100).toFixed(1);
      return `Comparison ready (${coverage.assigned_total}/${coverage.candidate_total}, coverage ${rate}%, degraded ${degradedCount}, unavailable ${unavailableCount})`;
    }
    if (output?.metadata?.engine_name) return `${output.metadata.engine_name} applied`;
    return `Comparison ready (${diffRows.length} review points)`;
  }
  if (stage === 'override_ready') return 'Override ready';
  if (stage === 'baseline_ready') return 'Baseline ready';
  return 'Awaiting mmCIF load';
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

function metricAvailable<T>(value: T): MetricValue<T> {
  return { available: true, value };
}

function metricUnavailable<T>(reason: string): MetricValue<T> {
  return { available: false, value: null, reason };
}
