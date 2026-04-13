import { buildSseMappingResult } from '../../domain/sse/compare';
import { resolveSseEngineDescriptor } from '../../domain/sse/engine';
import type {
  EngineCapabilityReport,
  EngineCoverageReport,
  EngineDegradationReport,
  EngineExecutionRecord,
  EngineUnavailableReason,
  ResidueSseRecord,
} from '../../domain/sse/types';
import { buildComparisonSummary } from './buildComparisonSummary';
import { buildDiffRows } from './buildDiffRows';
import { buildEngineInput } from './buildEngineInput';
import { deriveComparisonStatus } from './deriveComparisonStatus';
import type {
  RunDiagnosisPipelineInput,
  RunDiagnosisPipelineResult,
  StaleDisposition,
} from './types';

export async function runDiagnosisPipeline(
  input: RunDiagnosisPipelineInput
): Promise<RunDiagnosisPipelineResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const normalizedEngineParams = normalizeEngineParams(input.engine_params);
  const resolution = resolveSseEngineDescriptor(
    input.engine_registry,
    input.requested_engine_key,
    input.default_engine_key
  );

  const runningRecord: EngineExecutionRecord = {
    run_id: input.run_id,
    requested_engine_key: resolution.requested_engine_key,
    resolved_engine_id: resolution.resolved_engine_id,
    resolution_mode: resolution.resolution_mode,
    status: 'running',
    error: null,
    started_at: now(),
    finished_at: null,
    engine_name: resolution.descriptor?.engine_name ?? null,
    engine_version: null,
    engine_stage: resolution.descriptor?.engine_stage ?? null,
    effective_params: normalizedEngineParams,
  };

  if (!resolution.descriptor || !resolution.resolved_engine_id) {
    const failedResolutionRecord: EngineExecutionRecord = {
      ...runningRecord,
      status: 'failed_resolution',
      error: resolution.error ?? 'engine resolution failed',
      finished_at: now(),
    };
    return buildRunResult({
      input,
      output: null,
      mapping: null,
      diff_rows: [],
      failed: true,
      engine_execution_record: failedResolutionRecord,
      engine_capability: null,
      engine_degradation: null,
      engine_coverage: null,
      unavailable_reasons: [],
    });
  }

  const engineInput = buildEngineInput(input);
  try {
    const engine = resolution.descriptor.create(input.engine_params);
    const output = await engine.compute(engineInput);
    const diagnostics = extractEngineDiagnostics(output);
    const comparableResidues = toComparableResidues(output.residues);
    const completedRecord: EngineExecutionRecord = {
      ...runningRecord,
      status: 'completed',
      error: null,
      finished_at: now(),
      engine_name: output.metadata?.engine_name ?? resolution.descriptor.engine_name,
      engine_version: output.metadata?.engine_version ?? null,
      engine_stage: output.metadata?.engine_stage ?? resolution.descriptor.engine_stage,
      effective_params: output.metadata?.effective_params ?? normalizedEngineParams,
      capability_descriptor: output.metadata?.capability_descriptor ?? null,
      coverage_report: diagnostics.engine_coverage,
      degradation_report: diagnostics.engine_degradation,
    };
    const mapping = buildSseMappingResult(input.baseline_map, comparableResidues);
    const diffRows = buildDiffRows(mapping, input.residue_display_labels);
    return buildRunResult({
      input,
      output,
      mapping,
      diff_rows: diffRows,
      failed: false,
      engine_execution_record: completedRecord,
      ...diagnostics,
    });
  } catch (error) {
    const failedExecutionRecord: EngineExecutionRecord = {
      ...runningRecord,
      status: 'failed_execution',
      error: errorToMessage(error),
      finished_at: now(),
    };
    return buildRunResult({
      input,
      output: null,
      mapping: null,
      diff_rows: [],
      failed: true,
      engine_execution_record: failedExecutionRecord,
      engine_capability: null,
      engine_degradation: null,
      engine_coverage: null,
      unavailable_reasons: [],
    });
  }
}

function buildRunResult(args: {
  input: RunDiagnosisPipelineInput;
  output: RunDiagnosisPipelineResult['output'];
  mapping: RunDiagnosisPipelineResult['mapping'];
  diff_rows: RunDiagnosisPipelineResult['diff_rows'];
  failed: boolean;
  engine_execution_record: EngineExecutionRecord;
  engine_capability: EngineCapabilityReport | null;
  engine_degradation: EngineDegradationReport | null;
  engine_coverage: EngineCoverageReport | null;
  unavailable_reasons: EngineUnavailableReason[];
}): RunDiagnosisPipelineResult {
  const comparisonStatus = deriveComparisonStatus({
    baseline_map: args.input.baseline_map,
    output: args.output,
    mapping: args.mapping,
    failed: args.failed,
  });

  const comparison = buildComparisonSummary({
    baseline_map: args.input.baseline_map,
    output: args.output,
    mapping: args.mapping,
    diff_rows: args.diff_rows,
    comparison_status: comparisonStatus,
    view_mode: args.input.view_mode,
    contract_context: args.input.contract_context,
    engine_execution_record: args.engine_execution_record,
    engine_capability: args.engine_capability,
    engine_degradation: args.engine_degradation,
    engine_coverage: args.engine_coverage,
    unavailable_reasons: args.unavailable_reasons,
  });

  const staleDisposition = deriveStaleDisposition(args.input);
  return {
    run_id: args.input.run_id,
    comparison_status: comparisonStatus,
    output: args.output,
    mapping: args.mapping,
    diff_rows: args.diff_rows,
    comparison_summary: comparison.comparison_summary,
    diagnosis_record: comparison.diagnosis_record,
    engine_execution_record: args.engine_execution_record,
    engine_capability: args.engine_capability,
    engine_degradation: args.engine_degradation,
    engine_coverage: args.engine_coverage,
    unavailable_reasons: args.unavailable_reasons,
    stale_disposition: staleDisposition,
    failed: args.failed,
  };
}

function toComparableResidues(residues: ResidueSseRecord[]): ResidueSseRecord[] {
  return residues.filter((residue) => residue.assignment_quality !== 'degraded');
}

function extractEngineDiagnostics(output: {
  capability?: EngineCapabilityReport;
  degradation?: EngineDegradationReport;
  coverage?: EngineCoverageReport;
  unavailable_reasons?: EngineUnavailableReason[];
  metadata?: {
    input_requirements: {
      required_inputs: string[];
      optional_inputs: string[];
    };
    coverage_report?: EngineCoverageReport;
    degradation_report?: EngineDegradationReport;
  };
}): {
  engine_capability: EngineCapabilityReport | null;
  engine_degradation: EngineDegradationReport | null;
  engine_coverage: EngineCoverageReport | null;
  unavailable_reasons: EngineUnavailableReason[];
} {
  const engineCapability =
    output.capability ??
    (output.metadata
      ? {
          required_inputs: output.metadata.input_requirements.required_inputs,
          optional_inputs: output.metadata.input_requirements.optional_inputs,
          unsupported_conditions: [],
        }
      : null);
  const engineCoverage = output.coverage ?? output.metadata?.coverage_report ?? null;
  const engineDegradation = output.degradation ?? output.metadata?.degradation_report ?? null;
  const unavailableReasons = normalizeUnavailableReasons(
    output.unavailable_reasons ?? engineCoverage?.unavailable_reasons ?? []
  );

  return {
    engine_capability: engineCapability,
    engine_degradation: engineDegradation,
    engine_coverage: engineCoverage,
    unavailable_reasons: unavailableReasons,
  };
}

function normalizeUnavailableReasons(
  reasons: EngineUnavailableReason[]
): EngineUnavailableReason[] {
  const merged = new Map<string, number>();
  for (const reason of reasons) {
    if (!reason.reason || reason.count <= 0) continue;
    merged.set(reason.reason, (merged.get(reason.reason) ?? 0) + reason.count);
  }
  return Array.from(merged.entries()).map(([reason, count]) => ({ reason, count }));
}

function deriveStaleDisposition(input: RunDiagnosisPipelineInput): StaleDisposition {
  if (!input.is_run_current) return 'fresh';
  return input.is_run_current(input.run_id) ? 'fresh' : 'stale_candidate';
}

function normalizeEngineParams(
  params: RunDiagnosisPipelineInput['engine_params']
): Record<string, string | number | boolean | null> {
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    normalized[key] = value;
  }
  return normalized;
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}
