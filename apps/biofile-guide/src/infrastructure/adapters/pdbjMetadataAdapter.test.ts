import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedIdentifierInput } from '../../application/pipelineTypes'
import { getRecordedFixtureByCase } from '../../mocks/recordedMetadataFixtures'
import { fetchFromRecordedCapture } from '../../test/recordedFixtureFetch'
import { clearAdapterSessionLookupCache } from './adapterRequestSupport'
import { PdbjMetadataAdapter } from './pdbjMetadataAdapter'

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

describe('PdbjMetadataAdapter', () => {
  it('normalizes a tuple-row PDBj response into AdapterPayload', async () => {
    const adapter = new PdbjMetadataAdapter('tertiary', {
      fetchFn: fetchFromRecordedCapture({
        kind: 'http_json',
        status: 200,
        body: {
          total: '1',
          results: [
            [
              '1crn',
              'title',
              'authors',
              'citation',
              'journal',
              1984,
              '81',
              '16593516',
              '10.1073/pnas.81.19.6014',
              357436800,
              365126400,
              1730246400,
              'X-RAY DIFFRACTION',
              1.5,
              'CRAMBIN',
            ],
          ],
        },
      }),
    })

    const result = await adapter.lookup(identifier('1CRN'))

    expect(result.state).toBe('found')
    expect(result.payload).toMatchObject({
      archive_exists: true,
      experiment_method: 'X-RAY DIFFRACTION',
      record_type_markers: ['explicit_exptl_method'],
      provenance_markers: ['explicit_pdb_archive_provenance'],
    })
  })

  it('normalizes a found PDBj response into AdapterPayload', async () => {
    const recorded = getRecordedFixtureByCase('PDBj', 'found')
    const fetchFn = fetchFromRecordedCapture(recorded.capture)
    const adapter = new PdbjMetadataAdapter('tertiary', { fetchFn })

    const result = await adapter.lookup(identifier(recorded.identifier))

    expect(fetchFn).toHaveBeenCalledWith(
      `https://pdbj.org/rest/newweb/search/pdb?pdbid=${recorded.identifier.toUpperCase()}&limit=1`,
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.state).toBe('found')
    expect(result.payload).toEqual(recorded.payload)
  })

  it('returns not_found for a 404 response', async () => {
    const recorded = getRecordedFixtureByCase('PDBj', 'not_found')
    const adapter = new PdbjMetadataAdapter('tertiary', {
      fetchFn: fetchFromRecordedCapture(recorded.capture),
    })

    const result = await adapter.lookup(identifier(recorded.identifier))

    expect(result).toMatchObject({
      source: 'PDBj',
      role: 'tertiary',
      state: 'not_found',
      payload: null,
    })
  })

  it('returns not_found when search result is empty', async () => {
    const adapter = new PdbjMetadataAdapter('tertiary', {
      fetchFn: fetchFromRecordedCapture({
        kind: 'http_json',
        status: 200,
        body: { total: '0', results: [] },
      }),
    })

    const result = await adapter.lookup(identifier('9ZZZ'))

    expect(result).toMatchObject({
      source: 'PDBj',
      role: 'tertiary',
      state: 'not_found',
      payload: null,
    })
  })

  it('returns unavailable for malformed tuple rows', async () => {
    const adapter = new PdbjMetadataAdapter('tertiary', {
      fetchFn: fetchFromRecordedCapture({
        kind: 'http_json',
        status: 200,
        body: { total: '1', results: [[]] },
      }),
    })

    const result = await adapter.lookup(identifier('1CRN'))

    expect(result.state).toBe('unavailable')
    expect(result.payload).toBeNull()
    expect(result.detail).toBe('PDBj response was malformed')
  })

  it('returns unavailable for network failure', async () => {
    const recorded = getRecordedFixtureByCase('PDBj', 'unavailable')
    const adapter = new PdbjMetadataAdapter('tertiary', {
      fetchFn: fetchFromRecordedCapture(recorded.capture),
    })

    const result = await adapter.lookup(identifier())

    expect(result).toMatchObject({
      source: 'PDBj',
      role: 'tertiary',
      state: 'unavailable',
      payload: null,
      safe_forward_links_available: true,
    })
  })

  it('returns unavailable for malformed payloads', async () => {
    const adapter = new PdbjMetadataAdapter('tertiary', {
      fetchFn: fetchFromRecordedCapture({
        kind: 'http_json',
        status: 200,
        body: ['not a record'],
      }),
    })

    const result = await adapter.lookup(identifier())

    expect(result.state).toBe('unavailable')
    expect(result.payload).toBeNull()
  })

  it('returns unavailable on timeout', async () => {
    vi.useFakeTimers()
    const adapter = new PdbjMetadataAdapter('tertiary', {
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
    expect(result.detail).toBe('PDBj request timed out')
  })
})
