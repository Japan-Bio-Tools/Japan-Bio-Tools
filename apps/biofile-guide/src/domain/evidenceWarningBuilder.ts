import type { AdapterLookupResult, ClassificationOutcome } from '../application/pipelineTypes'
import { WARNING_PRIORITY, WARNING_TEXT_MAP } from './contractConstants'
import type {
  EvidenceCode,
  EvidenceItem,
  NormalizedMetadataDTO,
  WarningCode,
} from '../types/contracts'

function addEvidence(
  target: EvidenceItem[],
  code: EvidenceCode,
  detail: string,
): void {
  if (target.some((item) => item.code === code)) {
    return
  }
  target.push({ code, detail })
}

function sortWarningCodes(codes: WarningCode[]): WarningCode[] {
  return [...new Set(codes)].sort((a, b) => WARNING_PRIORITY.indexOf(a) - WARNING_PRIORITY.indexOf(b))
}

export function buildEvidenceAndWarnings(
  outcome: ClassificationOutcome,
  metadata: NormalizedMetadataDTO,
  adapterOutcomes: AdapterLookupResult[],
): {
  evidence: EvidenceItem[]
  warningCodes: WarningCode[]
  beginnerWarnings: string[]
} {
  const evidence: EvidenceItem[] = []
  const warningCodes: WarningCode[] = []

  if (outcome.inputType === 'pdb_id') {
    addEvidence(evidence, 'pdb_identifier_detected', '4文字PDB IDを検出しました。')
  }
  if (outcome.inputType === 'extended_pdb_id') {
    addEvidence(
      evidence,
      'extended_pdb_identifier_detected',
      '拡張PDB ID (`pdb_` + 8文字) を検出しました。',
    )
  }
  if (outcome.resolvedFormat === 'pdb') {
    addEvidence(evidence, 'format_pdb_detected', 'PDB形式として解釈しました。')
  } else if (outcome.resolvedFormat === 'mmcif') {
    addEvidence(evidence, 'format_mmcif_detected', 'mmCIF形式として解釈しました。')
  }

  metadata.record_type_markers.forEach((marker) =>
    addEvidence(evidence, marker, '判定に使える record_type 根拠を取得しました。'),
  )
  metadata.provenance_markers.forEach((marker) =>
    addEvidence(evidence, marker, '判定に使える provenance 根拠を取得しました。'),
  )

  if (outcome.modelCount !== null) {
    addEvidence(
      evidence,
      outcome.modelCount > 1 ? 'multiple_models_detected' : 'single_model_detected',
      `モデル数: ${outcome.modelCount}`,
    )
  }
  if (outcome.chainCount !== null) {
    addEvidence(
      evidence,
      outcome.chainCount > 1 ? 'multiple_chains_detected' : 'single_chain_detected',
      `鎖数: ${outcome.chainCount}`,
    )
  }
  if (outcome.ligandDetected === true) {
    addEvidence(evidence, 'ligand_records_detected', 'リガンド記録を検出しました。')
  }
  if (outcome.waterDetected === true) {
    addEvidence(evidence, 'water_records_detected', '水分子記録を検出しました。')
  }

  adapterOutcomes.forEach((adapterOutcome) => {
    if (adapterOutcome.state === 'found') {
      if (adapterOutcome.role === 'primary') {
        addEvidence(evidence, 'metadata_primary_source_used', 'Primary (RCSB) を利用しました。')
      }
      if (adapterOutcome.role === 'secondary') {
        addEvidence(evidence, 'metadata_secondary_source_used', 'Secondary (PDBe) を利用しました。')
      }
      if (adapterOutcome.role === 'tertiary') {
        addEvidence(evidence, 'metadata_tertiary_source_used', 'Tertiary (PDBj) を利用しました。')
      }
    }
    if (adapterOutcome.role === 'secondary' && adapterOutcome.state === 'unavailable') {
      addEvidence(
        evidence,
        'metadata_secondary_lookup_failed',
        'Secondary メタデータ取得が一時失敗しました。',
      )
    }
    if (adapterOutcome.role === 'tertiary' && adapterOutcome.state === 'unavailable') {
      addEvidence(
        evidence,
        'metadata_tertiary_lookup_failed',
        'Tertiary メタデータ取得が一時失敗しました。',
      )
    }
  })

  const primary = adapterOutcomes.find((item) => item.role === 'primary')
  const secondary = adapterOutcomes.find((item) => item.role === 'secondary')
  if (primary?.state === 'unavailable' && secondary?.state === 'unavailable') {
    addEvidence(
      evidence,
      'external_metadata_lookup_failed',
      'Primary/Secondary メタデータ取得が一時失敗しました。',
    )
    warningCodes.push('external_metadata_temporarily_unavailable')
  }
  if (metadata.source_conflicts.length > 0) {
    addEvidence(evidence, 'metadata_source_conflict_detected', '複数ソースで強い根拠が競合しています。')
  }

  if (outcome.legacyCompatibility === 'caution' || outcome.legacyCompatibility === 'incompatible') {
    warningCodes.push('legacy_pdb_risk')
    addEvidence(
      evidence,
      outcome.legacyCompatibility === 'incompatible'
        ? 'legacy_pdb_incompatibility_marker'
        : 'legacy_pdb_caution_marker',
      'legacy PDB 互換性に注意が必要です。',
    )
  }
  if (outcome.modelCount !== null && outcome.modelCount > 1) {
    warningCodes.push('multiple_models_present')
  }
  if (outcome.chainCount !== null && outcome.chainCount > 1) {
    warningCodes.push('multiple_chains_present')
  }
  if (outcome.ligandDetected === true) {
    warningCodes.push('ligand_present')
  }
  if (outcome.waterDetected === true) {
    warningCodes.push('water_present')
  }
  if (outcome.recordType === 'integrative_structure') {
    warningCodes.push('integrative_representation_caution')
  }
  if (outcome.confidenceLevel === 'low') {
    warningCodes.push('classification_low_confidence')
  }
  if (outcome.sourceDatabase === 'local_file' && outcome.recordType === 'unknown') {
    warningCodes.push('origin_uncertain')
  }
  if (outcome.metadataUnavailable) {
    warningCodes.push('external_metadata_temporarily_unavailable')
  }

  const sortedWarnings = sortWarningCodes(warningCodes)
  const beginnerWarnings = sortedWarnings.map((code) => WARNING_TEXT_MAP[code])

  return {
    evidence,
    warningCodes: sortedWarnings,
    beginnerWarnings,
  }
}
