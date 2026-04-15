import type { AdapterPayload, AdapterLookupResult } from '../application/pipelineTypes'
import type { AdapterSource, SourceRole } from '../types/contracts'

export type RecordedFixtureState = AdapterLookupResult['state']
export type RecordedFixtureCase =
  | 'found'
  | 'not_found'
  | 'unavailable'
  | 'partial'
  | 'conflict_marker'

export type RecordedCapture =
  | {
      kind: 'http_json'
      status: number
      body: unknown
    }
  | {
      kind: 'http_status'
      status: number
    }
  | {
      kind: 'network_error'
      message: string
    }
  | {
      kind: 'timeout'
    }

export type RecordedMetadataFixture = {
  provider: AdapterSource
  caseType: RecordedFixtureCase
  identifier: string
  capture: RecordedCapture
  state: RecordedFixtureState
  detail: string
  payload: AdapterPayload | null
  safe_forward_links_available?: boolean
}

function createFixture(
  provider: AdapterSource,
  caseType: RecordedFixtureCase,
  identifier: string,
  capture: RecordedCapture,
  state: RecordedFixtureState,
  detail: string,
  payload: AdapterPayload | null,
  safeForwardLinksAvailable?: boolean,
): RecordedMetadataFixture {
  return {
    provider,
    caseType,
    identifier,
    capture,
    state,
    detail,
    payload,
    safe_forward_links_available: safeForwardLinksAvailable,
  }
}

const RCSB_RECORDER: RecordedMetadataFixture[] = [
  createFixture(
    'RCSB',
    'found',
    '1CRN',
    {
      kind: 'http_json',
      status: 200,
      body: {
        entry: { id: '1CRN' },
        exptl: [{ method: 'X-RAY DIFFRACTION' }],
        rcsb_entry_info: {
          deposited_model_count: 1,
          deposited_polymer_entity_instance_count: 1,
          deposited_nonpolymer_entity_instance_count: 0,
          deposited_water_count: 1,
        },
      },
    },
    'found',
    'RCSB recorded fixture (found)',
    {
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
  ),
  createFixture(
    'RCSB',
    'conflict_marker',
    'pdb_00001abc',
    {
      kind: 'http_json',
      status: 200,
      body: {
        entry: { id: 'pdb_00001abc' },
        rcsb_entry_info: { model_count: null },
      },
    },
    'found',
    'RCSB recorded fixture (conflict marker)',
    {
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
  ),
  createFixture(
    'RCSB',
    'partial',
    '9SPA',
    {
      kind: 'http_json',
      status: 200,
      body: {
        entry: { id: '9SPA' },
      },
    },
    'found',
    'RCSB recorded fixture (partial)',
    {
      resolved_format_hint: 'pdb',
      archive_exists: true,
      experiment_method: null,
      record_type_markers: [],
      provenance_markers: ['explicit_pdb_archive_provenance'],
      model_count: null,
      chain_count: null,
      ligand_detected: null,
      water_detected: null,
      legacy_compatibility_hints: [],
    },
  ),
  createFixture(
    'RCSB',
    'not_found',
    '9NF0',
    {
      kind: 'http_status',
      status: 404,
    },
    'not_found',
    'RCSB recorded fixture (not found)',
    null,
  ),
  createFixture(
    'RCSB',
    'unavailable',
    '2UNV',
    {
      kind: 'network_error',
      message: 'network unavailable',
    },
    'unavailable',
    'RCSB recorded fixture (unavailable)',
    null,
    false,
  ),
  createFixture(
    'RCSB',
    'unavailable',
    '9UOK',
    {
      kind: 'timeout',
    },
    'unavailable',
    'RCSB recorded fixture (unavailable with safe forward links)',
    null,
    true,
  ),
]

const PDBE_RECORDER: RecordedMetadataFixture[] = [
  createFixture(
    'PDBe',
    'found',
    '1CRN',
    {
      kind: 'http_json',
      status: 200,
      body: {
        '1crn': [
          {
            experimental_method: ['X-ray diffraction'],
            number_of_models: 1,
            number_of_chains: 1,
            number_of_entities: {
              ligand: 0,
              water: 1,
            },
          },
        ],
      },
    },
    'found',
    'PDBe recorded fixture (found)',
    {
      resolved_format_hint: 'pdb',
      archive_exists: true,
      experiment_method: 'X-ray diffraction',
      record_type_markers: ['explicit_exptl_method'],
      provenance_markers: ['explicit_pdb_archive_provenance'],
      model_count: 1,
      chain_count: 1,
      ligand_detected: false,
      water_detected: true,
      legacy_compatibility_hints: [],
    },
  ),
  createFixture(
    'PDBe',
    'conflict_marker',
    'pdb_00001abc',
    {
      kind: 'http_json',
      status: 200,
      body: {
        'pdb_00001abc': [
          {
            number_of_models: null,
            number_of_chains: null,
          },
        ],
      },
    },
    'found',
    'PDBe recorded fixture (conflict marker)',
    {
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
  ),
  createFixture(
    'PDBe',
    'partial',
    '9SPA',
    {
      kind: 'http_json',
      status: 200,
      body: {
        '9spa': [
          {
            number_of_models: 1,
          },
        ],
      },
    },
    'found',
    'PDBe recorded fixture (partial)',
    {
      resolved_format_hint: 'pdb',
      archive_exists: true,
      experiment_method: null,
      record_type_markers: [],
      provenance_markers: ['explicit_pdb_archive_provenance'],
      model_count: 1,
      chain_count: null,
      ligand_detected: null,
      water_detected: null,
      legacy_compatibility_hints: [],
    },
  ),
  createFixture(
    'PDBe',
    'not_found',
    '9NF0',
    {
      kind: 'http_status',
      status: 404,
    },
    'not_found',
    'PDBe recorded fixture (not found)',
    null,
  ),
  createFixture(
    'PDBe',
    'unavailable',
    '2UNV',
    {
      kind: 'network_error',
      message: 'network unavailable',
    },
    'unavailable',
    'PDBe recorded fixture (unavailable)',
    null,
    false,
  ),
  createFixture(
    'PDBe',
    'unavailable',
    '9UOK',
    {
      kind: 'timeout',
    },
    'unavailable',
    'PDBe recorded fixture (unavailable with safe forward links)',
    null,
    true,
  ),
]

const PDBJ_RECORDER: RecordedMetadataFixture[] = [
  createFixture(
    'PDBj',
    'found',
    '1CRN',
    {
      kind: 'http_json',
      status: 200,
      body: {
        results: [{ pdbid: '1CRN' }],
      },
    },
    'found',
    'PDBj recorded fixture (found)',
    {
      resolved_format_hint: 'pdb',
      archive_exists: true,
      experiment_method: null,
      record_type_markers: [],
      provenance_markers: ['explicit_pdb_archive_provenance'],
      model_count: null,
      chain_count: null,
      ligand_detected: null,
      water_detected: null,
      legacy_compatibility_hints: [],
    },
  ),
  createFixture(
    'PDBj',
    'conflict_marker',
    'pdb_00001abc',
    {
      kind: 'http_json',
      status: 200,
      body: {
        results: [{ pdbid: 'PDB_00001ABC' }],
      },
    },
    'found',
    'PDBj recorded fixture (conflict marker)',
    {
      resolved_format_hint: 'mmcif',
      archive_exists: true,
      experiment_method: null,
      record_type_markers: [],
      provenance_markers: ['explicit_modelarchive_provenance'],
      model_count: null,
      chain_count: null,
      ligand_detected: null,
      water_detected: null,
      legacy_compatibility_hints: ['extended_id_requires_mmcif'],
    },
  ),
  createFixture(
    'PDBj',
    'partial',
    '9SPA',
    {
      kind: 'http_json',
      status: 200,
      body: {
        results: [{ pdbid: '9SPA', model_count: 1 }],
      },
    },
    'found',
    'PDBj recorded fixture (partial)',
    {
      resolved_format_hint: 'pdb',
      archive_exists: true,
      experiment_method: null,
      record_type_markers: [],
      provenance_markers: ['explicit_pdb_archive_provenance'],
      model_count: 1,
      chain_count: null,
      ligand_detected: null,
      water_detected: null,
      legacy_compatibility_hints: [],
    },
  ),
  createFixture(
    'PDBj',
    'not_found',
    '9NF0',
    {
      kind: 'http_status',
      status: 404,
    },
    'not_found',
    'PDBj recorded fixture (not found)',
    null,
  ),
  createFixture(
    'PDBj',
    'unavailable',
    '2UNV',
    {
      kind: 'network_error',
      message: 'network unavailable',
    },
    'unavailable',
    'PDBj recorded fixture (unavailable)',
    null,
    false,
  ),
  createFixture(
    'PDBj',
    'unavailable',
    '9UOK',
    {
      kind: 'timeout',
    },
    'unavailable',
    'PDBj recorded fixture (unavailable with safe forward links)',
    null,
    true,
  ),
]

export const RECORDED_METADATA_FIXTURES: Record<AdapterSource, RecordedMetadataFixture[]> = {
  RCSB: RCSB_RECORDER,
  PDBe: PDBE_RECORDER,
  PDBj: PDBJ_RECORDER,
}

function fallbackNotFound(source: AdapterSource): RecordedMetadataFixture {
  return createFixture(
    source,
    'not_found',
    '__fallback__',
    {
      kind: 'http_status',
      status: 404,
    },
    'not_found',
    `${source} recorded fixture not found`,
    null,
  )
}

export function getRecordedFixtureByIdentifier(
  source: AdapterSource,
  identifier: string,
): RecordedMetadataFixture {
  const exact = RECORDED_METADATA_FIXTURES[source].find((fixture) => fixture.identifier === identifier)
  return exact ?? fallbackNotFound(source)
}

export function getRecordedFixtureByCase(
  source: AdapterSource,
  caseType: RecordedFixtureCase,
): RecordedMetadataFixture {
  return (
    RECORDED_METADATA_FIXTURES[source].find((fixture) => fixture.caseType === caseType) ??
    fallbackNotFound(source)
  )
}

export function toAdapterLookupResultFromRecorded(
  fixture: RecordedMetadataFixture,
  role: SourceRole,
): AdapterLookupResult {
  return {
    source: fixture.provider,
    role,
    state: fixture.state,
    detail: fixture.detail,
    payload: fixture.payload,
    safe_forward_links_available: fixture.safe_forward_links_available,
  }
}
