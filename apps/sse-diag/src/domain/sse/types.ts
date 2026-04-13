export type SseLabel = 'H' | 'E' | 'C';

export type ComparisonStatus = 'full' | 'partial' | 'baseline_only';

export type SseViewMode = 'baseline' | 'override';

export type SseEngineStage = 'prototype' | 'experimental' | 'reference_like';

export type SseFidelityClass =
  | 'prototype'
  | 'method_inspired'
  | 'explicit_reimplementation'
  | 'upstream_wrapped';

export type SseImplementationOrigin =
  | 'internal'
  | 'ported'
  | 'wrapped_upstream'
  | 'external_reference';

export type MetricValue<T> =
  | { available: true; value: T }
  | { available: false; value: null; reason?: string };

export type ResidueKey = {
  chainId: string;      // label_asym_id
  labelSeqId: number;   // label_seq_id
};

export type SseResidueKey = ResidueKey;

export type BackboneAtomName = 'N' | 'CA' | 'C' | 'O';

export type Coordinate3D = [number, number, number];

export type RawBackboneResidue = ResidueKey & {
  residue_key: string;
  atoms: Partial<Record<BackboneAtomName, Coordinate3D>>;
  has_required_backbone: boolean;
  missing_required_atoms: BackboneAtomName[];
  missing_optional_atoms: BackboneAtomName[];
};

export type RawBackboneCarrier = {
  source: string;
  required_atoms: BackboneAtomName[];
  optional_atoms: BackboneAtomName[];
  residue_count: number;
  missing_required_count: number;
  missing_optional_count: number;
  residues: RawBackboneResidue[];
};

export type DerivedGeometryResidue = ResidueKey & {
  residue_key: string;
  phi?: number | null;
  psi?: number | null;
  omega?: number | null;
};

export type DerivedGeometryCarrier = {
  source: string;
  residue_count: number;
  residues: DerivedGeometryResidue[];
};

export type EngineInputRequirements = {
  required_inputs: string[];
  optional_inputs: string[];
  unavailable_policy: string;
  degraded_policy: string;
};

export type EngineCapabilityReport = {
  required_inputs: string[];
  optional_inputs: string[];
  unsupported_conditions: string[];
};

export type EngineUnavailableReason = {
  reason: string;
  count: number;
};

export type EngineCoverageReport = {
  candidate_total: number;
  assigned_total: number;
  comparable_total: number;
  degraded_total: number;
  unavailable_total: number;
  coverage_rate: number;
  comparable_rate: number;
  unavailable_reasons: EngineUnavailableReason[];
};

export type EngineDegradationReport = {
  degraded: boolean;
  degraded_count: number;
  reason_summary: string;
  details: string[];
  /**
   * degraded は「required input 未達だが engine 固有 policy に従って assignment を返した状態」。
   * この policy 文字列は、通常 assignment と同一品質でないことを監査可能にするために保持する。
   */
  policy: string;
};

/**
 * Engine-provided execution metadata used by SSE-Diag summaries.
 * This is attached to one engine output and must stay independent from Mol* adapter internals.
 */
export type SseEngineMetadata = {
  engine_id: string;
  engine_name: string;
  engine_version: string;
  engine_stage: SseEngineStage;
  engine_input_schema_version: string;
  algorithm_family: string;
  implementation_origin: SseImplementationOrigin;
  reference_label: string;
  fidelity_class: SseFidelityClass;
  compatibility_claim: string;
  implementation_reference?: string | null;
  upstream_version_label?: string | null;
  input_requirements: EngineInputRequirements;
  capability_descriptor?: string;
  coverage_report?: EngineCoverageReport;
  degradation_report?: EngineDegradationReport;
  input_profile: Record<string, string | number | boolean | null>;
  effective_params?: Record<string, string | number | boolean | null>;
  computed_at?: string;
};

/**
 * Compact contract fields shown in HUD-level UI.
 * This summary must remain stable and auditable even when detail wording changes.
 */
export type ComparisonContractSummary = {
  model_policy: string;
  residue_key_policy: string;
  mapping_basis: string;
  mapped_count: number | null;
  candidate_count: number | null;
  mapped_rate: number | null;
  engine_summary: string;
};

/**
 * Expanded contract fields for Diag/audit view.
 * Kept separate from summary so table/HUD responsibilities stay minimal.
 */
export type ComparisonContractDetail = {
  baseline_source_kind: string;
  baseline_resolved_source: string;
  baseline_annotation_origin?: string | null;
  baseline_profile: string;
  override_profile: string;
  comparison_scope: string;
  chain_policy: string;
  model_policy: string;
  mapping_basis: string;
};

export type DiagnosisStage = 'not_ready' | 'baseline_ready' | 'override_ready' | 'comparison_ready';

/**
 * Lightweight user-facing diagnosis progress.
 * This is not an engine execution history record.
 */
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

/**
 * Audit-oriented per-run record for engine resolution/execution.
 * Distinct from diagnosis stage and intended to preserve stale/discard history.
 */
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
  capability_descriptor?: string | null;
  coverage_report?: EngineCoverageReport | null;
  degradation_report?: EngineDegradationReport | null;
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

/**
 * SSE-Diag-owned comparison truth used by HUD/Table/Diag.
 * Mol* adapters can render/act on this state, but must not become its owner.
 */
export type SseComparisonSummary = {
  comparison_status: ComparisonStatus;
  view_mode: SseViewMode;
  engine_metadata: SseEngineMetadata | null;
  engine_capability: EngineCapabilityReport | null;
  comparable_count: MetricValue<number>;
  candidate_count: MetricValue<number>;
  mapped_count: MetricValue<number>;
  mapped_rate: MetricValue<number>;
  unmapped_total: MetricValue<number>;
  ambiguous_count: MetricValue<number>;
  review_points_count: MetricValue<number>;
  coverage_rate: MetricValue<number>;
  degraded_count: MetricValue<number>;
  unavailable_count: MetricValue<number>;
  unavailable_reasons: EngineUnavailableReason[];
  contract_summary: ComparisonContractSummary;
  contract_detail: ComparisonContractDetail;
  diagnosis_record: DiagnosisRecord;
  engine_execution_record: EngineExecutionRecord | null;
};

export type ResidueSseRecord = ResidueKey & {
  sse: SseLabel;
  energy: number;       // 将来WASMが返す（MVPは0でOK）
  assignment_quality?: 'standard' | 'degraded';
  degradation_reason?: string | null;
};

export type SseEngineInputV2 = {
  schema_version: 'engine-input.v2';
  residues: ResidueKey[];
  raw_backbone: RawBackboneCarrier;
  derived_geometry?: DerivedGeometryCarrier | null;
};

export type SseEngineInput = SseEngineInputV2;

export type SseEngineOutput = {
  residues: ResidueSseRecord[];
  metadata?: SseEngineMetadata;
  capability?: EngineCapabilityReport;
  degradation?: EngineDegradationReport;
  coverage?: EngineCoverageReport;
  unavailable_reasons?: EngineUnavailableReason[];
};
