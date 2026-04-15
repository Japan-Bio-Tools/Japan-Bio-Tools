import { LEGACY_REASON_TEXT_MAP } from '../domain/contractConstants'
import { SCHEMA_VERSION, type BioFileEnvelope, type ErrorCode, type EvidenceItem, type SuccessResult } from '../types/contracts'

export function formatSuccessEnvelope(result: SuccessResult): BioFileEnvelope {
  const legacyReasonText =
    result.legacy_pdb_reason_code === null ? null : LEGACY_REASON_TEXT_MAP[result.legacy_pdb_reason_code]

  const normalized: SuccessResult = {
    ...result,
    legacy_pdb_reason_text: legacyReasonText,
    next_links: result.next_links.length > 0 ? result.next_links : [],
  }

  return {
    schema_version: SCHEMA_VERSION,
    status: 'success',
    result: normalized,
  }
}

export function formatErrorEnvelope(params: {
  errorCode: ErrorCode
  message: string
  reason: string
  facts: EvidenceItem[]
  nextStepCode: SuccessResult['recommended_next_step_code']
  nextStepText: string
  nextLinks: SuccessResult['next_links']
}): BioFileEnvelope {
  return {
    schema_version: SCHEMA_VERSION,
    status: 'error',
    error: {
      error_code: params.errorCode,
      message: params.message,
      reason: params.reason,
      confirmed_facts: params.facts,
      recommended_next_step_code: params.nextStepCode,
      recommended_next_step: params.nextStepText,
      next_links: params.nextLinks,
    },
  }
}
