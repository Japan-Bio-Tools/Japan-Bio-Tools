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

export type PdbeMetadataAdapterOptions = {
  fetchFn?: FetchFn
  endpointBase?: string
  timeoutMs?: number
}

type SummaryRecordResult =
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

const DEFAULT_ENDPOINT_BASE = 'https://www.ebi.ac.uk/pdbe/api/pdb/entry/summary'
const DEFAULT_TIMEOUT_MS = 3500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = source[key]
  return isRecord(value) ? value : null
}

function getNumber(source: Record<string, unknown> | null, key: string): number | null {
  if (source === null) {
    return null
  }
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function firstNumber(source: Record<string, unknown> | null, keys: string[]): number | null {
  for (const key of keys) {
    const value = getNumber(source, key)
    if (value !== null) {
      return value
    }
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

function findKeyCaseInsensitive(source: Record<string, unknown>, key: string): string | null {
  const lower = key.toLowerCase()
  return Object.keys(source).find((item) => item.toLowerCase() === lower) ?? null
}

function extractSummaryRecord(body: unknown, identifier: string): SummaryRecordResult {
  if (!isRecord(body)) {
    return { kind: 'malformed' }
  }

  const key = findKeyCaseInsensitive(body, identifier)
  if (key === null) {
    return { kind: 'not_found' }
  }

  const value = body[key]
  if (!Array.isArray(value)) {
    return { kind: 'malformed' }
  }
  if (value.length === 0) {
    return { kind: 'not_found' }
  }
  if (!isRecord(value[0])) {
    return { kind: 'malformed' }
  }

  return {
    kind: 'found',
    record: value[0],
  }
}

function entityCount(record: Record<string, unknown>, keyNames: string[]): number | null {
  const numberOfEntities = getRecord(record, 'number_of_entities')
  if (numberOfEntities === null) {
    return null
  }

  const normalizedKeys = keyNames.map((item) => item.toLowerCase())
  for (const [key, value] of Object.entries(numberOfEntities)) {
    if (normalizedKeys.includes(key.toLowerCase()) && typeof value === 'number' && Number.isFinite(value)) {
      return normalizeCount(value)
    }
  }
  return null
}

function deriveBooleanFromCount(value: number | null): boolean | null {
  return value === null ? null : value > 0
}

function buildPayload(input: NormalizedIdentifierInput, record: Record<string, unknown>): AdapterPayload {
  const experimentMethod = firstStringFromValue(record.experimental_method)
  const recordTypeMarkers: EvidenceCode[] = experimentMethod === null ? [] : ['explicit_exptl_method']
  const legacyHints: LegacyPdbReasonCode[] =
    input.inputType === 'extended_pdb_id' ? ['extended_id_requires_mmcif'] : []

  const ligandCount = entityCount(record, ['ligand', 'non-polymer', 'nonpolymer'])
  const waterCount = entityCount(record, ['water', 'solvent'])

  return {
    resolved_format_hint: input.inputType === 'extended_pdb_id' ? 'mmcif' : 'pdb',
    archive_exists: true,
    experiment_method: experimentMethod,
    record_type_markers: recordTypeMarkers,
    provenance_markers: ['explicit_pdb_archive_provenance'],
    model_count: normalizeCount(firstNumber(record, ['number_of_models', 'model_count'])),
    chain_count: normalizeCount(firstNumber(record, ['number_of_chains', 'chain_count'])),
    ligand_detected: deriveBooleanFromCount(ligandCount),
    water_detected: deriveBooleanFromCount(waterCount),
    legacy_compatibility_hints: legacyHints,
  }
}

export class PdbeMetadataAdapter implements MetadataAdapter {
  readonly source = 'PDBe' as const
  readonly role: SourceRole
  private readonly fetchFn: FetchFn | null
  private readonly endpointBase: string
  private readonly timeoutMs: number

  constructor(role: SourceRole = 'secondary', options: PdbeMetadataAdapterOptions = {}) {
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
      const lookupId = input.canonicalIdentifier.toLowerCase()
      const url = `${this.endpointBase}/${encodeURIComponent(lookupId)}`
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
        return this.unavailable(`PDBe request failed with status ${response.status}`)
      }

      const body: unknown = await response.json()
      const extracted = extractSummaryRecord(body, input.canonicalIdentifier)
      if (extracted.kind === 'not_found') {
        return this.notFound()
      }
      if (extracted.kind === 'malformed') {
        return this.unavailable('PDBe response was malformed')
      }

      return {
        source: this.source,
        role: this.role,
        state: 'found',
        payload: buildPayload(input, extracted.record),
        detail: 'PDBe real adapter hit',
      }
    } catch (error) {
      const detail = error instanceof DOMException && error.name === 'AbortError'
        ? 'PDBe request timed out'
        : 'PDBe request failed'
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
      detail: 'PDBe entry not found',
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
