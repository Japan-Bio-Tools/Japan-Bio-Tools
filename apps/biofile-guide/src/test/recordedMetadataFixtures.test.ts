import { describe, expect, it } from 'vitest'
import {
  RECORDED_METADATA_FIXTURES,
  getRecordedFixtureByCase,
  getRecordedFixtureByIdentifier,
} from '../mocks/recordedMetadataFixtures'
import type { AdapterSource } from '../types/contracts'

const PROVIDERS: AdapterSource[] = ['RCSB', 'PDBe', 'PDBj']
const REQUIRED_CASES = ['found', 'not_found', 'unavailable', 'partial', 'conflict_marker'] as const

describe('recorded metadata fixtures', () => {
  it('keeps required case coverage for each provider', () => {
    for (const provider of PROVIDERS) {
      const cases = RECORDED_METADATA_FIXTURES[provider].map((fixture) => fixture.caseType)
      for (const requiredCase of REQUIRED_CASES) {
        expect(cases).toContain(requiredCase)
      }
    }
  })

  it('keeps stable identifiers for canonical regression entries', () => {
    expect(getRecordedFixtureByIdentifier('RCSB', '1CRN').state).toBe('found')
    expect(getRecordedFixtureByIdentifier('PDBe', '1CRN').state).toBe('found')
    expect(getRecordedFixtureByIdentifier('PDBj', '1CRN').state).toBe('found')
  })

  it('returns not_found fallback for unknown identifiers', () => {
    for (const provider of PROVIDERS) {
      const fixture = getRecordedFixtureByIdentifier(provider, '__UNKNOWN__')
      expect(fixture.state).toBe('not_found')
    }
  })

  it('exposes unavailable and partial fixtures by case for gold-set tests', () => {
    for (const provider of PROVIDERS) {
      expect(getRecordedFixtureByCase(provider, 'unavailable').state).toBe('unavailable')
      expect(getRecordedFixtureByCase(provider, 'partial').state).toBe('found')
    }
  })
})
