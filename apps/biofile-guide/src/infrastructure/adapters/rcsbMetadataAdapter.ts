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

export type RcsbMetadataAdapterOptions = {
  fetchFn?: FetchFn
  endpointBase?: string
  timeoutMs?: number
}

const DEFAULT_ENDPOINT_BASE = 'https://data.rcsb.org/rest/v1/core/entry'
const DEFAULT_TIMEOUT_MS = 3500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = source[key]
  return isRecord(value) ? value : null
}

function getArray(source: Record<string, unknown>, key: string): unknown[] {
  const value = source[key]
  return Array.isArray(value) ? value : []
}

function getString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getNumber(source: Record<string, unknown> | null, key: string): number | null {
  if (source === null) {
    return null
  }
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getStringArray(source: Record<string, unknown> | null, key: string): string[] {
  if (source === null) {
    return []
  }
  const value = source[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
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

function readExperimentMethod(data: Record<string, unknown>): string | null {
  const exptl = getArray(data, 'exptl')
  for (const item of exptl) {
    if (isRecord(item)) {
      const method = getString(item, 'method')
      if (method !== null) {
        return method
      }
    }
  }

  const entryInfo = getRecord(data, 'rcsb_entry_info')
  return entryInfo === null ? null : firstStringFromValue(entryInfo.experimental_method)
}

function readEntryId(data: Record<string, unknown>): string | null {
  const entry = getRecord(data, 'entry')
  return (entry === null ? null : getString(entry, 'id')) ?? getString(data, 'rcsb_id')
}

function normalizeCount(value: number | null): number | null {
  return value === null || value < 0 ? null : value
}

function deriveChainCount(data: Record<string, unknown>): number | null {
  const entryInfo = getRecord(data, 'rcsb_entry_info')
  const directCount = firstNumber(entryInfo, [
    'deposited_polymer_entity_instance_count',
    'polymer_entity_instance_count',
  ])
  if (directCount !== null) {
    return normalizeCount(directCount)
  }

  const identifiers = getRecord(data, 'rcsb_entry_container_identifiers')
  const authAsymIds = getStringArray(identifiers, 'auth_asym_ids')
  return authAsymIds.length > 0 ? new Set(authAsymIds).size : null
}

function deriveBooleanFromCount(value: number | null): boolean | null {
  return value === null ? null : value > 0
}

function buildPayload(input: NormalizedIdentifierInput, data: Record<string, unknown>): AdapterPayload | null {
  if (readEntryId(data) === null) {
    return null
  }

  const entryInfo = getRecord(data, 'rcsb_entry_info')
  const experimentMethod = readExperimentMethod(data)
  const recordTypeMarkers: EvidenceCode[] = experimentMethod === null ? [] : ['explicit_exptl_method']
  const legacyHints: LegacyPdbReasonCode[] =
    input.inputType === 'extended_pdb_id' ? ['extended_id_requires_mmcif'] : []

  const ligandCount = firstNumber(entryInfo, [
    'deposited_nonpolymer_entity_instance_count',
    'nonpolymer_entity_instance_count',
    'nonpolymer_entity_count',
  ])
  const waterCount = firstNumber(entryInfo, ['deposited_water_count', 'solvent_entity_count'])

  return {
    resolved_format_hint: input.inputType === 'extended_pdb_id' ? 'mmcif' : 'pdb',
    archive_exists: true,
    experiment_method: experimentMethod,
    record_type_markers: recordTypeMarkers,
    provenance_markers: ['explicit_pdb_archive_provenance'],
    model_count: normalizeCount(firstNumber(entryInfo, ['deposited_model_count', 'model_count'])),
    chain_count: deriveChainCount(data),
    ligand_detected: deriveBooleanFromCount(ligandCount),
    water_detected: deriveBooleanFromCount(waterCount),
    legacy_compatibility_hints: legacyHints,
  }
}

export class RcsbMetadataAdapter implements MetadataAdapter {
  readonly source = 'RCSB' as const
  readonly role: SourceRole
  private readonly fetchFn: FetchFn | null
  private readonly endpointBase: string
  private readonly timeoutMs: number

  constructor(role: SourceRole = 'primary', options: RcsbMetadataAdapterOptions = {}) {
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
      const url = `${this.endpointBase}/${encodeURIComponent(input.canonicalIdentifier)}`
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (response.status === 404) {
        return {
          source: this.source,
          role: this.role,
          state: 'not_found',
          payload: null,
          detail: 'RCSB entry not found',
        }
      }

      if (!response.ok) {
        return this.unavailable(`RCSB request failed with status ${response.status}`)
      }

      const body: unknown = await response.json()
      if (!isRecord(body)) {
        return this.unavailable('RCSB response was malformed')
      }

      const payload = buildPayload(input, body)
      if (payload === null) {
        return this.unavailable('RCSB response missed entry identity')
      }

      return {
        source: this.source,
        role: this.role,
        state: 'found',
        payload,
        detail: 'RCSB real adapter hit',
      }
    } catch (error) {
      const detail = error instanceof DOMException && error.name === 'AbortError'
        ? 'RCSB request timed out'
        : 'RCSB request failed'
      return this.unavailable(detail)
    } finally {
      clearTimeout(timeout)
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
