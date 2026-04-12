import type { SseMappingResult } from '../../domain/sse/compare';
import type {
  ComparisonStatus,
  DiagnosisRecord,
  DiagnosisStage,
  DiffRow,
  EngineExecutionRecord,
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
  } = input;

  const hasBaseline = baselineMap.size > 0;
  const hasOverride = !!output && output.residues.length > 0;
  const mappingAvailable = hasBaseline && hasOverride && mapping !== null;

  const stage = deriveDiagnosisStage(baselineMap, output, mapping);
  const diagnosisRecord = createDiagnosisRecord(stage, toDiagnosisNote(stage, output, diffRows));
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
  diffRows: DiffRow[]
): string {
  if (stage === 'comparison_ready') {
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
