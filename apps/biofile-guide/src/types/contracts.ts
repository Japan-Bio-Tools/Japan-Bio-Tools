export const SCHEMA_VERSION = '1.0.0' as const

export type InputType = 'pdb_id' | 'extended_pdb_id' | 'local_pdb' | 'local_mmcif'
export type EntryResolutionStatus = 'verified' | 'not_found' | 'unresolved'
export type ResolvedFormat = 'pdb' | 'mmcif' | 'unknown'
export type RecordType =
  | 'experimental_structure'
  | 'computed_model'
  | 'integrative_structure'
  | 'unknown'
export type SourceDatabase = 'PDB' | 'AlphaFoldDB' | 'ModelArchive' | 'local_file' | 'unknown'
export type LigandStatus = 'detected' | 'not_detected' | 'unknown'
export type WaterStatus = 'detected' | 'not_detected' | 'unknown'
export type LegacyPdbCompatibility = 'compatible' | 'caution' | 'incompatible' | 'unknown'
export type ConfidenceScope = 'primary_classification'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type LegacyPdbReasonCode =
  | 'extended_id_requires_mmcif'
  | 'integrative_not_supported_in_pdb'
  | 'mmcif_only_representation'
  | 'size_or_schema_risk'
  | 'unknown_origin'

export type EvidenceCode =
  | 'explicit_exptl_method'
  | 'explicit_modelcif_marker'
  | 'explicit_ihm_marker'
  | 'pdb_identifier_detected'
  | 'extended_pdb_identifier_detected'
  | 'explicit_pdb_archive_provenance'
  | 'explicit_alphafolddb_provenance'
  | 'explicit_modelarchive_provenance'
  | 'multiple_models_detected'
  | 'single_model_detected'
  | 'multiple_chains_detected'
  | 'single_chain_detected'
  | 'water_records_detected'
  | 'ligand_records_detected'
  | 'local_file_without_reliable_provenance'
  | 'legacy_pdb_incompatibility_marker'
  | 'legacy_pdb_caution_marker'
  | 'format_pdb_detected'
  | 'format_mmcif_detected'
  | 'metadata_primary_source_used'
  | 'metadata_secondary_source_used'
  | 'metadata_tertiary_source_used'
  | 'metadata_source_conflict_detected'
  | 'external_metadata_lookup_failed'
  | 'metadata_secondary_lookup_failed'
  | 'metadata_tertiary_lookup_failed'

export type UnknownReasonCode =
  | 'insufficient_evidence'
  | 'conflicting_evidence'
  | 'unresolved_provenance'
  | 'parse_limited'
  | 'unsupported_representation_boundary'
  | 'metadata_temporarily_unavailable'

export type WarningCode =
  | 'legacy_pdb_risk'
  | 'multiple_models_present'
  | 'multiple_chains_present'
  | 'ligand_present'
  | 'water_present'
  | 'origin_uncertain'
  | 'classification_low_confidence'
  | 'integrative_representation_caution'
  | 'external_metadata_temporarily_unavailable'

export type DestinationType =
  | 'canonical_entry'
  | 'viewer_remote'
  | 'viewer_local_guide'
  | 'guide_article'
  | 'search_entry'
  | 'internal_guide'

export type RecommendedNextStepCode =
  | 'open_rcsb_entry'
  | 'open_pdbe_entry'
  | 'open_pdbj_entry'
  | 'open_molstar_remote'
  | 'open_icn3d_remote'
  | 'open_molstar_local_guide'
  | 'open_molmil_local_guide'
  | 'check_origin_metadata'
  | 'check_format_and_retry'
  | 'read_beginner_guide'

export type ErrorCode =
  | 'parse_failed'
  | 'unsupported_input'
  | 'empty_input'
  | 'invalid_identifier'
  | 'entry_not_found'
  | 'unknown_classification'
  | 'file_too_large'
  | 'timeout_exceeded'
  | 'external_metadata_unavailable'

export interface EvidenceItem {
  code: EvidenceCode
  detail: string
}

export interface Confidence {
  scope: ConfidenceScope
  level: ConfidenceLevel
}

export interface NextLink {
  label: string
  reason: string
  destination_type: DestinationType
  href: string
}

export interface SuccessResult {
  input_type: InputType
  resolved_identifier: string | null
  entry_resolution_status: EntryResolutionStatus
  resolved_format: ResolvedFormat
  record_type: RecordType
  source_database: SourceDatabase
  experiment_method: string | null
  model_count: number | null
  chain_count: number | null
  ligand_status: LigandStatus
  water_status: WaterStatus
  legacy_pdb_compatibility: LegacyPdbCompatibility
  legacy_pdb_reason_code: LegacyPdbReasonCode | null
  legacy_pdb_reason_text: string | null
  confidence: Confidence
  warning_codes: WarningCode[]
  beginner_warning: string[]
  unknown_reason_code: UnknownReasonCode | null
  evidence: EvidenceItem[]
  recommended_next_step_code: RecommendedNextStepCode
  recommended_next_step: string
  next_links: NextLink[]
}

export interface SuccessEnvelope {
  schema_version: typeof SCHEMA_VERSION
  status: 'success'
  result: SuccessResult
}

export interface ErrorEnvelope {
  schema_version: typeof SCHEMA_VERSION
  status: 'error'
  error: {
    error_code: ErrorCode
    message: string
    reason: string
    confirmed_facts: EvidenceItem[]
    recommended_next_step_code: RecommendedNextStepCode
    recommended_next_step: string
    next_links: NextLink[]
  }
}

export type BioFileEnvelope = SuccessEnvelope | ErrorEnvelope

export type AdapterSource = 'RCSB' | 'PDBe' | 'PDBj'
export type SourceRole = 'primary' | 'secondary' | 'tertiary'

export interface NormalizedMetadataDTO {
  input_type: InputType
  resolved_identifier: string | null
  entry_resolution_status: EntryResolutionStatus | null
  resolved_format_hint: Exclude<ResolvedFormat, 'unknown'> | null
  archive_exists: boolean | null
  experiment_method: string | null
  record_type_markers: EvidenceCode[]
  provenance_markers: EvidenceCode[]
  model_count: number | null
  chain_count: number | null
  ligand_detected: boolean | null
  water_detected: boolean | null
  legacy_compatibility_hints: LegacyPdbReasonCode[]
  source_used: SourceRole[]
  source_conflicts: string[]
}
