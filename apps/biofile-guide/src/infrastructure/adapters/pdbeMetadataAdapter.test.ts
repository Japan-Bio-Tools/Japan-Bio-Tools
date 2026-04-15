import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedIdentifierInput } from '../../application/pipelineTypes'
import { getRecordedFixtureByCase } from '../../mocks/recordedMetadataFixtures'
import { fetchFromRecordedCapture } from '../../test/recordedFixtureFetch'
import { clearAdapterSessionLookupCache } from './adapterRequestSupport'
import { PdbeMetadataAdapter } from './pdbeMetadataAdapter'

function identifier(id = '1CRN'): NormalizedIdentifierInput {
  return {
    kind: 'identifier',
    inputType: 'pdb_id',
    rawText: id,
    canonicalIdentifier: id,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  clearAdapterSessionLookupCache()
})

describe('PdbeMetadataAdapter', () => {
  it('normalizes a found PDBe summary into AdapterPayload', async () => {
    const recorded = getRecordedFixtureByCase('PDBe', 'found')
    const fetchFn = fetchFromRecordedCapture(recorded.capture)
    const adapter = new PdbeMetadataAdapter('secondary', { fetchFn })

    const result = await adapter.lookup(identifier(recorded.identifier))

    expect(fetchFn).toHaveBeenCalledWith(
      `https://www.ebi.ac.uk/pdbe/api/pdb/entry/summary/${recorded.identifier.toLowerCase()}`,
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.state).toBe('found')
    expect(result.payload).toEqual(recorded.payload)
  })

  it('returns not_found for a 404 response', async () => {
    const recorded = getRecordedFixtureByCase('PDBe', 'not_found')
    const adapter = new PdbeMetadataAdapter('secondary', {
      fetchFn: fetchFromRecordedCapture(recorded.capture),
    })

    const result = await adapter.lookup(identifier(recorded.identifier))

    expect(result).toMatchObject({
      source: 'PDBe',
      role: 'secondary',
      state: 'not_found',
      payload: null,
    })
  })

  it('returns unavailable for network failure', async () => {
    const recorded = getRecordedFixtureByCase('PDBe', 'unavailable')
    const adapter = new PdbeMetadataAdapter('secondary', {
      fetchFn: fetchFromRecordedCapture(recorded.capture),
    })

    const result = await adapter.lookup(identifier())

    expect(result).toMatchObject({
      source: 'PDBe',
      role: 'secondary',
      state: 'unavailable',
      payload: null,
      safe_forward_links_available: true,
    })
  })

  it('returns unavailable for malformed payloads', async () => {
    const adapter = new PdbeMetadataAdapter('secondary', {
      fetchFn: fetchFromRecordedCapture({
        kind: 'http_json',
        status: 200,
        body: ['not keyed by entry id'],
      }),
    })

    const result = await adapter.lookup(identifier())

    expect(result.state).toBe('unavailable')
    expect(result.payload).toBeNull()
  })

  it('returns unavailable on timeout', async () => {
    vi.useFakeTimers()
    const adapter = new PdbeMetadataAdapter('secondary', {
      timeoutMs: 5,
      maxRetries: 0,
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
    expect(result.detail).toBe('PDBe request timed out')
  })
})
