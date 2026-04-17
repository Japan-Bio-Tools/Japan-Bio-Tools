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
  ErrorEnvelope,
  NormalizedMetadataDTO,
  SourceRole,
  SuccessEnvelope,
  SuccessResult,
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

function expectError(envelope: BioFileEnvelope): asserts envelope is ErrorEnvelope {
  expect(envelope.status).toBe('error')
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

type SuccessStrictExpectation = Pick<
  SuccessResult,
  | 'input_type'
  | 'entry_resolution_status'
  | 'resolved_format'
  | 'record_type'
  | 'source_database'
  | 'legacy_pdb_compatibility'
  | 'recommended_next_step_code'
  | 'unknown_reason_code'
>

type SuccessNullableExpectation = Pick<
  SuccessResult,
  'resolved_identifier' | 'experiment_method' | 'model_count' | 'chain_count' | 'legacy_pdb_reason_code'
>

type SuccessEnumExpectation = Pick<SuccessResult, 'ligand_status' | 'water_status'> & {
  confidence_scope: SuccessResult['confidence']['scope']
  confidence_level: SuccessResult['confidence']['level']
}

type SuccessSetExpectation = {
  warning_codes: SuccessResult['warning_codes']
  evidence_codes: Array<SuccessResult['evidence'][number]['code']>
  next_link_destination_types: Array<SuccessResult['next_links'][number]['destination_type']>
}

type SuccessMeaningExpectation = {
  beginner_warning_contains: string[]
  recommended_next_step_contains: string
  legacy_pdb_reason_text_contains: string | null
}

type SuccessGoldExpectation = {
  status: 'success'
  strict: SuccessStrictExpectation
  nullable: SuccessNullableExpectation
  enum: SuccessEnumExpectation
  set: SuccessSetExpectation
  meaning: SuccessMeaningExpectation
}

type ErrorStrictExpectation = {
  error_code: ErrorEnvelope['error']['error_code']
  recommended_next_step_code: ErrorEnvelope['error']['recommended_next_step_code']
}

type ErrorSetExpectation = {
  evidence_codes: Array<ErrorEnvelope['error']['confirmed_facts'][number]['code']>
  next_link_destination_types: Array<ErrorEnvelope['error']['next_links'][number]['destination_type']>
}

type ErrorMeaningExpectation = {
  message_contains: string[]
  reason_contains: string[]
  recommended_next_step_contains: string
}

type ErrorGoldExpectation = {
  status: 'error'
  strict: ErrorStrictExpectation
  set: ErrorSetExpectation
  meaning: ErrorMeaningExpectation
}

type GoldSetExpectedOutput = SuccessGoldExpectation | ErrorGoldExpectation

type GoldSetCase = {
  name: string
  run: () => Promise<BioFileEnvelope>
  expected: GoldSetExpectedOutput
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function expectSetEqual(actual: readonly string[], expected: readonly string[]): void {
  expect(sortedUnique(actual)).toEqual(sortedUnique(expected))
}

function expectContainsAll(text: string, fragments: readonly string[]): void {
  for (const fragment of fragments) {
    expect(text).toContain(fragment)
  }
}

function expectArrayMeaningContainsAll(messages: readonly string[], fragments: readonly string[]): void {
  if (fragments.length === 0) {
    expect(messages).toHaveLength(0)
    return
  }
  for (const fragment of fragments) {
    expect(messages.some((message) => message.includes(fragment))).toBe(true)
  }
}

function assertSuccessByGoldSetCriteria(envelope: BioFileEnvelope, expected: SuccessGoldExpectation): void {
  expectSuccess(envelope)
  expect(envelope.schema_version).toBe('1.0.0')

  const result = envelope.result

  // strict equality
  expect(result.input_type).toBe(expected.strict.input_type)
  expect(result.entry_resolution_status).toBe(expected.strict.entry_resolution_status)
  expect(result.resolved_format).toBe(expected.strict.resolved_format)
  expect(result.record_type).toBe(expected.strict.record_type)
  expect(result.source_database).toBe(expected.strict.source_database)
  expect(result.legacy_pdb_compatibility).toBe(expected.strict.legacy_pdb_compatibility)
  expect(result.recommended_next_step_code).toBe(expected.strict.recommended_next_step_code)
  expect(result.unknown_reason_code).toBe(expected.strict.unknown_reason_code)

  // value or null equality
  expect(result.resolved_identifier).toBe(expected.nullable.resolved_identifier)
  expect(result.experiment_method).toBe(expected.nullable.experiment_method)
  expect(result.model_count).toBe(expected.nullable.model_count)
  expect(result.chain_count).toBe(expected.nullable.chain_count)
  expect(result.legacy_pdb_reason_code).toBe(expected.nullable.legacy_pdb_reason_code)

  // enum equality
  expect(result.ligand_status).toBe(expected.enum.ligand_status)
  expect(result.water_status).toBe(expected.enum.water_status)
  expect(result.confidence.scope).toBe(expected.enum.confidence_scope)
  expect(result.confidence.level).toBe(expected.enum.confidence_level)

  // order-insensitive set equality
  expectSetEqual(result.warning_codes, expected.set.warning_codes)
  expectSetEqual(
    result.evidence.map((item) => item.code),
    expected.set.evidence_codes,
  )
  expectSetEqual(
    result.next_links.map((link) => link.destination_type),
    expected.set.next_link_destination_types,
  )
  expect(result.next_links.length).toBeGreaterThan(0)

  // semantic equality
  expectArrayMeaningContainsAll(result.beginner_warning, expected.meaning.beginner_warning_contains)
  expect(result.recommended_next_step).toContain(expected.meaning.recommended_next_step_contains)
  if (expected.meaning.legacy_pdb_reason_text_contains === null) {
    expect(result.legacy_pdb_reason_text).toBeNull()
  } else {
    expect(result.legacy_pdb_reason_text).not.toBeNull()
    expect(result.legacy_pdb_reason_text ?? '').toContain(expected.meaning.legacy_pdb_reason_text_contains)
  }
}

function assertErrorByGoldSetCriteria(envelope: BioFileEnvelope, expected: ErrorGoldExpectation): void {
  expectError(envelope)
  expect(envelope.schema_version).toBe('1.0.0')

  const error = envelope.error

  // strict equality
  expect(error.error_code).toBe(expected.strict.error_code)
  expect(error.recommended_next_step_code).toBe(expected.strict.recommended_next_step_code)

  // order-insensitive set equality
  expectSetEqual(
    error.confirmed_facts.map((item) => item.code),
    expected.set.evidence_codes,
  )
  expectSetEqual(
    error.next_links.map((link) => link.destination_type),
    expected.set.next_link_destination_types,
  )
  expect(error.next_links.length).toBeGreaterThan(0)

  // semantic equality
  expectContainsAll(error.message, expected.meaning.message_contains)
  expectContainsAll(error.reason, expected.meaning.reason_contains)
  expect(error.recommended_next_step).toContain(expected.meaning.recommended_next_step_contains)
}

function assertGoldSetExpectedOutput(envelope: BioFileEnvelope, expected: GoldSetExpectedOutput): void {
  if (expected.status === 'success') {
    assertSuccessByGoldSetCriteria(envelope, expected)
    return
  }
  assertErrorByGoldSetCriteria(envelope, expected)
}

const GOLD_SET_EXPECTED_OUTPUT_CATALOG: GoldSetCase[] = [
  {
    name: '4文字PDB ID 正常系: expected output カタログ一致',
    run: () => runBioFileGuide({ textInput: '1CRN', file: null, adapterMode: 'mock' }),
    expected: {
      status: 'success',
      strict: {
        input_type: 'pdb_id',
        entry_resolution_status: 'verified',
        resolved_format: 'pdb',
        record_type: 'experimental_structure',
        source_database: 'PDB',
        legacy_pdb_compatibility: 'compatible',
        recommended_next_step_code: 'open_rcsb_entry',
        unknown_reason_code: null,
      },
      nullable: {
        resolved_identifier: '1CRN',
        experiment_method: 'X-RAY DIFFRACTION',
        model_count: 1,
        chain_count: 1,
        legacy_pdb_reason_code: null,
      },
      enum: {
        ligand_status: 'not_detected',
        water_status: 'detected',
        confidence_scope: 'primary_classification',
        confidence_level: 'high',
      },
      set: {
        warning_codes: ['water_present'],
        evidence_codes: [
          'pdb_identifier_detected',
          'format_pdb_detected',
          'explicit_exptl_method',
          'explicit_pdb_archive_provenance',
          'single_model_detected',
          'single_chain_detected',
          'water_records_detected',
          'metadata_primary_source_used',
          'metadata_secondary_source_used',
          'metadata_tertiary_source_used',
        ],
        next_link_destination_types: ['canonical_entry', 'viewer_remote'],
      },
      meaning: {
        beginner_warning_contains: ['水分子'],
        recommended_next_step_contains: '原典情報',
        legacy_pdb_reason_text_contains: null,
      },
    },
  },
  {
    name: '拡張PDB ID / unknown: expected output カタログ一致',
    run: () => runBioFileGuide({ textInput: 'pdb_00001abc', file: null, adapterMode: 'mock' }),
    expected: {
      status: 'success',
      strict: {
        input_type: 'extended_pdb_id',
        entry_resolution_status: 'verified',
        resolved_format: 'mmcif',
        record_type: 'unknown',
        source_database: 'PDB',
        legacy_pdb_compatibility: 'incompatible',
        recommended_next_step_code: 'check_origin_metadata',
        unknown_reason_code: 'conflicting_evidence',
      },
      nullable: {
        resolved_identifier: 'pdb_00001abc',
        experiment_method: null,
        model_count: null,
        chain_count: null,
        legacy_pdb_reason_code: 'extended_id_requires_mmcif',
      },
      enum: {
        ligand_status: 'unknown',
        water_status: 'unknown',
        confidence_scope: 'primary_classification',
        confidence_level: 'low',
      },
      set: {
        warning_codes: ['legacy_pdb_risk', 'classification_low_confidence'],
        evidence_codes: [
          'extended_pdb_identifier_detected',
          'format_mmcif_detected',
          'explicit_modelcif_marker',
          'explicit_ihm_marker',
          'explicit_pdb_archive_provenance',
          'explicit_modelarchive_provenance',
          'metadata_primary_source_used',
          'metadata_secondary_source_used',
          'metadata_tertiary_source_used',
          'metadata_source_conflict_detected',
          'legacy_pdb_incompatibility_marker',
        ],
        next_link_destination_types: ['canonical_entry', 'viewer_remote'],
      },
      meaning: {
        beginner_warning_contains: ['旧PDB形式', '根拠が弱い'],
        recommended_next_step_contains: '出自メタデータ',
        legacy_pdb_reason_text_contains: '拡張PDB ID前提',
      },
    },
  },
  {
    name: 'invalid_identifier: expected output カタログ一致',
    run: () => runBioFileGuide({ textInput: 'abc', file: null, adapterMode: 'mock' }),
    expected: {
      status: 'error',
      strict: {
        error_code: 'invalid_identifier',
        recommended_next_step_code: 'check_format_and_retry',
      },
      set: {
        evidence_codes: [],
        next_link_destination_types: ['search_entry', 'guide_article'],
      },
      meaning: {
        message_contains: ['ID形式'],
        reason_contains: ['4文字PDB ID'],
        recommended_next_step_contains: '再実行',
      },
    },
  },
  {
    name: 'parse_failed: expected output カタログ一致',
    run: () =>
      runBioFileGuide({
        textInput: '',
        file: fileLike('note.txt', 'not a structure'),
        adapterMode: 'mock',
      }),
    expected: {
      status: 'error',
      strict: {
        error_code: 'parse_failed',
        recommended_next_step_code: 'read_beginner_guide',
      },
      set: {
        evidence_codes: [],
        next_link_destination_types: ['guide_article', 'internal_guide'],
      },
      meaning: {
        message_contains: ['構文'],
        reason_contains: ['PDB または mmCIF'],
        recommended_next_step_contains: 'ガイド',
      },
    },
  },
  {
    name: 'unresolved -> success+unknown: expected output カタログ一致',
    run: () =>
      runBioFileGuide({
        textInput: '9UOK',
        file: null,
        adapters: staticAdaptersForIdentifier('9UOK'),
      }),
    expected: {
      status: 'success',
      strict: {
        input_type: 'pdb_id',
        entry_resolution_status: 'unresolved',
        resolved_format: 'pdb',
        record_type: 'unknown',
        source_database: 'unknown',
        legacy_pdb_compatibility: 'compatible',
        recommended_next_step_code: 'check_origin_metadata',
        unknown_reason_code: 'metadata_temporarily_unavailable',
      },
      nullable: {
        resolved_identifier: '9UOK',
        experiment_method: null,
        model_count: null,
        chain_count: null,
        legacy_pdb_reason_code: null,
      },
      enum: {
        ligand_status: 'unknown',
        water_status: 'unknown',
        confidence_scope: 'primary_classification',
        confidence_level: 'low',
      },
      set: {
        warning_codes: ['classification_low_confidence', 'external_metadata_temporarily_unavailable'],
        evidence_codes: [
          'pdb_identifier_detected',
          'format_pdb_detected',
          'metadata_secondary_lookup_failed',
          'metadata_tertiary_lookup_failed',
          'external_metadata_lookup_failed',
        ],
        next_link_destination_types: ['canonical_entry', 'viewer_remote'],
      },
      meaning: {
        beginner_warning_contains: ['根拠が弱い', '外部情報'],
        recommended_next_step_contains: '出自メタデータ',
        legacy_pdb_reason_text_contains: null,
      },
    },
  },
  {
    name: 'entry_not_found: expected output カタログ一致',
    run: () =>
      runBioFileGuide({
        textInput: '9NF0',
        file: null,
        adapters: staticAdaptersForIdentifier('9NF0'),
      }),
    expected: {
      status: 'error',
      strict: {
        error_code: 'entry_not_found',
        recommended_next_step_code: 'check_origin_metadata',
      },
      set: {
        evidence_codes: ['pdb_identifier_detected', 'format_pdb_detected'],
        next_link_destination_types: ['search_entry', 'canonical_entry'],
      },
      meaning: {
        message_contains: ['該当エントリ'],
        reason_contains: ['Primary/Secondary'],
        recommended_next_step_contains: '出自メタデータ',
      },
    },
  },
  {
    name: 'external_metadata_unavailable: expected output カタログ一致',
    run: () =>
      runBioFileGuide({
        textInput: '2UNV',
        file: null,
        adapters: staticAdaptersForIdentifier('2UNV'),
      }),
    expected: {
      status: 'error',
      strict: {
        error_code: 'external_metadata_unavailable',
        recommended_next_step_code: 'read_beginner_guide',
      },
      set: {
        evidence_codes: [
          'pdb_identifier_detected',
          'format_pdb_detected',
          'metadata_secondary_lookup_failed',
          'metadata_tertiary_lookup_failed',
          'external_metadata_lookup_failed',
        ],
        next_link_destination_types: ['guide_article', 'internal_guide'],
      },
      meaning: {
        message_contains: ['外部メタデータ'],
        reason_contains: ['一時取得不能'],
        recommended_next_step_contains: 'ガイド',
      },
    },
  },
  {
    name: 'partial data: expected output カタログ一致',
    run: () =>
      runBioFileGuide({
        textInput: '9SPA',
        file: null,
        adapters: staticAdaptersForIdentifier('9SPA'),
      }),
    expected: {
      status: 'success',
      strict: {
        input_type: 'pdb_id',
        entry_resolution_status: 'verified',
        resolved_format: 'pdb',
        record_type: 'unknown',
        source_database: 'PDB',
        legacy_pdb_compatibility: 'compatible',
        recommended_next_step_code: 'check_origin_metadata',
        unknown_reason_code: 'insufficient_evidence',
      },
      nullable: {
        resolved_identifier: '9SPA',
        experiment_method: null,
        model_count: 1,
        chain_count: null,
        legacy_pdb_reason_code: null,
      },
      enum: {
        ligand_status: 'unknown',
        water_status: 'unknown',
        confidence_scope: 'primary_classification',
        confidence_level: 'low',
      },
      set: {
        warning_codes: ['classification_low_confidence'],
        evidence_codes: [
          'pdb_identifier_detected',
          'format_pdb_detected',
          'explicit_pdb_archive_provenance',
          'single_model_detected',
          'metadata_primary_source_used',
          'metadata_secondary_source_used',
          'metadata_tertiary_source_used',
        ],
        next_link_destination_types: ['canonical_entry', 'viewer_remote'],
      },
      meaning: {
        beginner_warning_contains: ['根拠が弱い'],
        recommended_next_step_contains: '出自メタデータ',
        legacy_pdb_reason_text_contains: null,
      },
    },
  },
  {
    name: 'local no-ID: expected output カタログ一致',
    run: () =>
      runBioFileGuide({
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
      }),
    expected: {
      status: 'success',
      strict: {
        input_type: 'local_pdb',
        entry_resolution_status: 'unresolved',
        resolved_format: 'pdb',
        record_type: 'experimental_structure',
        source_database: 'local_file',
        legacy_pdb_compatibility: 'compatible',
        recommended_next_step_code: 'open_molmil_local_guide',
        unknown_reason_code: null,
      },
      nullable: {
        resolved_identifier: null,
        experiment_method: 'X-RAY DIFFRACTION',
        model_count: 1,
        chain_count: 1,
        legacy_pdb_reason_code: null,
      },
      enum: {
        ligand_status: 'not_detected',
        water_status: 'not_detected',
        confidence_scope: 'primary_classification',
        confidence_level: 'medium',
      },
      set: {
        warning_codes: [],
        evidence_codes: [
          'format_pdb_detected',
          'explicit_exptl_method',
          'single_model_detected',
          'single_chain_detected',
          'local_file_without_reliable_provenance',
        ],
        next_link_destination_types: ['viewer_local_guide', 'guide_article'],
      },
      meaning: {
        beginner_warning_contains: [],
        recommended_next_step_contains: 'ローカル閲覧ガイド',
        legacy_pdb_reason_text_contains: null,
      },
    },
  },
  {
    name: 'local mmCIF: expected output カタログ一致',
    run: () =>
      runBioFileGuide({
        textInput: '',
        file: fileLike(
          'local.cif',
          [
            'data_local_mmcif',
            '_exptl.method X-RAY DIFFRACTION',
            '_atom_site.group_PDB ATOM',
          ].join('\n'),
        ),
        adapterMode: 'mock',
      }),
    expected: {
      status: 'success',
      strict: {
        input_type: 'local_mmcif',
        entry_resolution_status: 'unresolved',
        resolved_format: 'mmcif',
        record_type: 'experimental_structure',
        source_database: 'local_file',
        legacy_pdb_compatibility: 'caution',
        recommended_next_step_code: 'open_molmil_local_guide',
        unknown_reason_code: null,
      },
      nullable: {
        resolved_identifier: null,
        experiment_method: 'X-RAY DIFFRACTION',
        model_count: null,
        chain_count: null,
        legacy_pdb_reason_code: 'mmcif_only_representation',
      },
      enum: {
        ligand_status: 'unknown',
        water_status: 'unknown',
        confidence_scope: 'primary_classification',
        confidence_level: 'medium',
      },
      set: {
        warning_codes: ['legacy_pdb_risk'],
        evidence_codes: [
          'format_mmcif_detected',
          'explicit_exptl_method',
          'local_file_without_reliable_provenance',
          'legacy_pdb_caution_marker',
        ],
        next_link_destination_types: ['viewer_local_guide', 'guide_article'],
      },
      meaning: {
        beginner_warning_contains: ['旧PDB形式'],
        recommended_next_step_contains: 'ローカル閲覧ガイド',
        legacy_pdb_reason_text_contains: 'mmCIF前提',
      },
    },
  },
]

describe('gold-set expected output catalog (recorded fixture backed)', () => {
  for (const testCase of GOLD_SET_EXPECTED_OUTPUT_CATALOG) {
    it(testCase.name, async () => {
      const envelope = await testCase.run()
      assertGoldSetExpectedOutput(envelope, testCase.expected)
    })
  }
})

describe('gold-set focused regressions', () => {
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
})
