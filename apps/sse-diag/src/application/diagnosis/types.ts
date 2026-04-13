import type { SseMappingResult } from '../../domain/sse/compare';
import type { SseEngineFactoryParams, SseEngineRegistry } from '../../domain/sse/engine';
import type {
  ComparisonStatus,
  DiagnosisRecord,
  DiffRow,
  EngineCapabilityReport,
  EngineCoverageReport,
  EngineDegradationReport,
  EngineExecutionRecord,
  EngineUnavailableReason,
  DerivedGeometryCarrier,
  RawBackboneCarrier,
  SseComparisonSummary,
  SseEngineOutput,
  SseLabel,
  SseResidueKey,
  SseViewMode,
} from '../../domain/sse/types';

export type DiagnosisContractContext = {
  baseline_source_kind: string;
  baseline_resolved_source: string;
  baseline_annotation_origin?: string | null;
  baseline_profile: string;
  comparison_scope: string;
  chain_policy: string;
  model_policy: string;
  residue_key_policy: string;
  mapping_basis: string;
};

export type RunDiagnosisPipelineInput = {
  run_id: string;
  requested_engine_key: string | null;
  default_engine_key: string;
  engine_registry: SseEngineRegistry;
  engine_params: SseEngineFactoryParams;
  baseline_map: Map<string, SseLabel>;
  residue_keys: SseResidueKey[];
  residue_display_labels: Map<string, string>;
  raw_backbone: RawBackboneCarrier;
  derived_geometry?: DerivedGeometryCarrier | null;
  contract_context: DiagnosisContractContext;
  view_mode: SseViewMode;
  is_run_current?: (runId: string) => boolean;
  now?: () => string;
};

export type StaleDisposition = 'fresh' | 'stale_candidate';

export type RunDiagnosisPipelineResult = {
  run_id: string;
  comparison_status: ComparisonStatus;
  output: SseEngineOutput | null;
  mapping: SseMappingResult | null;
  diff_rows: DiffRow[];
  comparison_summary: SseComparisonSummary;
  diagnosis_record: DiagnosisRecord;
  engine_execution_record: EngineExecutionRecord;
  engine_capability: EngineCapabilityReport | null;
  engine_degradation: EngineDegradationReport | null;
  engine_coverage: EngineCoverageReport | null;
  unavailable_reasons: EngineUnavailableReason[];
  stale_disposition: StaleDisposition;
  failed: boolean;
};
