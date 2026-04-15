import type { AdapterLookupResult } from '../application/pipelineTypes'
import type { InputType, NormalizedMetadataDTO } from '../types/contracts'

const SOURCE_PRIORITY = ['RCSB', 'PDBe', 'PDBj'] as const

function bySourcePriority(a: AdapterLookupResult, b: AdapterLookupResult): number {
  return SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source)
}

function firstDefined<T>(items: Array<T | null | undefined>): T | null {
  for (const item of items) {
    if (item !== null && item !== undefined) {
      return item
    }
  }
  return null
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

export function mergeMetadataFromAdapters(
  inputType: Extract<InputType, 'pdb_id' | 'extended_pdb_id'>,
  resolvedIdentifier: string,
  outcomes: AdapterLookupResult[],
): NormalizedMetadataDTO {
  const found = outcomes.filter((outcome) => outcome.state === 'found' && outcome.payload !== null)
  const ordered = [...found].sort(bySourcePriority)
  const recordTypeMarkers = unique(ordered.flatMap((item) => item.payload?.record_type_markers ?? []))
  const provenanceMarkers = unique(ordered.flatMap((item) => item.payload?.provenance_markers ?? []))
  const sourceConflicts: string[] = []

  if (
    recordTypeMarkers.includes('explicit_modelcif_marker') &&
    recordTypeMarkers.includes('explicit_ihm_marker')
  ) {
    sourceConflicts.push('record_type_conflict_modelcif_vs_ihm')
  }
  if (
    provenanceMarkers.includes('explicit_alphafolddb_provenance') &&
    provenanceMarkers.includes('explicit_modelarchive_provenance')
  ) {
    sourceConflicts.push('provenance_conflict_alphafolddb_vs_modelarchive')
  }

  return {
    input_type: inputType,
    resolved_identifier: resolvedIdentifier,
    entry_resolution_status: null,
    resolved_format_hint: firstDefined(ordered.map((item) => item.payload?.resolved_format_hint)),
    archive_exists: firstDefined(ordered.map((item) => item.payload?.archive_exists)),
    experiment_method: firstDefined(ordered.map((item) => item.payload?.experiment_method)),
    record_type_markers: recordTypeMarkers,
    provenance_markers: provenanceMarkers,
    model_count: firstDefined(ordered.map((item) => item.payload?.model_count)),
    chain_count: firstDefined(ordered.map((item) => item.payload?.chain_count)),
    ligand_detected: firstDefined(ordered.map((item) => item.payload?.ligand_detected)),
    water_detected: firstDefined(ordered.map((item) => item.payload?.water_detected)),
    legacy_compatibility_hints: unique(
      ordered.flatMap((item) => item.payload?.legacy_compatibility_hints ?? []),
    ),
    source_used: unique(ordered.map((item) => item.role)),
    source_conflicts: sourceConflicts,
  }
}
