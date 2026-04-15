import type { NormalizedIdentifierInput, AdapterLookupResult } from '../../application/pipelineTypes'

export interface MetadataAdapter {
  lookup(input: NormalizedIdentifierInput): Promise<AdapterLookupResult>
}
