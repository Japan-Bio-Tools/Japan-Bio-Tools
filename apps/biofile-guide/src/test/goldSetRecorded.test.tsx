import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { runBioFileGuide } from '../application/runBioFileGuide'
import type { AdapterLookupResult, ClassificationOutcome, NormalizedIdentifierInput } from '../application/pipelineTypes'
import { runClassification } from '../domain/classificationEngine'
import { LINK_TEMPLATES } from '../domain/contractConstants'
import { buildEvidenceAndWarnings } from '../domain/evidenceWarningBuilder'
import type { MetadataAdapter } from '../infrastructure/adapters/metadataAdapter'
import {
  getRecordedFixtureByIdentifier,
  toAdapterLookupResultFromRecorded,
} from '../mocks/recordedMetadataFixtures'
import type {
  AdapterSource,
  BioFileEnvelope,
  NormalizedMetadataDTO,
  SourceRole,
  SuccessEnvelope,
} from '../types/contracts'
import App from '../App'

class StaticAdapter implements MetadataAdapter {
  constructor(private readonly outcome: AdapterLookupResult) {}

  async lookup(input: NormalizedIdentifierInput): Promise<AdapterLookupResult> {
    void input
    return this.outcome
  }
}

function fileLike(name: string, text: string): File {
  return {
    name,
    text: () => Promise.resolve(text),
  } as File
}

function expectSuccess(envelope: BioFileEnvelope): asserts envelope is SuccessEnvelope {
  expect(envelope.status).toBe('success')
}

function staticAdaptersForIdentifier(
  identifier: string,
  overrides?: Partial<Record<AdapterSource, AdapterLookupResult>>,
): MetadataAdapter[] {
  const providerRole: Array<[AdapterSource, SourceRole]> = [
    ['RCSB', 'primary'],
    ['PDBe', 'secondary'],
    ['PDBj', 'tertiary'],
  ]
  return providerRole.map(([provider, role]) => {
    const outcome =
      overrides?.[provider] ??
      toAdapterLookupResultFromRecorded(
        getRecordedFixtureByIdentifier(provider, identifier),
        role,
      )
    return new StaticAdapter(outcome)
  })
}

function hrefFromTemplate(template: string, id: string): string {
  return template
    .replaceAll('{id}', id)
    .replaceAll('{id_upper}', id.toUpperCase())
    .replaceAll('{id_lower}', id.toLowerCase())
}

function outcome(overrides: Partial<ClassificationOutcome> = {}): ClassificationOutcome {
  return {
    inputType: 'local_pdb',
    resolvedIdentifier: null,
    entryResolutionStatus: 'unresolved',
    resolvedFormat: 'pdb',
    recordType: 'unknown',
    sourceDatabase: 'local_file',
    experimentMethod: null,
    modelCount: null,
    chainCount: null,
    ligandDetected: null,
    waterDetected: null,
    legacyCompatibility: 'compatible',
    legacyReasonCode: null,
    unknownReasonCode: null,
    confidenceLevel: 'low',
    metadataUnavailable: false,
    ...overrides,
  }
}

function baseMetadata(overrides: Partial<NormalizedMetadataDTO> = {}): NormalizedMetadataDTO {
  return {
    input_type: 'local_pdb',
    resolved_identifier: null,
    entry_resolution_status: 'unresolved',
    resolved_format_hint: 'pdb',
    archive_exists: null,
    experiment_method: null,
    record_type_markers: [],
    provenance_markers: [],
    model_count: null,
    chain_count: null,
    ligand_detected: null,
    water_detected: null,
    legacy_compatibility_hints: [],
    source_used: [],
    source_conflicts: [],
    ...overrides,
  }
}

describe('gold-set (recorded fixture backed)', () => {
  it('4文字PDB ID 正常系: success envelope を返す', async () => {
    const envelope = await runBioFileGuide({ textInput: '1CRN', file: null, adapterMode: 'mock' })
    expectSuccess(envelope)
    expect(envelope.result.entry_resolution_status).toBe('verified')
    expect(envelope.result.source_database).toBe('PDB')
  })

  it('拡張PDB ID 系: unknown を保持した success を返す', async () => {
    const envelope = await runBioFileGuide({ textInput: 'pdb_00001abc', file: null, adapterMode: 'mock' })
    expectSuccess(envelope)
    expect(envelope.result.record_type).toBe('unknown')
    expect(envelope.result.unknown_reason_code).toBe('conflicting_evidence')
  })

  it('invalid_identifier を error として分離する', async () => {
    const envelope = await runBioFileGuide({ textInput: 'abc', file: null, adapterMode: 'mock' })
    expect(envelope.status).toBe('error')
    if (envelope.status === 'error') {
      expect(envelope.error.error_code).toBe('invalid_identifier')
    }
  })

  it('parse_failed を error として返す', async () => {
    const envelope = await runBioFileGuide({
      textInput: '',
      file: fileLike('note.txt', 'not a structure'),
      adapterMode: 'mock',
    })
    expect(envelope.status).toBe('error')
    if (envelope.status === 'error') {
      expect(envelope.error.error_code).toBe('parse_failed')
    }
  })

  it('unresolved は success+unknown へ落とし、error に潰さない', async () => {
    const envelope = await runBioFileGuide({
      textInput: '9UOK',
      file: null,
      adapters: staticAdaptersForIdentifier('9UOK'),
    })
    expectSuccess(envelope)
    expect(envelope.result.entry_resolution_status).toBe('unresolved')
    expect(envelope.result.record_type).toBe('unknown')
    expect(envelope.result.unknown_reason_code).toBe('metadata_temporarily_unavailable')
  })

  it('not_found は entry_not_found error を返す', async () => {
    const envelope = await runBioFileGuide({
      textInput: '9NF0',
      file: null,
      adapters: staticAdaptersForIdentifier('9NF0'),
    })
    expect(envelope.status).toBe('error')
    if (envelope.status === 'error') {
      expect(envelope.error.error_code).toBe('entry_not_found')
    }
  })

  it('external_metadata_unavailable は安全導線不能時のみ error になる', async () => {
    const envelope = await runBioFileGuide({
      textInput: '2UNV',
      file: null,
      adapters: staticAdaptersForIdentifier('2UNV'),
    })
    expect(envelope.status).toBe('error')
    if (envelope.status === 'error') {
      expect(envelope.error.error_code).toBe('external_metadata_unavailable')
    }
  })

  it('provenance 競合を source_database=unknown として扱う', () => {
    const classification = runClassification(
      {
        kind: 'file',
        file: fileLike('local.pdb', 'HEADER TEST'),
        formatHint: 'local_pdb',
      },
      baseMetadata({
        provenance_markers: [
          'explicit_alphafolddb_provenance',
          'explicit_modelarchive_provenance',
        ],
      }),
      [],
    )
    expect(classification.kind).toBe('success')
    if (classification.kind === 'success') {
      expect(classification.outcome.sourceDatabase).toBe('unknown')
      expect(classification.outcome.unknownReasonCode).toBe('conflicting_evidence')
    }
  })

  it('local no-ID では remote canonical に雑フォールバックしない', async () => {
    const envelope = await runBioFileGuide({
      textInput: '',
      file: fileLike(
        'local.pdb',
        [
          'HEADER    LOCAL STRUCTURE',
          'EXPDTA    X-RAY DIFFRACTION',
          'ATOM      1  N   GLY A   1      11.104  13.207   2.100  1.00 20.00           N',
          'END',
        ].join('\n'),
      ),
      adapterMode: 'mock',
    })
    expectSuccess(envelope)
    expect(envelope.result.resolved_identifier).toBeNull()
    expect(envelope.result.next_links.every((link) => link.destination_type !== 'canonical_entry')).toBe(true)
    expect(envelope.result.next_links.every((link) => link.destination_type !== 'viewer_remote')).toBe(true)
  })

  it('next_links が allowlist template 由来のみである', async () => {
    const envelope = await runBioFileGuide({ textInput: '1CRN', file: null, adapterMode: 'mock' })
    expectSuccess(envelope)
    const allowedHrefs = Object.values(LINK_TEMPLATES).map((item) => hrefFromTemplate(item.template, '1CRN'))
    envelope.result.next_links.forEach((link) => {
      expect(allowedHrefs).toContain(link.href)
    })
  })

  it('warning priority 順を保持する', () => {
    const built = buildEvidenceAndWarnings(
      outcome({
        recordType: 'integrative_structure',
        legacyCompatibility: 'incompatible',
        legacyReasonCode: 'integrative_not_supported_in_pdb',
        modelCount: 2,
        chainCount: 2,
        ligandDetected: true,
        waterDetected: true,
        confidenceLevel: 'low',
      }),
      baseMetadata(),
      [],
    )
    expect(built.warningCodes).toEqual([
      'legacy_pdb_risk',
      'classification_low_confidence',
      'integrative_representation_caution',
      'multiple_models_present',
      'multiple_chains_present',
      'ligand_present',
      'water_present',
    ])
  })

  it('resolved_identifier 注意表示を UI が維持する', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '実験構造の例' }))
    await user.click(screen.getByRole('button', { name: '判定を実行' }))
    expect(await screen.findByText(/存在確認済みを意味しません/)).toBeInTheDocument()
  })

  it('partial data でも success/unknown を壊さない', async () => {
    const envelope = await runBioFileGuide({
      textInput: '9SPA',
      file: null,
      adapters: staticAdaptersForIdentifier('9SPA'),
    })
    expectSuccess(envelope)
    expect(envelope.result.entry_resolution_status).toBe('verified')
    expect(envelope.result.record_type).toBe('unknown')
  })
})
