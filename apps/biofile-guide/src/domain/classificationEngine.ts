import type { ClassificationOutcome, NormalizedInput, AdapterLookupResult } from '../application/pipelineTypes'
import type {
  ErrorCode,
  InputType,
  LegacyPdbReasonCode,
  NormalizedMetadataDTO,
  RecordType,
  SourceDatabase,
  UnknownReasonCode,
} from '../types/contracts'

export type ClassificationError = {
  kind: 'error'
  errorCode: Extract<ErrorCode, 'entry_not_found' | 'external_metadata_unavailable' | 'unknown_classification'>
  message: string
  reason: string
}

export type ClassificationResult =
  | {
      kind: 'success'
      outcome: ClassificationOutcome
    }
  | ClassificationError

function deriveResolvedFormat(inputType: InputType, metadata: NormalizedMetadataDTO): ClassificationOutcome['resolvedFormat'] {
  if (inputType === 'pdb_id' || inputType === 'local_pdb') {
    return 'pdb'
  }
  if (inputType === 'extended_pdb_id' || inputType === 'local_mmcif') {
    return 'mmcif'
  }
  return metadata.resolved_format_hint ?? 'unknown'
}

function deriveRecordType(
  metadata: NormalizedMetadataDTO,
  metadataUnavailable: boolean,
): { recordType: RecordType; unknownReason: UnknownReasonCode | null } {
  const hasExptl = metadata.record_type_markers.includes('explicit_exptl_method')
  const hasModelCif = metadata.record_type_markers.includes('explicit_modelcif_marker')
  const hasIhm = metadata.record_type_markers.includes('explicit_ihm_marker')
  const markerKinds = [hasExptl, hasModelCif, hasIhm].filter(Boolean).length

  if (markerKinds > 1) {
    return { recordType: 'unknown', unknownReason: 'conflicting_evidence' }
  }
  if (hasExptl) {
    return { recordType: 'experimental_structure', unknownReason: null }
  }
  if (hasModelCif) {
    return { recordType: 'computed_model', unknownReason: null }
  }
  if (hasIhm) {
    return { recordType: 'integrative_structure', unknownReason: null }
  }
  if (metadataUnavailable) {
    return { recordType: 'unknown', unknownReason: 'metadata_temporarily_unavailable' }
  }
  return { recordType: 'unknown', unknownReason: 'insufficient_evidence' }
}

function hasConflictingStrongProvenance(metadata: NormalizedMetadataDTO): boolean {
  return (
    metadata.provenance_markers.includes('explicit_alphafolddb_provenance') &&
    metadata.provenance_markers.includes('explicit_modelarchive_provenance')
  )
}

function deriveSourceDatabase(inputType: InputType, metadata: NormalizedMetadataDTO): SourceDatabase {
  if (inputType === 'pdb_id' || inputType === 'extended_pdb_id') {
    return metadata.entry_resolution_status === 'verified' ? 'PDB' : 'unknown'
  }
  if (hasConflictingStrongProvenance(metadata)) {
    return 'unknown'
  }
  if (metadata.provenance_markers.includes('explicit_alphafolddb_provenance')) {
    return 'AlphaFoldDB'
  }
  if (metadata.provenance_markers.includes('explicit_modelarchive_provenance')) {
    return 'ModelArchive'
  }
  return 'local_file'
}

function deriveLegacyCompatibility(
  inputType: InputType,
  resolvedFormat: ClassificationOutcome['resolvedFormat'],
  recordType: RecordType,
  metadata: NormalizedMetadataDTO,
): {
  compatibility: ClassificationOutcome['legacyCompatibility']
  reasonCode: LegacyPdbReasonCode | null
} {
  if (inputType === 'extended_pdb_id') {
    return { compatibility: 'incompatible', reasonCode: 'extended_id_requires_mmcif' }
  }
  if (recordType === 'integrative_structure') {
    return { compatibility: 'incompatible', reasonCode: 'integrative_not_supported_in_pdb' }
  }
  if (resolvedFormat === 'mmcif') {
    const reason = metadata.legacy_compatibility_hints[0] ?? 'size_or_schema_risk'
    return { compatibility: 'caution', reasonCode: reason }
  }
  if (resolvedFormat === 'pdb') {
    return { compatibility: 'compatible', reasonCode: null }
  }
  return { compatibility: 'unknown', reasonCode: 'unknown_origin' }
}

function deriveConfidenceLevel(recordType: RecordType, metadata: NormalizedMetadataDTO): ClassificationOutcome['confidenceLevel'] {
  const strongEvidenceCount =
    metadata.record_type_markers.filter((marker) =>
      ['explicit_exptl_method', 'explicit_modelcif_marker', 'explicit_ihm_marker'].includes(marker),
    ).length +
    metadata.provenance_markers.filter((marker) =>
      ['explicit_pdb_archive_provenance', 'explicit_alphafolddb_provenance', 'explicit_modelarchive_provenance'].includes(
        marker,
      ),
    ).length

  if (recordType !== 'unknown' && strongEvidenceCount >= 2) {
    return 'high'
  }
  if (recordType !== 'unknown' && strongEvidenceCount >= 1) {
    return 'medium'
  }
  return 'low'
}

function metadataUnavailable(outcomes: AdapterLookupResult[]): boolean {
  const primary = outcomes.find((item) => item.role === 'primary')
  const secondary = outcomes.find((item) => item.role === 'secondary')
  return primary?.state === 'unavailable' && secondary?.state === 'unavailable'
}

function safeForwardLinksAvailable(outcomes: AdapterLookupResult[]): boolean {
  const explicitAvailability = outcomes
    .map((item) => item.safe_forward_links_available)
    .filter((value): value is boolean => value !== undefined)

  return explicitAvailability.length === 0 || explicitAvailability.some(Boolean)
}

export function runClassification(
  normalizedInput: Exclude<NormalizedInput, { kind: 'error' }>,
  metadata: NormalizedMetadataDTO,
  outcomes: AdapterLookupResult[],
): ClassificationResult {
  if (
    normalizedInput.kind === 'identifier' &&
    metadata.entry_resolution_status === 'not_found'
  ) {
    return {
      kind: 'error',
      errorCode: 'entry_not_found',
      message: '該当エントリが確認できませんでした。',
      reason: '形式は妥当ですが、Primary/Secondary の存在確認で該当エントリが見つかりませんでした。',
    }
  }

  const unavailable = metadataUnavailable(outcomes)
  if (
    normalizedInput.kind === 'identifier' &&
    unavailable &&
    metadata.entry_resolution_status === 'unresolved'
  ) {
    if (!safeForwardLinksAvailable(outcomes)) {
      return {
        kind: 'error',
        errorCode: 'external_metadata_unavailable',
        message: '外部メタデータを現在確認できません。',
        reason: 'Primary/Secondary が一時取得不能で、安全な前進導線を確定できませんでした。',
      }
    }
  }

  const inputType: InputType =
    normalizedInput.kind === 'identifier' ? normalizedInput.inputType : metadata.input_type
  const resolvedIdentifier = normalizedInput.kind === 'identifier' ? normalizedInput.canonicalIdentifier : null
  const resolvedFormat = deriveResolvedFormat(inputType, metadata)
  const recordTypeResult = deriveRecordType(metadata, unavailable)
  const sourceDatabase = deriveSourceDatabase(inputType, metadata)
  const legacy = deriveLegacyCompatibility(inputType, resolvedFormat, recordTypeResult.recordType, metadata)
  const confidenceLevel =
    sourceDatabase === 'unknown' ? 'low' : deriveConfidenceLevel(recordTypeResult.recordType, metadata)

  let unknownReasonCode: UnknownReasonCode | null = recordTypeResult.unknownReason
  if (sourceDatabase === 'unknown' && unknownReasonCode === null) {
    unknownReasonCode = hasConflictingStrongProvenance(metadata) ? 'conflicting_evidence' : 'unresolved_provenance'
  }

  return {
    kind: 'success',
    outcome: {
      inputType,
      resolvedIdentifier,
      entryResolutionStatus: metadata.entry_resolution_status ?? 'unresolved',
      resolvedFormat,
      recordType: recordTypeResult.recordType,
      sourceDatabase,
      experimentMethod: metadata.experiment_method,
      modelCount: metadata.model_count,
      chainCount: metadata.chain_count,
      ligandDetected: metadata.ligand_detected,
      waterDetected: metadata.water_detected,
      legacyCompatibility: legacy.compatibility,
      legacyReasonCode: legacy.reasonCode,
      unknownReasonCode,
      confidenceLevel,
      metadataUnavailable: unavailable,
    },
  }
}
