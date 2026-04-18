import { describe, expect, it, vi } from 'vitest'
import {
  TELEMETRY_OPT_IN_STORAGE_KEY,
  emitAnonymousTelemetryEvent,
  isAnonymousTelemetryOptedIn,
  mapLinkTelemetryEventCode,
  setAnonymousTelemetryOptIn,
  type AnonymousTelemetryPayload,
} from './anonymousTelemetry'

describe('anonymousTelemetry', () => {
  it('keeps telemetry disabled when opt-in is false', async () => {
    const transport = vi.fn(async () => undefined)

    await emitAnonymousTelemetryEvent('result_rendered', {
      endpoint: 'https://example.test/telemetry',
      optIn: false,
      transport,
    })

    expect(transport).not.toHaveBeenCalled()
  })

  it('does not send telemetry when endpoint is missing even if opt-in is true', async () => {
    const transport = vi.fn(async () => undefined)

    await emitAnonymousTelemetryEvent('result_rendered', {
      endpoint: '',
      optIn: true,
      transport,
    })

    expect(transport).not.toHaveBeenCalled()
  })

  it('sends only allowlisted payload fields when opt-in is true', async () => {
    const transport = vi.fn(async () => undefined)

    await emitAnonymousTelemetryEvent('click_link_rcsb', {
      endpoint: 'https://example.test/telemetry',
      optIn: true,
      transport,
    })

    expect(transport).toHaveBeenCalledTimes(1)
    const [endpoint, payload] = transport.mock.calls[0] as [string, AnonymousTelemetryPayload]
    expect(endpoint).toBe('https://example.test/telemetry')
    expect(payload).toEqual({
      event_code: 'click_link_rcsb',
      event_category: 'link',
    })
    expect(Object.keys(payload).sort()).toEqual(['event_category', 'event_code'])
    expect(JSON.stringify(payload)).not.toContain('1CRN')
    expect(JSON.stringify(payload)).not.toContain('pdb_00001abc')
    expect(JSON.stringify(payload)).not.toContain('rawText')
    expect(JSON.stringify(payload)).not.toContain('canonicalIdentifier')
  })

  it('reads explicit opt-in flag from storage only', () => {
    const storageTrue = {
      getItem: vi.fn((key: string) => (key === TELEMETRY_OPT_IN_STORAGE_KEY ? 'true' : null)),
    }
    const storageFalse = {
      getItem: vi.fn(() => null),
    }

    expect(isAnonymousTelemetryOptedIn(storageTrue)).toBe(true)
    expect(isAnonymousTelemetryOptedIn(storageFalse)).toBe(false)
  })

  it('falls back to disabled when opt-in storage cannot be read', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('storage blocked')
      }),
    }

    expect(isAnonymousTelemetryOptedIn(storage)).toBe(false)
  })

  it('stores explicit opt-in flag with the existing storage key', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    expect(setAnonymousTelemetryOptIn(true, storage)).toBe(true)
    expect(storage.setItem).toHaveBeenLastCalledWith(TELEMETRY_OPT_IN_STORAGE_KEY, 'true')

    expect(setAnonymousTelemetryOptIn(false, storage)).toBe(true)
    expect(storage.setItem).toHaveBeenLastCalledWith(TELEMETRY_OPT_IN_STORAGE_KEY, 'false')
  })

  it('reports opt-in storage write failure without throwing', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new Error('storage blocked')
      }),
      removeItem: vi.fn(),
    }

    expect(setAnonymousTelemetryOptIn(true, storage)).toBe(false)
  })

  it('falls back to removing stored true flag when opt-out write fails', () => {
    let storedValue: string | null = 'true'
    const storage = {
      setItem: vi.fn((key: string, value: string) => {
        if (key === TELEMETRY_OPT_IN_STORAGE_KEY && value === 'false') {
          throw new Error('quota exceeded')
        }
        storedValue = value
      }),
      removeItem: vi.fn((key: string) => {
        if (key === TELEMETRY_OPT_IN_STORAGE_KEY) {
          storedValue = null
        }
      }),
      getItem: vi.fn((key: string) => (key === TELEMETRY_OPT_IN_STORAGE_KEY ? storedValue : null)),
    }

    expect(setAnonymousTelemetryOptIn(false, storage)).toBe(true)
    expect(storage.removeItem).toHaveBeenCalledWith(TELEMETRY_OPT_IN_STORAGE_KEY)
    expect(isAnonymousTelemetryOptedIn(storage)).toBe(false)
  })

  it('maps destination link to the expected telemetry event code', () => {
    expect(
      mapLinkTelemetryEventCode({
        destination_type: 'canonical_entry',
        href: 'https://www.rcsb.org/structure/1CRN',
      }),
    ).toBe('click_link_rcsb')
    expect(
      mapLinkTelemetryEventCode({
        destination_type: 'canonical_entry',
        href: 'https://www.ebi.ac.uk/pdbe/entry/pdb/1crn',
      }),
    ).toBe('click_link_pdbe')
    expect(
      mapLinkTelemetryEventCode({
        destination_type: 'canonical_entry',
        href: 'https://pdbj.org/mine/summary/1CRN',
      }),
    ).toBe('click_link_pdbj')
    expect(
      mapLinkTelemetryEventCode({
        destination_type: 'viewer_remote',
        href: 'https://molstar.org/viewer/?pdb=1CRN',
      }),
    ).toBe('click_link_molstar')
    expect(
      mapLinkTelemetryEventCode({
        destination_type: 'viewer_remote',
        href: 'https://www.ncbi.nlm.nih.gov/Structure/icn3d/full.html?pdbid=1CRN',
      }),
    ).toBe('click_link_icn3d')
    expect(
      mapLinkTelemetryEventCode({
        destination_type: 'viewer_local_guide',
        href: 'https://pdbj.org/help/molmil',
      }),
    ).toBe('click_link_molmil')
    expect(
      mapLinkTelemetryEventCode({
        destination_type: 'guide_article',
        href: 'https://www.wwpdb.org/documentation/file-format-content/format23/sect1.html',
      }),
    ).toBeNull()
  })

  it('swallows telemetry transport errors', async () => {
    const failingTransport = vi.fn(async () => {
      throw new Error('telemetry service unavailable')
    })

    await expect(
      emitAnonymousTelemetryEvent('error_parse_failed', {
        endpoint: 'https://example.test/telemetry',
        optIn: true,
        transport: failingTransport,
      }),
    ).resolves.toBeUndefined()
  })
})
