export type SseLabel = 'H' | 'E' | 'C';

export type ComparisonStatus = 'full' | 'partial' | 'baseline_only';

export type SseViewMode = 'baseline' | 'override';

export type SseEngineStage = 'prototype' | 'experimental' | 'reference_like';

export type MetricValue<T> =
  | { available: true; value: T }
  | { available: false; value: null; reason?: string };

export type SseEngineMetadata = {
  engine_id: string;
  engine_name: string;
  engine_version: string;
  engine_stage: SseEngineStage;
  engine_input_schema_version: string;
  input_profile: Record<string, string | number | boolean | null>;
  effective_params?: Record<string, string | number | boolean | null>;
  computed_at?: string;
};

export type ComparisonContractSummary = {
  model_policy: string;
  residue_key_policy: string;
  mapping_basis: string;
  mapped_count: number | null;
  candidate_count: number | null;
  mapped_rate: number | null;
  engine_summary: string;
};

export type ComparisonContractDetail = {
  baseline_profile: string;
  override_profile: string;
  comparison_scope: string;
  chain_policy: string;
  model_policy: string;
  mapping_basis: string;
};

export type DiagnosisStage = 'not_ready' | 'baseline_ready' | 'override_ready' | 'comparison_ready';

export type DiagnosisRecord = {
  diagnosis_stage: DiagnosisStage;
  baseline_ready: boolean;
  override_ready: boolean;
  comparison_ready: boolean;
  updated_at: string | null;
  note: string;
};

export type EngineResolutionMode = 'direct' | 'default_used' | 'failed_unknown_key';

export type EngineExecutionStatus =
  | 'running'
  | 'failed_resolution'
  | 'failed_execution'
  | 'completed'
  | 'discarded_stale';

export type EngineExecutionRecord = {
  run_id: string;
  requested_engine_key: string | null;
  resolved_engine_id: string | null;
  resolution_mode: EngineResolutionMode;
  status: EngineExecutionStatus;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  engine_name: string | null;
  engine_version: string | null;
  engine_stage: SseEngineStage | null;
  effective_params?: Record<string, string | number | boolean | null>;
};

export type DiffKind =
  | 'LabelFlip_HC'
  | 'LabelFlip_EC'
  | 'LabelFlip_HE'
  | 'BoundaryShift'
  | 'Singleton'
  | 'Other';

export type DiffKindLabel =
  | 'Helix/Coil反転'
  | 'Sheet/Coil反転'
  | 'Helix/Sheet反転'
  | '境界ズレ'
  | '孤立差分'
  | 'その他';

export type DiffRow = {
  residue_key: string;
  display_residue: string;
  baseline_label: SseLabel;
  override_label: SseLabel;
  kind: DiffKind;
  kind_label: DiffKindLabel;
  sort_key: number;
  filterable: boolean;
};

export type SseComparisonSummary = {
  comparison_status: ComparisonStatus;
  view_mode: SseViewMode;
  engine_metadata: SseEngineMetadata | null;
  comparable_count: MetricValue<number>;
  candidate_count: MetricValue<number>;
  mapped_count: MetricValue<number>;
  mapped_rate: MetricValue<number>;
  unmapped_total: MetricValue<number>;
  ambiguous_count: MetricValue<number>;
  review_points_count: MetricValue<number>;
  contract_summary: ComparisonContractSummary;
  contract_detail: ComparisonContractDetail;
  diagnosis_record: DiagnosisRecord;
  engine_execution_record: EngineExecutionRecord | null;
};

export type ResidueKey = {
  chainId: string;      // label_asym_id
  labelSeqId: number;   // label_seq_id
};

export type ResidueSseRecord = ResidueKey & {
  sse: SseLabel;
  energy: number;       // 将来WASMが返す（MVPは0でOK）
};

export type SseEngineInput = {
  residues: ResidueKey[];
};

export type SseEngineOutput = {
  residues: ResidueSseRecord[];
  metadata?: SseEngineMetadata;
};

export type SseResidueKey = ResidueKey;
