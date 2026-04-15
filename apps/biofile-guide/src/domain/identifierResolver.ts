import type { AdapterLookupResult } from '../application/pipelineTypes'
import type { EntryResolutionStatus } from '../types/contracts'

export function resolveEntryResolutionStatus(outcomes: AdapterLookupResult[]): EntryResolutionStatus {
  if (outcomes.some((item) => item.state === 'found')) {
    return 'verified'
  }

  const primary = outcomes.find((item) => item.role === 'primary')
  const secondary = outcomes.find((item) => item.role === 'secondary')

  if (primary?.state === 'not_found' && secondary?.state === 'not_found') {
    return 'not_found'
  }

  return 'unresolved'
}
