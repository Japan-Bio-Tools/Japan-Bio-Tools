import type { LocalParseResult } from '../application/pipelineTypes'
import type { EvidenceCode, LegacyPdbReasonCode, NormalizedMetadataDTO } from '../types/contracts'

function createBaseMetadata(): NormalizedMetadataDTO {
  return {
    input_type: 'local_pdb',
    resolved_identifier: null,
    entry_resolution_status: 'unresolved',
    resolved_format_hint: null,
    archive_exists: null,
    experiment_method: null,
    record_type_markers: [],
    provenance_markers: [],
    model_count: null,
    chain_count: null,
    ligand_detected: null,
    water_detected: null,
    legacy_compatibility_hints: [],
    source_used: [],
    source_conflicts: [],
  }
}

function uniqueArray<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function detectMmCif(text: string): boolean {
  return /(^|\n)data_/i.test(text) && /(_atom_site|_entity|_struct)/i.test(text)
}

function detectPdb(text: string): boolean {
  return /(^(ATOM|HETATM|MODEL|ENDMDL|HEADER|EXPDTA))/m.test(text)
}

function parsePdbContent(text: string, metadata: NormalizedMetadataDTO): void {
  const lines = text.split(/\r?\n/)
  const chains = new Set<string>()
  let modelRecords = 0
  let hasAtom = false
  let hasLigand = false
  let hasWater = false
  const markers: EvidenceCode[] = []
  const legacyHints: LegacyPdbReasonCode[] = []

  for (const line of lines) {
    if (line.startsWith('EXPDTA')) {
      metadata.experiment_method = line.replace('EXPDTA', '').trim() || null
      markers.push('explicit_exptl_method')
    }

    if (line.startsWith('MODEL')) {
      modelRecords += 1
    }

    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      hasAtom = true
      const chain = line.length > 21 ? line[21].trim() : ''
      if (chain.length > 0) {
        chains.add(chain)
      }
    }

    if (line.startsWith('HETATM')) {
      const residue = line.length >= 20 ? line.slice(17, 20).trim().toUpperCase() : ''
      if (residue === 'HOH' || residue === 'WAT') {
        hasWater = true
      } else {
        hasLigand = true
      }
    }
  }

  if (modelRecords > 0) {
    metadata.model_count = modelRecords
    markers.push(modelRecords > 1 ? 'multiple_models_detected' : 'single_model_detected')
  } else if (hasAtom) {
    metadata.model_count = 1
    markers.push('single_model_detected')
  }

  if (chains.size > 0) {
    metadata.chain_count = chains.size
    markers.push(chains.size > 1 ? 'multiple_chains_detected' : 'single_chain_detected')
  }

  metadata.ligand_detected = hasLigand
  metadata.water_detected = hasWater

  if (hasLigand) {
    markers.push('ligand_records_detected')
  }
  if (hasWater) {
    markers.push('water_records_detected')
  }

  if (/alphafold/i.test(text)) {
    metadata.provenance_markers.push('explicit_alphafolddb_provenance')
  }
  if (/modelarchive/i.test(text)) {
    metadata.provenance_markers.push('explicit_modelarchive_provenance')
  }
  if (/IHM|integrative/i.test(text)) {
    metadata.record_type_markers.push('explicit_ihm_marker')
    legacyHints.push('integrative_not_supported_in_pdb')
  }
  if (/MODELCIF/i.test(text)) {
    metadata.record_type_markers.push('explicit_modelcif_marker')
  }
  if (metadata.provenance_markers.length === 0) {
    metadata.provenance_markers.push('local_file_without_reliable_provenance')
  }
  if (legacyHints.length > 0) {
    metadata.legacy_compatibility_hints = uniqueArray(legacyHints)
  }
  metadata.record_type_markers = uniqueArray([...metadata.record_type_markers, ...markers])
}

function parseMmCifContent(text: string, metadata: NormalizedMetadataDTO): void {
  const markers: EvidenceCode[] = []
  const legacyHints: LegacyPdbReasonCode[] = ['mmcif_only_representation']

  if (/_exptl\.method/i.test(text)) {
    const match = text.match(/_exptl\.method\s+(.+)/i)
    metadata.experiment_method = match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null
    markers.push('explicit_exptl_method')
  }
  if (/modelcif/i.test(text) || /_ma_model_list/i.test(text)) {
    markers.push('explicit_modelcif_marker')
  }
  if (/_ihm_/i.test(text) || /integrative/i.test(text)) {
    markers.push('explicit_ihm_marker')
    legacyHints.push('integrative_not_supported_in_pdb')
  }
  if (/alphafold/i.test(text)) {
    metadata.provenance_markers.push('explicit_alphafolddb_provenance')
  }
  if (/modelarchive/i.test(text)) {
    metadata.provenance_markers.push('explicit_modelarchive_provenance')
  }
  if (metadata.provenance_markers.length === 0) {
    metadata.provenance_markers.push('local_file_without_reliable_provenance')
  }

  if (/^ATOM/m.test(text) || /^HETATM/m.test(text) || /_atom_site\./i.test(text)) {
    metadata.model_count = null
    metadata.chain_count = null
  }
  metadata.record_type_markers = uniqueArray([...metadata.record_type_markers, ...markers])
  metadata.legacy_compatibility_hints = uniqueArray(legacyHints)
  metadata.ligand_detected = null
  metadata.water_detected = null
}

export async function parseLocalStructureInput(
  file: File,
  formatHint: 'local_pdb' | 'local_mmcif' | null,
): Promise<LocalParseResult> {
  const text = await file.text()
  const metadata = createBaseMetadata()

  let resolvedInputType: 'local_pdb' | 'local_mmcif' | null = formatHint
  if (resolvedInputType === null) {
    if (detectPdb(text)) {
      resolvedInputType = 'local_pdb'
    } else if (detectMmCif(text)) {
      resolvedInputType = 'local_mmcif'
    }
  }

  if (resolvedInputType === null) {
    return {
      kind: 'error',
      errorCode: 'parse_failed',
      message: 'ローカルファイルの構文を判定できませんでした。',
      reason: 'PDB または mmCIF の構文として認識できる内容を選択してください。',
    }
  }

  metadata.input_type = resolvedInputType
  metadata.resolved_format_hint = resolvedInputType === 'local_pdb' ? 'pdb' : 'mmcif'
  if (resolvedInputType === 'local_pdb') {
    parsePdbContent(text, metadata)
  } else {
    parseMmCifContent(text, metadata)
  }

  return {
    kind: 'success',
    inputType: resolvedInputType,
    metadata,
  }
}
