import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedIdentifierInput } from '../../application/pipelineTypes'
import { RcsbMetadataAdapter } from './rcsbMetadataAdapter'

function identifier(id = '1CRN'): NormalizedIdentifierInput {
  return {
    kind: 'identifier',
    inputType: 'pdb_id',
    rawText: id,
    canonicalIdentifier: id,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RcsbMetadataAdapter', () => {
  it('normalizes a found RCSB entry into AdapterPayload', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        entry: { id: '1CRN' },
        exptl: [{ method: 'X-RAY DIFFRACTION' }],
        rcsb_entry_info: {
          deposited_model_count: 1,
          deposited_polymer_entity_instance_count: 2,
          deposited_nonpolymer_entity_instance_count: 1,
          deposited_water_count: 10,
        },
      }),
    )
    const adapter = new RcsbMetadataAdapter('primary', { fetchFn })

    const result = await adapter.lookup(identifier())

    expect(fetchFn).toHaveBeenCalledWith(
      'https://data.rcsb.org/rest/v1/core/entry/1CRN',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.state).toBe('found')
    expect(result.payload).toEqual({
      resolved_format_hint: 'pdb',
      archive_exists: true,
      experiment_method: 'X-RAY DIFFRACTION',
      record_type_markers: ['explicit_exptl_method'],
      provenance_markers: ['explicit_pdb_archive_provenance'],
      model_count: 1,
      chain_count: 2,
      ligand_detected: true,
      water_detected: true,
      legacy_compatibility_hints: [],
    })
  })

  it('returns not_found for a 404 response', async () => {
    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn: async () => jsonResponse({ message: 'not found' }, 404),
    })

    const result = await adapter.lookup(identifier('9ZZZ'))

    expect(result).toMatchObject({
      source: 'RCSB',
      role: 'primary',
      state: 'not_found',
      payload: null,
    })
  })

  it('returns unavailable for network failure', async () => {
    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn: async () => {
        throw new Error('network down')
      },
    })

    const result = await adapter.lookup(identifier())

    expect(result).toMatchObject({
      source: 'RCSB',
      role: 'primary',
      state: 'unavailable',
      payload: null,
      safe_forward_links_available: true,
    })
  })

  it('returns unavailable for malformed payloads', async () => {
    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn: async () => jsonResponse({ rcsb_entry_info: {} }),
    })

    const result = await adapter.lookup(identifier())

    expect(result.state).toBe('unavailable')
    expect(result.payload).toBeNull()
  })

  it('returns unavailable on timeout', async () => {
    vi.useFakeTimers()
    const adapter = new RcsbMetadataAdapter('primary', {
      timeoutMs: 5,
      fetchFn: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    })

    const pending = adapter.lookup(identifier())
    await vi.advanceTimersByTimeAsync(5)
    const result = await pending

    expect(result.state).toBe('unavailable')
    expect(result.detail).toBe('RCSB request timed out')
  })
})
