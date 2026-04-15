import type {
  AdapterLookupResult,
  AdapterPayload,
  NormalizedIdentifierInput,
} from '../../application/pipelineTypes'
import type {
  EvidenceCode,
  LegacyPdbReasonCode,
  SourceRole,
} from '../../types/contracts'
import type { MetadataAdapter } from './metadataAdapter'

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type PdbjMetadataAdapterOptions = {
  fetchFn?: FetchFn
  endpointBase?: string
  timeoutMs?: number
}

type SearchRecordResult =
  | {
      kind: 'found'
      record: Record<string, unknown>
    }
  | {
      kind: 'not_found'
    }
  | {
      kind: 'malformed'
    }

const DEFAULT_ENDPOINT_BASE = 'https://pdbj.org/rest/newweb/search/pdb'
const DEFAULT_TIMEOUT_MS = 4000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeCount(value: number | null): number | null {
  return value === null || value < 0 ? null : value
}

function firstStringFromValue(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === 'string' && item.length > 0)
    return first ?? null
  }
  return null
}

function firstNumberFromRecord(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toFiniteNumber(record[key])
    if (value !== null) {
      return normalizeCount(value)
    }
  }
  return null
}

function firstStringFromRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = firstStringFromValue(record[key])
    if (value !== null) {
      return value
    }
  }
  return null
}

function firstArrayRecord(
  source: Record<string, unknown>,
  keys: string[],
): SearchRecordResult {
  for (const key of keys) {
    const value = source[key]
    if (!Array.isArray(value)) {
      continue
    }
    if (value.length === 0) {
      return { kind: 'not_found' }
    }
    if (!isRecord(value[0])) {
      return { kind: 'malformed' }
    }
    return { kind: 'found', record: value[0] }
  }
  return { kind: 'malformed' }
}

function extractSearchRecord(body: unknown): SearchRecordResult {
  if (!isRecord(body)) {
    return { kind: 'malformed' }
  }

  const totalCount = firstNumberFromRecord(body, ['total_count', 'total', 'count', 'hit_count'])
  if (totalCount === 0) {
    return { kind: 'not_found' }
  }

  const fromArray = firstArrayRecord(body, ['results', 'data', 'rows', 'list'])
  if (fromArray.kind !== 'malformed') {
    return fromArray
  }

  if (isRecord(body.entry)) {
    return { kind: 'found', record: body.entry }
  }
  if (isRecord(body.result)) {
    return { kind: 'found', record: body.result }
  }

  return { kind: 'malformed' }
}

function deriveBooleanFromCount(value: number | null): boolean | null {
  return value === null ? null : value > 0
}

function buildPayload(input: NormalizedIdentifierInput, record: Record<string, unknown>): AdapterPayload {
  const experimentMethod = firstStringFromRecord(record, [
    'experimental_method',
    'experiment_method',
    'exptl_method',
    'method',
  ])
  const recordTypeMarkers: EvidenceCode[] = experimentMethod === null ? [] : ['explicit_exptl_method']
  const legacyHints: LegacyPdbReasonCode[] =
    input.inputType === 'extended_pdb_id' ? ['extended_id_requires_mmcif'] : []

  const modelCount = firstNumberFromRecord(record, [
    'number_of_models',
    'model_count',
    'models',
    'n_models',
  ])
  const chainCount = firstNumberFromRecord(record, [
    'number_of_chains',
    'chain_count',
    'chains',
    'n_chains',
  ])
  const ligandCount = firstNumberFromRecord(record, [
    'ligand_count',
    'nonpolymer_count',
    'number_of_ligands',
  ])
  const waterCount = firstNumberFromRecord(record, [
    'water_count',
    'solvent_count',
    'number_of_waters',
  ])

  return {
    resolved_format_hint: input.inputType === 'extended_pdb_id' ? 'mmcif' : 'pdb',
    archive_exists: true,
    experiment_method: experimentMethod,
    record_type_markers: recordTypeMarkers,
    provenance_markers: ['explicit_pdb_archive_provenance'],
    model_count: modelCount,
    chain_count: chainCount,
    ligand_detected: deriveBooleanFromCount(ligandCount),
    water_detected: deriveBooleanFromCount(waterCount),
    legacy_compatibility_hints: legacyHints,
  }
}

export class PdbjMetadataAdapter implements MetadataAdapter {
  readonly source = 'PDBj' as const
  readonly role: SourceRole
  private readonly fetchFn: FetchFn | null
  private readonly endpointBase: string
  private readonly timeoutMs: number

  constructor(role: SourceRole = 'tertiary', options: PdbjMetadataAdapterOptions = {}) {
    this.role = role
    this.fetchFn = options.fetchFn ?? globalThis.fetch?.bind(globalThis) ?? null
    this.endpointBase = options.endpointBase ?? DEFAULT_ENDPOINT_BASE
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async lookup(input: NormalizedIdentifierInput): Promise<AdapterLookupResult> {
    if (this.fetchFn === null) {
      return this.unavailable('fetch is not available')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const params = new URLSearchParams({
        pdbid: input.canonicalIdentifier.toUpperCase(),
        limit: '1',
      })
      const url = `${this.endpointBase}?${params.toString()}`
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (response.status === 404) {
        return this.notFound()
      }

      if (!response.ok) {
        return this.unavailable(`PDBj request failed with status ${response.status}`)
      }

      const body: unknown = await response.json()
      const extracted = extractSearchRecord(body)
      if (extracted.kind === 'not_found') {
        return this.notFound()
      }
      if (extracted.kind === 'malformed') {
        return this.unavailable('PDBj response was malformed')
      }

      return {
        source: this.source,
        role: this.role,
        state: 'found',
        payload: buildPayload(input, extracted.record),
        detail: 'PDBj real adapter hit',
      }
    } catch (error) {
      const detail = error instanceof DOMException && error.name === 'AbortError'
        ? 'PDBj request timed out'
        : 'PDBj request failed'
      return this.unavailable(detail)
    } finally {
      clearTimeout(timeout)
    }
  }

  private notFound(): AdapterLookupResult {
    return {
      source: this.source,
      role: this.role,
      state: 'not_found',
      payload: null,
      detail: 'PDBj entry not found',
    }
  }

  private unavailable(detail: string): AdapterLookupResult {
    return {
      source: this.source,
      role: this.role,
      state: 'unavailable',
      payload: null,
      detail,
      safe_forward_links_available: true,
    }
  }
}
