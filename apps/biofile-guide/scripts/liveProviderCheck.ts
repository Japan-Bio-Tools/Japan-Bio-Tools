import type { AdapterLookupResult, NormalizedIdentifierInput } from '../src/application/pipelineTypes'
import { clearAdapterSessionLookupCache } from '../src/infrastructure/adapters/adapterRequestSupport'
import type { MetadataAdapter } from '../src/infrastructure/adapters/metadataAdapter'
import { PdbeMetadataAdapter } from '../src/infrastructure/adapters/pdbeMetadataAdapter'
import { PdbjMetadataAdapter } from '../src/infrastructure/adapters/pdbjMetadataAdapter'
import { RcsbMetadataAdapter } from '../src/infrastructure/adapters/rcsbMetadataAdapter'

type ProviderName = 'RCSB' | 'PDBe' | 'PDBj'
type LiveState = 'success' | 'not_found' | 'unavailable'

type ProviderSpec = {
  provider: ProviderName
  createAdapter: () => MetadataAdapter
}

type ProviderCheckResult = {
  provider: ProviderName
  knownState: LiveState
  knownDetail: string
  unknownState: LiveState
  unknownDetail: string
  pass: boolean
}

const KNOWN_IDENTIFIER = '1CRN'
const UNKNOWN_IDENTIFIER = '0000'

const PROVIDERS: ProviderSpec[] = [
  {
    provider: 'RCSB',
    createAdapter: () => new RcsbMetadataAdapter('primary'),
  },
  {
    provider: 'PDBe',
    createAdapter: () => new PdbeMetadataAdapter('secondary'),
  },
  {
    provider: 'PDBj',
    createAdapter: () => new PdbjMetadataAdapter('tertiary'),
  },
]

function createIdentifierInput(identifier: string): NormalizedIdentifierInput {
  return {
    kind: 'identifier',
    inputType: 'pdb_id',
    rawText: identifier,
    canonicalIdentifier: identifier.toUpperCase(),
  }
}

function toLiveState(outcome: AdapterLookupResult): LiveState {
  if (outcome.state === 'found') {
    return 'success'
  }
  if (outcome.state === 'not_found') {
    return 'not_found'
  }
  return 'unavailable'
}

function toSingleLine(value: string): string {
  return value.replaceAll('|', '/').replaceAll('\n', ' ').trim()
}

async function runProviderCheck(spec: ProviderSpec): Promise<ProviderCheckResult> {
  clearAdapterSessionLookupCache()

  const adapter = spec.createAdapter()
  const knownOutcome = await adapter.lookup(createIdentifierInput(KNOWN_IDENTIFIER))
  const unknownOutcome = await adapter.lookup(createIdentifierInput(UNKNOWN_IDENTIFIER))

  const knownState = toLiveState(knownOutcome)
  const unknownState = toLiveState(unknownOutcome)

  return {
    provider: spec.provider,
    knownState,
    knownDetail: knownOutcome.detail,
    unknownState,
    unknownDetail: unknownOutcome.detail,
    pass: knownState === 'success' && unknownState === 'not_found',
  }
}

function printSummary(results: ProviderCheckResult[]): void {
  console.log('BioFile Guide live API check v1 (optional / non-blocking)')
  console.log(`Known identifier: ${KNOWN_IDENTIFIER}`)
  console.log(`Unknown identifier: ${UNKNOWN_IDENTIFIER}`)
  console.log('')
  console.log('| Provider | known check | unknown check | verdict |')
  console.log('| --- | --- | --- | --- |')
  for (const result of results) {
    console.log(
      `| ${result.provider} | ${result.knownState} (${toSingleLine(result.knownDetail)}) | ${result.unknownState} (${toSingleLine(result.unknownDetail)}) | ${result.pass ? 'PASS' : 'FAIL'} |`,
    )
  }
}

function printFailureDetails(results: ProviderCheckResult[]): void {
  const failures = results.filter((result) => !result.pass)
  if (failures.length === 0) {
    return
  }

  console.log('')
  console.log('Failure details:')
  for (const result of failures) {
    if (result.knownState !== 'success') {
      console.log(
        `- ${result.provider}: known(${KNOWN_IDENTIFIER}) expected success but got ${result.knownState} (${result.knownDetail})`,
      )
    }
    if (result.unknownState !== 'not_found') {
      console.log(
        `- ${result.provider}: unknown(${UNKNOWN_IDENTIFIER}) expected not_found but got ${result.unknownState} (${result.unknownDetail})`,
      )
    }
  }
}

async function main(): Promise<void> {
  const results: ProviderCheckResult[] = []
  for (const provider of PROVIDERS) {
    const result = await runProviderCheck(provider)
    results.push(result)
  }

  printSummary(results)
  printFailureDetails(results)

  const failedProviders = results.filter((result) => !result.pass).map((result) => result.provider)
  if (failedProviders.length > 0) {
    throw new Error(`Live provider check failed: ${failedProviders.join(', ')}`)
  }
}

void main().catch((error: unknown) => {
  const normalizedError = error instanceof Error ? error : new Error(String(error))
  console.error(normalizedError.message)
  throw normalizedError
})
