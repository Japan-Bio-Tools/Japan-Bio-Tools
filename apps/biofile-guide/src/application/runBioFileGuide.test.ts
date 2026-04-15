import { describe, expect, it } from 'vitest'
import type { BioFileEnvelope, ErrorEnvelope, SuccessEnvelope } from '../types/contracts'
import { runBioFileGuide } from './runBioFileGuide'

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

describe('runBioFileGuide pipeline contracts', () => {
  it('keeps a verified PDB fixture as a success envelope', async () => {
    const envelope = await runBioFileGuide({ textInput: '1crn', file: null })

    expectSuccess(envelope)
    expect(envelope.result.record_type).toBe('experimental_structure')
    expect(envelope.result.source_database).toBe('PDB')
    expect(envelope.result.entry_resolution_status).toBe('verified')
    expect(envelope.result.recommended_next_step_code).toBe('open_rcsb_entry')
    expect(envelope.result.next_links.some((link) => link.destination_type === 'canonical_entry')).toBe(true)
  })

  it('keeps an ambiguous extended ID as a success envelope with unknown classification', async () => {
    const envelope = await runBioFileGuide({ textInput: 'PDB_00001ABC', file: null })

    expectSuccess(envelope)
    expect(envelope.result.input_type).toBe('extended_pdb_id')
    expect(envelope.result.resolved_identifier).toBe('pdb_00001abc')
    expect(envelope.result.record_type).toBe('unknown')
    expect(envelope.result.unknown_reason_code).toBe('conflicting_evidence')
    expect(envelope.result.recommended_next_step_code).toBe('check_origin_metadata')
    expect(envelope.result.next_links.some((link) => link.destination_type === 'canonical_entry')).toBe(true)
  })

  it('keeps invalid_identifier separate from unresolved metadata states', async () => {
    const envelope = await runBioFileGuide({ textInput: 'abc', file: null })

    expectError(envelope)
    expect(envelope.error.error_code).toBe('invalid_identifier')
    expect(envelope.error.confirmed_facts).toEqual([])
    expect(envelope.error.next_links.length).toBeGreaterThan(0)
    expect(envelope.error.recommended_next_step_code).toBe('check_format_and_retry')
  })

  it('returns parse_failed for a local file that cannot be parsed as PDB or mmCIF', async () => {
    const envelope = await runBioFileGuide({
      textInput: '',
      file: fileLike('note.txt', 'not a structure'),
    })

    expectError(envelope)
    expect(envelope.error.error_code).toBe('parse_failed')
    expect(envelope.error.confirmed_facts).toEqual([])
  })

  it('returns external_metadata_unavailable without collapsing it into not_found or invalid_identifier', async () => {
    const envelope = await runBioFileGuide({ textInput: '2UNV', file: null })

    expectError(envelope)
    expect(envelope.error.error_code).toBe('external_metadata_unavailable')
    expect(envelope.error.recommended_next_step_code).toBe('read_beginner_guide')
    expect(envelope.error.next_links.length).toBeGreaterThan(0)
  })

  it('does not provide remote canonical links for a local file without an ID', async () => {
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
    })

    expectSuccess(envelope)
    expect(envelope.result.resolved_identifier).toBeNull()
    expect(envelope.result.recommended_next_step_code).toBe('open_molmil_local_guide')
    expect(envelope.result.next_links.some((link) => link.destination_type === 'viewer_local_guide')).toBe(true)
    expect(envelope.result.next_links.every((link) => link.destination_type !== 'canonical_entry')).toBe(true)
    expect(envelope.result.next_links.every((link) => link.destination_type !== 'viewer_remote')).toBe(true)
    expect(envelope.result.next_links.every((link) => link.destination_type !== 'search_entry')).toBe(true)
  })
})
