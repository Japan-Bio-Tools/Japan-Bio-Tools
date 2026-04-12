import { buildSseMappingResult } from '../../domain/sse/compare';
import { resolveSseEngineDescriptor } from '../../domain/sse/engine';
import type { EngineExecutionRecord } from '../../domain/sse/types';
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
    });
  }

  const engineInput = buildEngineInput(input);
  try {
    const engine = resolution.descriptor.create(input.engine_params);
    const output = await engine.compute(engineInput);
    const completedRecord: EngineExecutionRecord = {
      ...runningRecord,
      status: 'completed',
      error: null,
      finished_at: now(),
      engine_name: output.metadata?.engine_name ?? resolution.descriptor.engine_name,
      engine_version: output.metadata?.engine_version ?? null,
      engine_stage: output.metadata?.engine_stage ?? resolution.descriptor.engine_stage,
      effective_params: output.metadata?.effective_params ?? normalizedEngineParams,
    };
    const mapping = buildSseMappingResult(input.baseline_map, output.residues);
    const diffRows = buildDiffRows(mapping, input.residue_display_labels);
    return buildRunResult({
      input,
      output,
      mapping,
      diff_rows: diffRows,
      failed: false,
      engine_execution_record: completedRecord,
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
    stale_disposition: staleDisposition,
    failed: args.failed,
  };
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
