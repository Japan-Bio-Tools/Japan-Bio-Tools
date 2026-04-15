import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedIdentifierInput } from '../../application/pipelineTypes'
import { getRecordedFixtureByCase } from '../../mocks/recordedMetadataFixtures'
import { fetchFromRecordedCapture } from '../../test/recordedFixtureFetch'
import { clearAdapterSessionLookupCache } from './adapterRequestSupport'
import { RcsbMetadataAdapter } from './rcsbMetadataAdapter'

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

describe('RcsbMetadataAdapter', () => {
  it('normalizes a found RCSB entry into AdapterPayload', async () => {
    const recorded = getRecordedFixtureByCase('RCSB', 'found')
    const fetchFn = fetchFromRecordedCapture(recorded.capture)
    const adapter = new RcsbMetadataAdapter('primary', { fetchFn })

    const result = await adapter.lookup(identifier(recorded.identifier))

    expect(fetchFn).toHaveBeenCalledWith(
      `https://data.rcsb.org/rest/v1/core/entry/${recorded.identifier}`,
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.state).toBe('found')
    expect(result.payload).toEqual(recorded.payload)
  })

  it('returns not_found for a 404 response', async () => {
    const recorded = getRecordedFixtureByCase('RCSB', 'not_found')
    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn: fetchFromRecordedCapture(recorded.capture),
    })

    const result = await adapter.lookup(identifier(recorded.identifier))

    expect(result).toMatchObject({
      source: 'RCSB',
      role: 'primary',
      state: 'not_found',
      payload: null,
    })
  })

  it('returns unavailable for network failure', async () => {
    const recorded = getRecordedFixtureByCase('RCSB', 'unavailable')
    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn: fetchFromRecordedCapture(recorded.capture),
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
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ rcsb_entry_info: {} }), { status: 200 }))
    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn,
    })

    const result = await adapter.lookup(identifier())

    expect(result.state).toBe('unavailable')
    expect(result.payload).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns unavailable on timeout', async () => {
    vi.useFakeTimers()
    const adapter = new RcsbMetadataAdapter('primary', {
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
    expect(result.detail).toBe('RCSB request timed out')
  })

  it('retries once for network errors and succeeds on the second attempt', async () => {
    const fetchFn = vi.fn()
    fetchFn
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entry: { id: '1CRN' },
            exptl: [{ method: 'X-RAY DIFFRACTION' }],
            rcsb_entry_info: {},
          }),
          { status: 200 },
        ),
      )

    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn,
      maxRetries: 1,
    })

    const result = await adapter.lookup(identifier('1CRN'))

    expect(result.state).toBe('found')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('retries once for 5xx responses and succeeds on the second attempt', async () => {
    const fetchFn = vi.fn()
    fetchFn
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entry: { id: '1CRN' },
            exptl: [{ method: 'X-RAY DIFFRACTION' }],
            rcsb_entry_info: {},
          }),
          { status: 200 },
        ),
      )

    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn,
      maxRetries: 1,
    })

    const result = await adapter.lookup(identifier('1CRN'))

    expect(result.state).toBe('found')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('does not retry 404 responses', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }))
    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn,
      maxRetries: 1,
    })

    const result = await adapter.lookup(identifier('9NF0'))

    expect(result.state).toBe('not_found')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('caches found responses in-session and avoids duplicate fetch', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          entry: { id: '1CRN' },
          exptl: [{ method: 'X-RAY DIFFRACTION' }],
          rcsb_entry_info: {},
        }),
        { status: 200 },
      ),
    )
    const adapter = new RcsbMetadataAdapter('primary', { fetchFn })

    const first = await adapter.lookup(identifier('1CRN'))
    const second = await adapter.lookup(identifier('1CRN'))

    expect(first.state).toBe('found')
    expect(second.state).toBe('found')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('caches not_found responses in-session and avoids duplicate fetch', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }))
    const adapter = new RcsbMetadataAdapter('primary', { fetchFn })

    const first = await adapter.lookup(identifier('9NF0'))
    const second = await adapter.lookup(identifier('9NF0'))

    expect(first.state).toBe('not_found')
    expect(second.state).toBe('not_found')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('does not cache unavailable responses by default', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const adapter = new RcsbMetadataAdapter('primary', {
      fetchFn,
      maxRetries: 0,
    })

    const first = await adapter.lookup(identifier('2UNV'))
    const second = await adapter.lookup(identifier('2UNV'))

    expect(first.state).toBe('unavailable')
    expect(second.state).toBe('unavailable')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
