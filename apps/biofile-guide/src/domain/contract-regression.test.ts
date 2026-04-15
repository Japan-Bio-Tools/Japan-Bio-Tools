import { describe, expect, it } from 'vitest'
import type { AdapterLookupResult, ClassificationOutcome } from '../application/pipelineTypes'
import type { NormalizedMetadataDTO, SourceRole, AdapterSource } from '../types/contracts'
import { normalizeInput } from './inputNormalizer'
import { resolveEntryResolutionStatus } from './identifierResolver'
import { parseLocalStructureInput } from './localStructureInputParser'
import { mergeMetadataFromAdapters } from './mergeStrategy'
import { runClassification } from './classificationEngine'
import { buildEvidenceAndWarnings } from './evidenceWarningBuilder'
import { selectNextLinksForSuccess } from './nextLinkSelector'
import { LINK_TEMPLATES } from './contractConstants'

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

function localInput() {
  return {
    kind: 'file',
    file: fileLike('local.pdb', 'HEADER TEST'),
    formatHint: 'local_pdb',
  } as const
}

function fileLike(name: string, text: string): File {
  return {
    name,
    text: () => Promise.resolve(text),
  } as File
}

function unavailableOutcome(
  source: AdapterSource,
  role: SourceRole,
  safeForwardLinksAvailable?: boolean,
): AdapterLookupResult {
  return {
    source,
    role,
    state: 'unavailable',
    payload: null,
    detail: `${source} unavailable`,
    safe_forward_links_available: safeForwardLinksAvailable,
  }
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

function hrefFromTemplate(template: string, id: string): string {
  return template
    .replaceAll('{id}', id)
    .replaceAll('{id_upper}', id.toUpperCase())
    .replaceAll('{id_lower}', id.toLowerCase())
}

describe('input and branch contracts', () => {
  it('canonicalizes 4-character PDB IDs', () => {
    const normalized = normalizeInput(' 1crn ', null)

    expect(normalized.kind).toBe('identifier')
    if (normalized.kind === 'identifier') {
      expect(normalized.inputType).toBe('pdb_id')
      expect(normalized.canonicalIdentifier).toBe('1CRN')
    }
  })

  it('canonicalizes extended PDB IDs and accepts mixed-case prefix/input', () => {
    const normalized = normalizeInput(' PDB_00001ABC ', null)

    expect(normalized.kind).toBe('identifier')
    if (normalized.kind === 'identifier') {
      expect(normalized.inputType).toBe('extended_pdb_id')
      expect(normalized.canonicalIdentifier).toBe('pdb_00001abc')
    }
  })

  it('keeps invalid identifiers separate from unresolved identifiers', () => {
    const invalid = normalizeInput('abc', null)
    const unresolved = resolveEntryResolutionStatus([
      unavailableOutcome('RCSB', 'primary'),
      unavailableOutcome('PDBe', 'secondary'),
    ])

    expect(invalid.kind).toBe('error')
    if (invalid.kind === 'error') {
      expect(invalid.errorCode).toBe('invalid_identifier')
    }
    expect(unresolved).toBe('unresolved')
  })

  it('returns parse_failed for local content that is neither PDB nor mmCIF', async () => {
    const parsed = await parseLocalStructureInput(fileLike('note.txt', 'not a structure'), null)

    expect(parsed.kind).toBe('error')
    if (parsed.kind === 'error') {
      expect(parsed.errorCode).toBe('parse_failed')
    }
  })
})

describe('classification and merge contracts', () => {
  it('keeps AlphaFoldDB single strong provenance as AlphaFoldDB', () => {
    const result = runClassification(
      localInput(),
      baseMetadata({ provenance_markers: ['explicit_alphafolddb_provenance'] }),
      [],
    )

    expect(result.kind).toBe('success')
    if (result.kind === 'success') {
      expect(result.outcome.sourceDatabase).toBe('AlphaFoldDB')
    }
  })

  it('keeps ModelArchive single strong provenance as ModelArchive', () => {
    const result = runClassification(
      localInput(),
      baseMetadata({ provenance_markers: ['explicit_modelarchive_provenance'] }),
      [],
    )

    expect(result.kind).toBe('success')
    if (result.kind === 'success') {
      expect(result.outcome.sourceDatabase).toBe('ModelArchive')
    }
  })

  it('falls back to unknown when AlphaFoldDB and ModelArchive strong provenance conflict', () => {
    const result = runClassification(
      localInput(),
      baseMetadata({
        provenance_markers: [
          'explicit_alphafolddb_provenance',
          'explicit_modelarchive_provenance',
        ],
      }),
      [],
    )

    expect(result.kind).toBe('success')
    if (result.kind === 'success') {
      expect(result.outcome.sourceDatabase).toBe('unknown')
      expect(result.outcome.unknownReasonCode).toBe('conflicting_evidence')
      expect(result.outcome.confidenceLevel).toBe('low')
    }
  })

  it('records strong provenance conflicts in merge metadata', () => {
    const merged = mergeMetadataFromAdapters('pdb_id', '9XYZ', [
      {
        source: 'RCSB',
        role: 'primary',
        state: 'found',
        detail: 'primary',
        payload: {
          resolved_format_hint: 'pdb',
          archive_exists: true,
          experiment_method: null,
          record_type_markers: [],
          provenance_markers: ['explicit_alphafolddb_provenance'],
          model_count: null,
          chain_count: null,
          ligand_detected: null,
          water_detected: null,
          legacy_compatibility_hints: [],
        },
      },
      {
        source: 'PDBe',
        role: 'secondary',
        state: 'found',
        detail: 'secondary',
        payload: {
          resolved_format_hint: 'pdb',
          archive_exists: true,
          experiment_method: null,
          record_type_markers: [],
          provenance_markers: ['explicit_modelarchive_provenance'],
          model_count: null,
          chain_count: null,
          ligand_detected: null,
          water_detected: null,
          legacy_compatibility_hints: [],
        },
      },
    ])

    expect(merged.source_conflicts).toContain('provenance_conflict_alphafolddb_vs_modelarchive')
  })

  it('does not depend on a hard-coded identifier for external_metadata_unavailable', () => {
    const result = runClassification(
      {
        kind: 'identifier',
        inputType: 'pdb_id',
        rawText: '9ZZZ',
        canonicalIdentifier: '9ZZZ',
      },
      baseMetadata({
        input_type: 'pdb_id',
        resolved_identifier: '9ZZZ',
        entry_resolution_status: 'unresolved',
        resolved_format_hint: 'pdb',
      }),
      [
        unavailableOutcome('RCSB', 'primary', false),
        unavailableOutcome('PDBe', 'secondary', false),
        unavailableOutcome('PDBj', 'tertiary', false),
      ],
    )

    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errorCode).toBe('external_metadata_unavailable')
    }
  })
})

describe('next link and warning contracts', () => {
  it('does not fall back to remote canonical links for local no-ID input', () => {
    const next = selectNextLinksForSuccess(outcome({ resolvedIdentifier: null }))

    expect(next.code).toBe('open_molmil_local_guide')
    expect(next.links.length).toBeGreaterThan(0)
    expect(next.links.some((link) => link.destination_type === 'viewer_local_guide')).toBe(true)
    expect(next.links.every((link) => link.destination_type !== 'canonical_entry')).toBe(true)
    expect(next.links.every((link) => link.destination_type !== 'viewer_remote')).toBe(true)
    expect(next.links.every((link) => link.destination_type !== 'search_entry')).toBe(true)
  })

  it('generates hrefs from the allowlist templates', () => {
    const next = selectNextLinksForSuccess(
      outcome({
        resolvedIdentifier: '1CRN',
        entryResolutionStatus: 'verified',
        recordType: 'experimental_structure',
        sourceDatabase: 'PDB',
        confidenceLevel: 'high',
      }),
    )
    const allowedHrefs = Object.values(LINK_TEMPLATES).map((item) => hrefFromTemplate(item.template, '1CRN'))

    expect(next.links.length).toBeGreaterThan(0)
    next.links.forEach((link) => {
      expect(allowedHrefs).toContain(link.href)
    })
  })

  it('keeps warning priority order fixed in the builder', () => {
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
})
