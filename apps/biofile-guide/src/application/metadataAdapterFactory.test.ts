import { describe, expect, it } from 'vitest'
import { MockMetadataAdapter } from '../infrastructure/adapters/mockMetadataAdapter'
import { PdbeMetadataAdapter } from '../infrastructure/adapters/pdbeMetadataAdapter'
import { PdbjMetadataAdapter } from '../infrastructure/adapters/pdbjMetadataAdapter'
import { RcsbMetadataAdapter } from '../infrastructure/adapters/rcsbMetadataAdapter'
import { createMetadataAdapters, resolveMetadataAdapterMode } from './metadataAdapterFactory'

describe('metadata adapter selection', () => {
  it('defaults unknown mode values to mock', () => {
    expect(resolveMetadataAdapterMode(undefined)).toBe('mock')
    expect(resolveMetadataAdapterMode('anything_else')).toBe('mock')
  })

  it('keeps mock mode as the default adapter set', () => {
    const adapters = createMetadataAdapters('mock')

    expect(adapters).toHaveLength(3)
    expect(adapters[0]).toBeInstanceOf(MockMetadataAdapter)
    expect(adapters[1]).toBeInstanceOf(MockMetadataAdapter)
    expect(adapters[2]).toBeInstanceOf(MockMetadataAdapter)
  })

  it('uses only RCSB real adapter in real_rcsb mode and keeps PDBe/PDBj mocked', () => {
    const adapters = createMetadataAdapters('real_rcsb', {
      rcsb: {
        fetchFn: async () => new Response('{}'),
      },
    })

    expect(adapters).toHaveLength(3)
    expect(adapters[0]).toBeInstanceOf(RcsbMetadataAdapter)
    expect(adapters[1]).toBeInstanceOf(MockMetadataAdapter)
    expect(adapters[2]).toBeInstanceOf(MockMetadataAdapter)
  })

  it('uses only PDBe real adapter in real_pdbe mode and keeps RCSB/PDBj mocked', () => {
    const adapters = createMetadataAdapters('real_pdbe', {
      pdbe: {
        fetchFn: async () => new Response('{}'),
      },
    })

    expect(adapters).toHaveLength(3)
    expect(adapters[0]).toBeInstanceOf(MockMetadataAdapter)
    expect(adapters[1]).toBeInstanceOf(PdbeMetadataAdapter)
    expect(adapters[2]).toBeInstanceOf(MockMetadataAdapter)
  })

  it('uses only PDBj real adapter in real_pdbj mode and keeps RCSB/PDBe mocked', () => {
    const adapters = createMetadataAdapters('real_pdbj', {
      pdbj: {
        fetchFn: async () => new Response('{}'),
      },
    })

    expect(adapters).toHaveLength(3)
    expect(adapters[0]).toBeInstanceOf(MockMetadataAdapter)
    expect(adapters[1]).toBeInstanceOf(MockMetadataAdapter)
    expect(adapters[2]).toBeInstanceOf(PdbjMetadataAdapter)
  })
})
