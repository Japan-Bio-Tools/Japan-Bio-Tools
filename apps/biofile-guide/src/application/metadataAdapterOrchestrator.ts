import type {
  MetadataLookup,
  NormalizedIdentifierInput,
  AdapterLookupResult,
} from './pipelineTypes'
import { resolveEntryResolutionStatus } from '../domain/identifierResolver'
import { mergeMetadataFromAdapters } from '../domain/mergeStrategy'
import type { MetadataAdapter } from '../infrastructure/adapters/metadataAdapter'

export async function lookupIdentifierMetadata(
  input: NormalizedIdentifierInput,
  adapters: MetadataAdapter[],
): Promise<MetadataLookup> {
  const outcomes: AdapterLookupResult[] = []
  for (const adapter of adapters) {
    const outcome = await adapter.lookup(input)
    outcomes.push(outcome)
  }

  const entryResolutionStatus = resolveEntryResolutionStatus(outcomes)
  const metadata = mergeMetadataFromAdapters(input.inputType, input.canonicalIdentifier, outcomes)
  metadata.entry_resolution_status = entryResolutionStatus

  return {
    entryResolutionStatus,
    metadata,
    outcomes,
  }
}
