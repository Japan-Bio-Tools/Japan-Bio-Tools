import type {
  AdapterSource,
  EntryResolutionStatus,
  ErrorCode,
  EvidenceCode,
  InputType,
  LegacyPdbReasonCode,
  NormalizedMetadataDTO,
  SourceRole,
  UnknownReasonCode,
} from '../types/contracts'

export type NormalizeError = {
  kind: 'error'
  errorCode: Extract<ErrorCode, 'empty_input' | 'invalid_identifier' | 'unsupported_input'>
  message: string
  reason: string
}

export type NormalizedIdentifierInput = {
  kind: 'identifier'
  inputType: Extract<InputType, 'pdb_id' | 'extended_pdb_id'>
  rawText: string
  canonicalIdentifier: string
}

export type NormalizedFileInput = {
  kind: 'file'
  file: File
  formatHint: Extract<InputType, 'local_pdb' | 'local_mmcif'> | null
}

export type NormalizedInput = NormalizeError | NormalizedIdentifierInput | NormalizedFileInput

export type LocalParseError = {
  kind: 'error'
  errorCode: Extract<ErrorCode, 'parse_failed' | 'unsupported_input'>
  message: string
  reason: string
}

export type LocalParseSuccess = {
  kind: 'success'
  inputType: Extract<InputType, 'local_pdb' | 'local_mmcif'>
  metadata: NormalizedMetadataDTO
}

export type LocalParseResult = LocalParseError | LocalParseSuccess

export type AdapterState = 'found' | 'not_found' | 'unavailable'

export type AdapterPayload = {
  resolved_format_hint: NormalizedMetadataDTO['resolved_format_hint']
  archive_exists: boolean | null
  experiment_method: string | null
  record_type_markers: EvidenceCode[]
  provenance_markers: EvidenceCode[]
  model_count: number | null
  chain_count: number | null
  ligand_detected: boolean | null
  water_detected: boolean | null
  legacy_compatibility_hints: LegacyPdbReasonCode[]
}

export type AdapterLookupResult = {
  source: AdapterSource
  role: SourceRole
  state: AdapterState
  payload: AdapterPayload | null
  detail: string
  safe_forward_links_available?: boolean
}

export type MetadataLookup = {
  entryResolutionStatus: EntryResolutionStatus
  metadata: NormalizedMetadataDTO
  outcomes: AdapterLookupResult[]
}

export type ClassificationOutcome = {
  inputType: InputType
  resolvedIdentifier: string | null
  entryResolutionStatus: EntryResolutionStatus
  resolvedFormat: NormalizedMetadataDTO['resolved_format_hint'] | 'unknown'
  recordType: 'experimental_structure' | 'computed_model' | 'integrative_structure' | 'unknown'
  sourceDatabase: 'PDB' | 'AlphaFoldDB' | 'ModelArchive' | 'local_file' | 'unknown'
  experimentMethod: string | null
  modelCount: number | null
  chainCount: number | null
  ligandDetected: boolean | null
  waterDetected: boolean | null
  legacyCompatibility: 'compatible' | 'caution' | 'incompatible' | 'unknown'
  legacyReasonCode: LegacyPdbReasonCode | null
  unknownReasonCode: UnknownReasonCode | null
  confidenceLevel: 'high' | 'medium' | 'low'
  metadataUnavailable: boolean
}
