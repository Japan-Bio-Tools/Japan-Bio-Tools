import { MockMetadataAdapter } from '../infrastructure/adapters/mockMetadataAdapter'
import {
  PdbeMetadataAdapter,
  type PdbeMetadataAdapterOptions,
} from '../infrastructure/adapters/pdbeMetadataAdapter'
import {
  PdbjMetadataAdapter,
  type PdbjMetadataAdapterOptions,
} from '../infrastructure/adapters/pdbjMetadataAdapter'
import {
  RcsbMetadataAdapter,
  type RcsbMetadataAdapterOptions,
} from '../infrastructure/adapters/rcsbMetadataAdapter'
import type { MetadataAdapter } from '../infrastructure/adapters/metadataAdapter'

export type MetadataAdapterMode = 'mock' | 'real_rcsb' | 'real_pdbe' | 'real_pdbj'

export type MetadataAdapterFactoryOptions = {
  rcsb?: RcsbMetadataAdapterOptions
  pdbe?: PdbeMetadataAdapterOptions
  pdbj?: PdbjMetadataAdapterOptions
}

export function resolveMetadataAdapterMode(value: string | undefined): MetadataAdapterMode {
  if (value === 'real_rcsb' || value === 'real_pdbe' || value === 'real_pdbj') {
    return value
  }
  return 'mock'
}

export function createMetadataAdapters(
  mode: MetadataAdapterMode = resolveMetadataAdapterMode(import.meta.env.VITE_BIOFILE_GUIDE_ADAPTER_MODE),
  options: MetadataAdapterFactoryOptions = {},
): MetadataAdapter[] {
  if (mode === 'real_rcsb') {
    return [
      new RcsbMetadataAdapter('primary', options.rcsb),
      new MockMetadataAdapter('PDBe', 'secondary'),
      new MockMetadataAdapter('PDBj', 'tertiary'),
    ]
  }

  if (mode === 'real_pdbe') {
    return [
      new MockMetadataAdapter('RCSB', 'primary'),
      new PdbeMetadataAdapter('secondary', options.pdbe),
      new MockMetadataAdapter('PDBj', 'tertiary'),
    ]
  }

  if (mode === 'real_pdbj') {
    return [
      new MockMetadataAdapter('RCSB', 'primary'),
      new MockMetadataAdapter('PDBe', 'secondary'),
      new PdbjMetadataAdapter('tertiary', options.pdbj),
    ]
  }

  return [
    new MockMetadataAdapter('RCSB', 'primary'),
    new MockMetadataAdapter('PDBe', 'secondary'),
    new MockMetadataAdapter('PDBj', 'tertiary'),
  ]
}
