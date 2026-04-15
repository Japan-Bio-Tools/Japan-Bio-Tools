import { buildEvidenceAndWarnings } from '../domain/evidenceWarningBuilder'
import { normalizeInput } from '../domain/inputNormalizer'
import { parseLocalStructureInput } from '../domain/localStructureInputParser'
import { selectNextLinksForError, selectNextLinksForSuccess } from '../domain/nextLinkSelector'
import { runClassification } from '../domain/classificationEngine'
import type { BioFileEnvelope, ConfidenceLevel, ErrorCode, EvidenceItem, NormalizedMetadataDTO } from '../types/contracts'
import { formatErrorEnvelope, formatSuccessEnvelope } from './resultFormatter'
import { lookupIdentifierMetadata } from './metadataAdapterOrchestrator'
import type { MetadataAdapter } from '../infrastructure/adapters/metadataAdapter'
import { createMetadataAdapters, type MetadataAdapterMode } from './metadataAdapterFactory'

type RunRequest = {
  textInput: string
  file: File | null
  adapterMode?: MetadataAdapterMode
  adapters?: MetadataAdapter[]
}

function baseMetadataForError(): NormalizedMetadataDTO {
  return {
    input_type: 'pdb_id',
    resolved_identifier: null,
    entry_resolution_status: 'unresolved',
    resolved_format_hint: null,
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
  }
}

function fallbackErrorFacts(errorCode: ErrorCode): EvidenceItem[] {
  if (errorCode === 'invalid_identifier' || errorCode === 'parse_failed') {
    return []
  }
  return []
}

function ensureConfidenceLevel(level: ConfidenceLevel): ConfidenceLevel {
  return level
}

function buildErrorEnvelope(
  errorCode: ErrorCode,
  message: string,
  reason: string,
  resolvedIdentifier: string | null,
  facts: EvidenceItem[],
): BioFileEnvelope {
  const next = selectNextLinksForError(errorCode, resolvedIdentifier)
  return formatErrorEnvelope({
    errorCode,
    message,
    reason,
    facts,
    nextStepCode: next.code,
    nextStepText: next.text,
    nextLinks: next.links,
  })
}

export async function runBioFileGuide(request: RunRequest): Promise<BioFileEnvelope> {
  const normalizedInput = normalizeInput(request.textInput, request.file)
  if (normalizedInput.kind === 'error') {
    return buildErrorEnvelope(
      normalizedInput.errorCode,
      normalizedInput.message,
      normalizedInput.reason,
      null,
      fallbackErrorFacts(normalizedInput.errorCode),
    )
  }

  if (normalizedInput.kind === 'file') {
    const localResult = await parseLocalStructureInput(normalizedInput.file, normalizedInput.formatHint)
    if (localResult.kind === 'error') {
      return buildErrorEnvelope(
        localResult.errorCode,
        localResult.message,
        localResult.reason,
        null,
        fallbackErrorFacts(localResult.errorCode),
      )
    }

    const classification = runClassification(
      normalizedInput,
      localResult.metadata,
      [],
    )
    if (classification.kind === 'error') {
      return buildErrorEnvelope(
        classification.errorCode,
        classification.message,
        classification.reason,
        null,
        fallbackErrorFacts(classification.errorCode),
      )
    }

    const detail = buildEvidenceAndWarnings(classification.outcome, localResult.metadata, [])
    const next = selectNextLinksForSuccess(classification.outcome)

    return formatSuccessEnvelope({
      input_type: classification.outcome.inputType,
      resolved_identifier: classification.outcome.resolvedIdentifier,
      entry_resolution_status: classification.outcome.entryResolutionStatus,
      resolved_format: classification.outcome.resolvedFormat,
      record_type: classification.outcome.recordType,
      source_database: classification.outcome.sourceDatabase,
      experiment_method: classification.outcome.experimentMethod,
      model_count: classification.outcome.modelCount,
      chain_count: classification.outcome.chainCount,
      ligand_status:
        classification.outcome.ligandDetected === null
          ? 'unknown'
          : classification.outcome.ligandDetected
            ? 'detected'
            : 'not_detected',
      water_status:
        classification.outcome.waterDetected === null
          ? 'unknown'
          : classification.outcome.waterDetected
            ? 'detected'
            : 'not_detected',
      legacy_pdb_compatibility: classification.outcome.legacyCompatibility,
      legacy_pdb_reason_code: classification.outcome.legacyReasonCode,
      legacy_pdb_reason_text: null,
      confidence: {
        scope: 'primary_classification',
        level: ensureConfidenceLevel(classification.outcome.confidenceLevel),
      },
      warning_codes: detail.warningCodes,
      beginner_warning: detail.beginnerWarnings,
      unknown_reason_code: classification.outcome.unknownReasonCode,
      evidence: detail.evidence,
      recommended_next_step_code: next.code,
      recommended_next_step: next.text,
      next_links: next.links,
    })
  }

  const adapters = request.adapters ?? createMetadataAdapters(request.adapterMode)
  const lookup = await lookupIdentifierMetadata(normalizedInput, adapters)
  const classification = runClassification(normalizedInput, lookup.metadata, lookup.outcomes)

  if (classification.kind === 'error') {
    const facts = buildEvidenceAndWarnings(
      {
        inputType: normalizedInput.inputType,
        resolvedIdentifier: normalizedInput.canonicalIdentifier,
        entryResolutionStatus: lookup.entryResolutionStatus,
        resolvedFormat: normalizedInput.inputType === 'pdb_id' ? 'pdb' : 'mmcif',
        recordType: 'unknown',
        sourceDatabase: 'unknown',
        experimentMethod: null,
        modelCount: null,
        chainCount: null,
        ligandDetected: null,
        waterDetected: null,
        legacyCompatibility: 'unknown',
        legacyReasonCode: null,
        unknownReasonCode: 'insufficient_evidence',
        confidenceLevel: 'low',
        metadataUnavailable: false,
      },
      baseMetadataForError(),
      lookup.outcomes,
    ).evidence

    return buildErrorEnvelope(
      classification.errorCode,
      classification.message,
      classification.reason,
      normalizedInput.canonicalIdentifier,
      facts,
    )
  }

  const detail = buildEvidenceAndWarnings(classification.outcome, lookup.metadata, lookup.outcomes)
  const next = selectNextLinksForSuccess(classification.outcome)

  return formatSuccessEnvelope({
    input_type: classification.outcome.inputType,
    resolved_identifier: classification.outcome.resolvedIdentifier,
    entry_resolution_status: classification.outcome.entryResolutionStatus,
    resolved_format: classification.outcome.resolvedFormat,
    record_type: classification.outcome.recordType,
    source_database: classification.outcome.sourceDatabase,
    experiment_method: classification.outcome.experimentMethod,
    model_count: classification.outcome.modelCount,
    chain_count: classification.outcome.chainCount,
    ligand_status:
      classification.outcome.ligandDetected === null
        ? 'unknown'
        : classification.outcome.ligandDetected
          ? 'detected'
          : 'not_detected',
    water_status:
      classification.outcome.waterDetected === null
        ? 'unknown'
        : classification.outcome.waterDetected
          ? 'detected'
          : 'not_detected',
    legacy_pdb_compatibility: classification.outcome.legacyCompatibility,
    legacy_pdb_reason_code: classification.outcome.legacyReasonCode,
    legacy_pdb_reason_text: null,
    confidence: {
      scope: 'primary_classification',
      level: ensureConfidenceLevel(classification.outcome.confidenceLevel),
    },
    warning_codes: detail.warningCodes,
    beginner_warning: detail.beginnerWarnings,
    unknown_reason_code: classification.outcome.unknownReasonCode,
    evidence: detail.evidence,
    recommended_next_step_code: next.code,
    recommended_next_step: next.text,
    next_links: next.links,
  })
}
