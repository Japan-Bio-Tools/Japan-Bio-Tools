import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./application/runBioFileGuide', () => ({
  runBioFileGuide: vi.fn(),
}))

import { runBioFileGuide } from './application/runBioFileGuide'
import App from './App'
import { SCHEMA_VERSION, type BioFileEnvelope } from './types/contracts'

function identifierSuccessEnvelope(identifier: string): BioFileEnvelope {
  return {
    schema_version: SCHEMA_VERSION,
    status: 'success',
    result: {
      input_type: 'pdb_id',
      resolved_identifier: identifier,
      entry_resolution_status: 'verified',
      resolved_format: 'pdb',
      record_type: 'experimental_structure',
      source_database: 'PDB',
      experiment_method: 'X-RAY DIFFRACTION',
      model_count: 1,
      chain_count: 1,
      ligand_status: 'not_detected',
      water_status: 'not_detected',
      legacy_pdb_compatibility: 'compatible',
      legacy_pdb_reason_code: null,
      legacy_pdb_reason_text: null,
      confidence: {
        scope: 'primary_classification',
        level: 'high',
      },
      warning_codes: [],
      beginner_warning: [],
      unknown_reason_code: null,
      evidence: [{ code: 'explicit_exptl_method', detail: 'fixture evidence' }],
      recommended_next_step_code: 'open_rcsb_entry',
      recommended_next_step: 'RCSB を開きます。',
      next_links: [
        {
          label: 'RCSB エントリ',
          reason: '原典確認',
          destination_type: 'canonical_entry',
          href: `https://www.rcsb.org/structure/${identifier}`,
        },
      ],
    },
  }
}

function localFileSuccessEnvelope(): BioFileEnvelope {
  return {
    schema_version: SCHEMA_VERSION,
    status: 'success',
    result: {
      input_type: 'local_pdb',
      resolved_identifier: null,
      entry_resolution_status: 'unresolved',
      resolved_format: 'pdb',
      record_type: 'unknown',
      source_database: 'local_file',
      experiment_method: null,
      model_count: 1,
      chain_count: 1,
      ligand_status: 'unknown',
      water_status: 'unknown',
      legacy_pdb_compatibility: 'unknown',
      legacy_pdb_reason_code: null,
      legacy_pdb_reason_text: null,
      confidence: {
        scope: 'primary_classification',
        level: 'low',
      },
      warning_codes: ['origin_uncertain'],
      beginner_warning: ['出自を断定できないため、原典情報の確認を先に行ってください。'],
      unknown_reason_code: 'unresolved_provenance',
      evidence: [{ code: 'local_file_without_reliable_provenance', detail: 'fixture evidence' }],
      recommended_next_step_code: 'open_molmil_local_guide',
      recommended_next_step: 'ローカルビューア導線を確認してください。',
      next_links: [
        {
          label: 'Molmil ローカルガイド',
          reason: 'ローカル入力向け',
          destination_type: 'viewer_local_guide',
          href: 'https://pdbj.org/help/molmil',
        },
      ],
    },
  }
}

function externalMetadataUnavailableEnvelope(): BioFileEnvelope {
  return {
    schema_version: SCHEMA_VERSION,
    status: 'error',
    error: {
      error_code: 'external_metadata_unavailable',
      message: '外部メタデータを現在確認できません。',
      reason: '一時取得不能です。',
      confirmed_facts: [],
      recommended_next_step_code: 'read_beginner_guide',
      recommended_next_step: '時間をおいて再試行してください。',
      next_links: [
        {
          label: 'フォーマットガイド',
          reason: '手順確認',
          destination_type: 'internal_guide',
          href: '/guide',
        },
      ],
    },
  }
}

describe('App persistent cache integration', () => {
  const runBioFileGuideMock = vi.mocked(runBioFileGuide)

  beforeEach(() => {
    runBioFileGuideMock.mockReset()
    window.localStorage.clear()
  })

  it('runs pipeline on first identifier execution and reuses localStorage on the second execution', async () => {
    runBioFileGuideMock.mockResolvedValue(identifierSuccessEnvelope('1CRN'))

    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '実験構造の例' }))
    await user.click(screen.getByRole('button', { name: '判定を実行' }))
    expect(await screen.findByText('experimental_structure')).toBeInTheDocument()
    await waitFor(() => expect(runBioFileGuideMock).toHaveBeenCalledTimes(1))
    expect(runBioFileGuideMock).toHaveBeenLastCalledWith({ textInput: '1CRN', file: null, adapterMode: 'mock' })

    await user.click(screen.getByRole('button', { name: '判定を実行' }))
    await waitFor(() => expect(runBioFileGuideMock).toHaveBeenCalledTimes(1))
  })

  it('does not use persistent cache for local file input', async () => {
    runBioFileGuideMock.mockResolvedValue(localFileSuccessEnvelope())

    const user = userEvent.setup()
    render(<App />)

    await user.upload(
      screen.getByLabelText('ローカルファイル'),
      new File(['HEADER    LOCAL STRUCTURE\nEND'], 'local.pdb', { type: 'text/plain' }),
    )

    await user.click(screen.getByRole('button', { name: '判定を実行' }))
    await waitFor(() => expect(runBioFileGuideMock).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: '判定を実行' }))
    await waitFor(() => expect(runBioFileGuideMock).toHaveBeenCalledTimes(2))
  })

  it('does not persist unstable external_metadata_unavailable error', async () => {
    runBioFileGuideMock.mockResolvedValue(externalMetadataUnavailableEnvelope())

    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'API一時不達の例' }))
    await user.click(screen.getByRole('button', { name: '判定を実行' }))
    expect(await screen.findByText('external_metadata_unavailable')).toBeInTheDocument()
    await waitFor(() => expect(runBioFileGuideMock).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: '判定を実行' }))
    await waitFor(() => expect(runBioFileGuideMock).toHaveBeenCalledTimes(2))
  })
})
