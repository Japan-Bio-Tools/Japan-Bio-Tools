import { describe, expect, it, vi } from 'vitest'
import { normalizeInput } from '../../domain/inputNormalizer'
import {
  buildIdentifierPersistentCacheKey,
  createIdentifierPersistentCacheTarget,
  PERSISTENT_CACHE_TTL_MS,
  PERSISTENT_CACHE_VERSION,
  readIdentifierPersistentCache,
  shouldPersistIdentifierEnvelope,
  writeIdentifierPersistentCache,
  type PersistentCacheStorage,
} from './localStoragePersistentResultCache'
import { SCHEMA_VERSION, type BioFileEnvelope } from '../../types/contracts'

function createMemoryStorage(initial: Record<string, string> = {}): {
  storage: PersistentCacheStorage
  values: Map<string, string>
  removeItem: ReturnType<typeof vi.fn>
} {
  const values = new Map<string, string>(Object.entries(initial))
  const removeItem = vi.fn((key: string) => {
    values.delete(key)
  })
  return {
    storage: {
      getItem: (key: string): string | null => values.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        values.set(key, value)
      },
      removeItem,
    },
    values,
    removeItem,
  }
}

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

function entryNotFoundEnvelope(): BioFileEnvelope {
  return {
    schema_version: SCHEMA_VERSION,
    status: 'error',
    error: {
      error_code: 'entry_not_found',
      message: '該当エントリが確認できませんでした。',
      reason: 'Primary/Secondary で not_found でした。',
      confirmed_facts: [],
      recommended_next_step_code: 'read_beginner_guide',
      recommended_next_step: '検索入口を確認してください。',
      next_links: [
        {
          label: 'RCSB 検索入口',
          reason: '再確認',
          destination_type: 'search_entry',
          href: 'https://www.rcsb.org/search',
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
      message: '外部メタデータを確認できません。',
      reason: '一時的に利用不可です。',
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

describe('localStoragePersistentResultCache', () => {
  it('builds a key that separates namespace, version, schema, adapter mode and normalized identifier', () => {
    const key = buildIdentifierPersistentCacheKey({
      adapterMode: 'real_pdbe',
      inputType: 'extended_pdb_id',
      canonicalIdentifier: 'pdb_00001abc',
    })

    expect(key).toContain('biofile-guide')
    expect(key).toContain(`cache_v${PERSISTENT_CACHE_VERSION}`)
    expect(key).toContain(`schema_${SCHEMA_VERSION}`)
    expect(key).toContain('mode_real_pdbe')
    expect(key).toContain('input_extended_pdb_id')
    expect(key).toContain('id_pdb_00001abc')
  })

  it('targets identifier input only and excludes local file input', () => {
    const identifierInput = normalizeInput('1CRN', null)
    expect(createIdentifierPersistentCacheTarget(identifierInput, 'mock')).toEqual({
      adapterMode: 'mock',
      inputType: 'pdb_id',
      canonicalIdentifier: '1CRN',
    })

    const fileInput = normalizeInput('', new File(['HEADER'], 'sample.pdb', { type: 'text/plain' }))
    expect(createIdentifierPersistentCacheTarget(fileInput, 'mock')).toBeNull()
  })

  it('returns miss for empty storage and returns hit after write', () => {
    const { storage } = createMemoryStorage()
    const target = {
      adapterMode: 'mock' as const,
      inputType: 'pdb_id' as const,
      canonicalIdentifier: '1CRN',
    }
    const envelope = identifierSuccessEnvelope('1CRN')

    expect(readIdentifierPersistentCache(target, { storage, nowMs: 1000 })).toBeNull()

    writeIdentifierPersistentCache(target, envelope, { storage, nowMs: 1000 })
    expect(readIdentifierPersistentCache(target, { storage, nowMs: 1001 })).toEqual(envelope)
  })

  it('treats expired entries as miss', () => {
    const { storage } = createMemoryStorage()
    const target = {
      adapterMode: 'mock' as const,
      inputType: 'pdb_id' as const,
      canonicalIdentifier: '1CRN',
    }
    const envelope = identifierSuccessEnvelope('1CRN')

    writeIdentifierPersistentCache(target, envelope, { storage, nowMs: 10_000 })
    expect(readIdentifierPersistentCache(target, { storage, nowMs: 10_000 + PERSISTENT_CACHE_TTL_MS + 1 })).toBeNull()
  })

  it('separates cache by adapter mode', () => {
    const { storage } = createMemoryStorage()
    const envelope = identifierSuccessEnvelope('1CRN')

    writeIdentifierPersistentCache(
      {
        adapterMode: 'mock',
        inputType: 'pdb_id',
        canonicalIdentifier: '1CRN',
      },
      envelope,
      { storage, nowMs: 0 },
    )

    expect(
      readIdentifierPersistentCache(
        {
          adapterMode: 'real_rcsb',
          inputType: 'pdb_id',
          canonicalIdentifier: '1CRN',
        },
        { storage, nowMs: 1 },
      ),
    ).toBeNull()
  })

  it('ignores malformed cache entry safely', () => {
    const target = {
      adapterMode: 'mock' as const,
      inputType: 'pdb_id' as const,
      canonicalIdentifier: '1CRN',
    }
    const key = buildIdentifierPersistentCacheKey(target)
    const { storage, removeItem } = createMemoryStorage({
      [key]: '{broken_json',
    })

    expect(readIdentifierPersistentCache(target, { storage, nowMs: 1 })).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(key)
  })

  it('treats parseable but broken envelope payload as miss and removes the entry', () => {
    const target = {
      adapterMode: 'mock' as const,
      inputType: 'pdb_id' as const,
      canonicalIdentifier: '1CRN',
    }
    const key = buildIdentifierPersistentCacheKey(target)
    const { storage, removeItem } = createMemoryStorage({
      [key]: JSON.stringify({
        namespace: 'biofile-guide',
        scope: 'identifier_result',
        cacheVersion: PERSISTENT_CACHE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        adapterMode: 'mock',
        inputType: 'pdb_id',
        canonicalIdentifier: '1CRN',
        createdAtMs: 1,
        expiresAtMs: 1000,
        envelope: {
          schema_version: SCHEMA_VERSION,
          status: 'success',
          result: {
            beginner_warning: 'broken-not-array',
            next_links: [],
            warning_codes: [],
            evidence: [],
            recommended_next_step_code: 123,
            recommended_next_step: 'RCSB を開きます。',
          },
        },
      }),
    })

    expect(readIdentifierPersistentCache(target, { storage, nowMs: 2 })).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(key)
  })

  it('treats parseable success envelope with broken confidence as miss and removes the entry', () => {
    const target = {
      adapterMode: 'mock' as const,
      inputType: 'pdb_id' as const,
      canonicalIdentifier: '1CRN',
    }
    const key = buildIdentifierPersistentCacheKey(target)
    const { storage, removeItem } = createMemoryStorage({
      [key]: JSON.stringify({
        namespace: 'biofile-guide',
        scope: 'identifier_result',
        cacheVersion: PERSISTENT_CACHE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        adapterMode: 'mock',
        inputType: 'pdb_id',
        canonicalIdentifier: '1CRN',
        createdAtMs: 1,
        expiresAtMs: 1000,
        envelope: {
          schema_version: SCHEMA_VERSION,
          status: 'success',
          result: {
            beginner_warning: [],
            next_links: [],
            warning_codes: [],
            evidence: [],
            recommended_next_step_code: 'open_rcsb_entry',
            recommended_next_step: 'RCSB を開きます。',
            confidence: {
              scope: 'primary_classification',
              level: 1,
            },
          },
        },
      }),
    })

    expect(readIdentifierPersistentCache(target, { storage, nowMs: 2 })).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(key)
  })

  it('ignores entry when stored scope/version payload does not match', () => {
    const target = {
      adapterMode: 'mock' as const,
      inputType: 'pdb_id' as const,
      canonicalIdentifier: '1CRN',
    }
    const key = buildIdentifierPersistentCacheKey(target)
    const { storage } = createMemoryStorage({
      [key]: JSON.stringify({
        namespace: 'biofile-guide',
        scope: 'different_scope',
        cacheVersion: PERSISTENT_CACHE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        adapterMode: 'mock',
        inputType: 'pdb_id',
        canonicalIdentifier: '1CRN',
        createdAtMs: 1,
        expiresAtMs: 1000,
        envelope: identifierSuccessEnvelope('1CRN'),
      }),
    })

    expect(readIdentifierPersistentCache(target, { storage, nowMs: 2 })).toBeNull()
  })

  it('persists only stable envelope types for identifier cache', () => {
    expect(shouldPersistIdentifierEnvelope(identifierSuccessEnvelope('1CRN'))).toBe(true)
    expect(shouldPersistIdentifierEnvelope(entryNotFoundEnvelope())).toBe(true)
    expect(shouldPersistIdentifierEnvelope(externalMetadataUnavailableEnvelope())).toBe(false)
  })
})
