import type { SseMappingResult } from '../../domain/sse/compare';
import type {
  ComparisonContractDetail,
  ComparisonContractSummary,
  ComparisonStatus,
  EngineExecutionRecord,
  SseEngineMetadata,
} from '../../domain/sse/types';
import type { DiagnosisContractContext } from './types';

const DASH = '—';

type BuildContractInput = {
  comparison_status: ComparisonStatus;
  baseline_candidate_count: number;
  mapping: SseMappingResult | null;
  engine_metadata: SseEngineMetadata | null;
  engine_execution_record: EngineExecutionRecord;
  contract_context: DiagnosisContractContext;
};

type BuildContractResult = {
  contract_summary: ComparisonContractSummary;
  contract_detail: ComparisonContractDetail;
};

export function buildContract(input: BuildContractInput): BuildContractResult {
  const {
    comparison_status: comparisonStatus,
    baseline_candidate_count: baselineCandidateCount,
    mapping,
    engine_metadata: engineMetadata,
    engine_execution_record: executionRecord,
    contract_context: contractContext,
  } = input;

  const mappingAvailable = mapping !== null;
  const mappedCount = mappingAvailable ? mapping.stats.mapped_count : null;
  const candidateCount = mappingAvailable
    ? mapping.stats.candidate_count
    : baselineCandidateCount;
  const mappedRate = mappingAvailable ? mapping.stats.mapped_rate : null;
  const engineSummary = buildEngineSummary(engineMetadata, executionRecord);

  return {
    contract_summary: {
      model_policy: contractContext.model_policy,
      residue_key_policy: contractContext.residue_key_policy,
      mapping_basis: contractContext.mapping_basis,
      mapped_count: mappedCount,
      candidate_count: candidateCount,
      mapped_rate: mappedRate,
      engine_summary: comparisonStatus === 'baseline_only' ? DASH : engineSummary,
    },
    contract_detail: {
      baseline_profile: contractContext.baseline_profile,
      override_profile:
        comparisonStatus === 'baseline_only'
          ? DASH
          : buildOverrideProfile(engineMetadata, executionRecord),
      comparison_scope: contractContext.comparison_scope,
      chain_policy: contractContext.chain_policy,
      model_policy: contractContext.model_policy,
      mapping_basis: contractContext.mapping_basis,
    },
  };
}

function buildOverrideProfile(
  engineMetadata: SseEngineMetadata | null,
  executionRecord: EngineExecutionRecord
): string {
  const requestedEngineKey = executionRecord.requested_engine_key ?? '(default)';
  const resolvedEngineId =
    executionRecord.resolved_engine_id ?? engineMetadata?.engine_id ?? 'unresolved';
  const engineName =
    engineMetadata?.engine_name ?? executionRecord.engine_name ?? 'unknown';
  const effectiveParams =
    engineMetadata?.effective_params ?? executionRecord.effective_params ?? {};

  const effectiveParamsText =
    Object.keys(effectiveParams).length > 0 ? JSON.stringify(effectiveParams) : '{}';

  return `requested=${requestedEngineKey}; resolved=${resolvedEngineId}; engine=${engineName}; effective_params=${effectiveParamsText}`;
}

function buildEngineSummary(
  engineMetadata: SseEngineMetadata | null,
  executionRecord: EngineExecutionRecord
): string {
  if (engineMetadata) {
    return `${engineMetadata.engine_name} ${engineMetadata.engine_version} (${formatEngineStage(engineMetadata.engine_stage)})`;
  }

  const engineName =
    executionRecord.engine_name ??
    executionRecord.resolved_engine_id ??
    executionRecord.requested_engine_key;
  if (!engineName) return DASH;

  return executionRecord.engine_stage
    ? `${engineName} (${formatEngineStage(executionRecord.engine_stage)})`
    : engineName;
}

function formatEngineStage(stage: 'prototype' | 'experimental' | 'reference_like'): string {
  if (stage === 'reference_like') return 'Reference-like';
  if (stage === 'experimental') return 'Experimental';
  return 'Prototype';
}
