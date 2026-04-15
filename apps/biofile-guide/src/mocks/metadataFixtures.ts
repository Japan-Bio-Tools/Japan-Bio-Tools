import type { AdapterLookupResult, AdapterPayload } from '../application/pipelineTypes'
import type { AdapterSource, SourceRole } from '../types/contracts'

type FixtureEntry = {
  state: AdapterLookupResult['state']
  detail: string
  payload: AdapterPayload | null
  safe_forward_links_available?: boolean
}

type FixtureSourceMap = Record<string, FixtureEntry>

const FIXTURES: Record<AdapterSource, FixtureSourceMap> = {
  RCSB: {
    '1CRN': {
      state: 'found',
      detail: 'RCSB fixture hit',
      payload: {
        resolved_format_hint: 'pdb',
        archive_exists: true,
        experiment_method: 'X-RAY DIFFRACTION',
        record_type_markers: ['explicit_exptl_method'],
        provenance_markers: ['explicit_pdb_archive_provenance'],
        model_count: 1,
        chain_count: 1,
        ligand_detected: false,
        water_detected: true,
        legacy_compatibility_hints: [],
      },
    },
    'pdb_00001abc': {
      state: 'found',
      detail: 'RCSB fixture hit',
      payload: {
        resolved_format_hint: 'mmcif',
        archive_exists: true,
        experiment_method: null,
        record_type_markers: ['explicit_modelcif_marker'],
        provenance_markers: ['explicit_pdb_archive_provenance'],
        model_count: null,
        chain_count: null,
        ligand_detected: null,
        water_detected: null,
        legacy_compatibility_hints: ['extended_id_requires_mmcif', 'size_or_schema_risk'],
      },
    },
    '2UNV': {
      state: 'unavailable',
      detail: 'RCSB fixture unavailable',
      payload: null,
      safe_forward_links_available: false,
    },
  },
  PDBe: {
    '1CRN': {
      state: 'found',
      detail: 'PDBe fixture hit',
      payload: {
        resolved_format_hint: 'pdb',
        archive_exists: true,
        experiment_method: 'X-RAY DIFFRACTION',
        record_type_markers: ['explicit_exptl_method'],
        provenance_markers: ['explicit_pdb_archive_provenance'],
        model_count: 1,
        chain_count: 1,
        ligand_detected: false,
        water_detected: true,
        legacy_compatibility_hints: [],
      },
    },
    'pdb_00001abc': {
      state: 'found',
      detail: 'PDBe fixture conflict marker',
      payload: {
        resolved_format_hint: 'mmcif',
        archive_exists: true,
        experiment_method: null,
        record_type_markers: ['explicit_ihm_marker'],
        provenance_markers: ['explicit_pdb_archive_provenance'],
        model_count: null,
        chain_count: null,
        ligand_detected: null,
        water_detected: null,
        legacy_compatibility_hints: ['integrative_not_supported_in_pdb'],
      },
    },
    '2UNV': {
      state: 'unavailable',
      detail: 'PDBe fixture unavailable',
      payload: null,
      safe_forward_links_available: false,
    },
  },
  PDBj: {
    '1CRN': {
      state: 'found',
      detail: 'PDBj fixture hit',
      payload: {
        resolved_format_hint: 'pdb',
        archive_exists: true,
        experiment_method: null,
        record_type_markers: [],
        provenance_markers: [],
        model_count: null,
        chain_count: null,
        ligand_detected: null,
        water_detected: null,
        legacy_compatibility_hints: [],
      },
    },
    'pdb_00001abc': {
      state: 'unavailable',
      detail: 'PDBj fixture unavailable',
      payload: null,
    },
    '2UNV': {
      state: 'unavailable',
      detail: 'PDBj fixture unavailable',
      payload: null,
      safe_forward_links_available: false,
    },
  },
}

function fallbackNotFound(source: AdapterSource): FixtureEntry {
  return {
    state: 'not_found',
    detail: `${source} fixture not found`,
    payload: null,
  }
}

export function getMetadataFixture(
  source: AdapterSource,
  role: SourceRole,
  identifier: string,
): AdapterLookupResult {
  const entry = FIXTURES[source][identifier] ?? fallbackNotFound(source)
  return {
    source,
    role,
    state: entry.state,
    detail: entry.detail,
    payload: entry.payload,
    safe_forward_links_available: entry.safe_forward_links_available,
  }
}
