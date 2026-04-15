import { MockMetadataAdapter } from '../infrastructure/adapters/mockMetadataAdapter'
import {
  RcsbMetadataAdapter,
  type RcsbMetadataAdapterOptions,
} from '../infrastructure/adapters/rcsbMetadataAdapter'
import type { MetadataAdapter } from '../infrastructure/adapters/metadataAdapter'

export type MetadataAdapterMode = 'mock' | 'real_rcsb'

export function resolveMetadataAdapterMode(value: string | undefined): MetadataAdapterMode {
  return value === 'real_rcsb' ? 'real_rcsb' : 'mock'
}

export function createMetadataAdapters(
  mode: MetadataAdapterMode = resolveMetadataAdapterMode(import.meta.env.VITE_BIOFILE_GUIDE_ADAPTER_MODE),
  rcsbOptions?: RcsbMetadataAdapterOptions,
): MetadataAdapter[] {
  if (mode === 'real_rcsb') {
    return [
      new RcsbMetadataAdapter('primary', rcsbOptions),
      new MockMetadataAdapter('PDBe', 'secondary'),
      new MockMetadataAdapter('PDBj', 'tertiary'),
    ]
  }

  return [
    new MockMetadataAdapter('RCSB', 'primary'),
    new MockMetadataAdapter('PDBe', 'secondary'),
    new MockMetadataAdapter('PDBj', 'tertiary'),
  ]
}
