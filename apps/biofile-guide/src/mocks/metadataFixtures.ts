import type { AdapterLookupResult } from '../application/pipelineTypes'
import type { AdapterSource, SourceRole } from '../types/contracts'
import {
  getRecordedFixtureByIdentifier,
  toAdapterLookupResultFromRecorded,
} from './recordedMetadataFixtures'

export function getMetadataFixture(
  source: AdapterSource,
  role: SourceRole,
  identifier: string,
): AdapterLookupResult {
  return toAdapterLookupResultFromRecorded(
    getRecordedFixtureByIdentifier(source, identifier),
    role,
  )
}
