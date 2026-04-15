import type { NormalizedIdentifierInput, AdapterLookupResult } from '../../application/pipelineTypes'
import type { AdapterSource, SourceRole } from '../../types/contracts'
import { getMetadataFixture } from '../../mocks/metadataFixtures'
import type { MetadataAdapter } from './metadataAdapter'

export class MockMetadataAdapter implements MetadataAdapter {
  readonly source: AdapterSource
  readonly role: SourceRole

  constructor(source: AdapterSource, role: SourceRole) {
    this.source = source
    this.role = role
  }

  async lookup(input: NormalizedIdentifierInput): Promise<AdapterLookupResult> {
    return getMetadataFixture(this.source, this.role, input.canonicalIdentifier)
  }
}
