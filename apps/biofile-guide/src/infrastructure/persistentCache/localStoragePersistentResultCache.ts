import type { MetadataAdapterMode } from '../../application/metadataAdapterFactory'
import type { NormalizedInput } from '../../application/pipelineTypes'
import { SCHEMA_VERSION, type BioFileEnvelope, type InputType } from '../../types/contracts'

const PERSISTENT_CACHE_NAMESPACE = 'biofile-guide'
const PERSISTENT_CACHE_SCOPE = 'identifier_result'
export const PERSISTENT_CACHE_VERSION = 1 as const
export const PERSISTENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type IdentifierInputType = Extract<InputType, 'pdb_id' | 'extended_pdb_id'>

export interface IdentifierPersistentCacheTarget {
  adapterMode: MetadataAdapterMode
  inputType: IdentifierInputType
  canonicalIdentifier: string
}

export type PersistentCacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type PersistentCacheReadOptions = {
  storage?: PersistentCacheStorage | null
  nowMs?: number
}

type PersistentCacheWriteOptions = {
  storage?: PersistentCacheStorage | null
  nowMs?: number
}

interface IdentifierPersistentCacheRecord {
  namespace: typeof PERSISTENT_CACHE_NAMESPACE
  scope: typeof PERSISTENT_CACHE_SCOPE
  cacheVersion: typeof PERSISTENT_CACHE_VERSION
  schemaVersion: typeof SCHEMA_VERSION
  adapterMode: MetadataAdapterMode
  inputType: IdentifierInputType
  canonicalIdentifier: string
  createdAtMs: number
  expiresAtMs: number
  envelope: BioFileEnvelope
}

function resolveStorage(storageOverride: PersistentCacheStorage | null | undefined): PersistentCacheStorage | null {
  if (storageOverride !== undefined) {
    return storageOverride
  }

  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasArrayField(record: Record<string, unknown>, key: string): boolean {
  return Array.isArray(record[key])
}

function hasStringField(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'string'
}

function isConfidenceForCache(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return hasStringField(value, 'scope') && hasStringField(value, 'level')
}

function isSuccessResultForCache(record: unknown): boolean {
  if (!isRecord(record)) {
    return false
  }

  return (
    hasArrayField(record, 'beginner_warning') &&
    hasArrayField(record, 'next_links') &&
    hasArrayField(record, 'warning_codes') &&
    hasArrayField(record, 'evidence') &&
    hasStringField(record, 'recommended_next_step_code') &&
    hasStringField(record, 'recommended_next_step') &&
    isConfidenceForCache(record.confidence)
  )
}

function isErrorResultForCache(record: unknown): boolean {
  if (!isRecord(record)) {
    return false
  }

  return (
    hasStringField(record, 'error_code') &&
    hasStringField(record, 'message') &&
    hasStringField(record, 'reason') &&
    hasArrayField(record, 'next_links') &&
    hasArrayField(record, 'confirmed_facts') &&
    hasStringField(record, 'recommended_next_step_code') &&
    hasStringField(record, 'recommended_next_step')
  )
}

function isEnvelope(value: unknown): value is BioFileEnvelope {
  if (!isRecord(value) || value.schema_version !== SCHEMA_VERSION) {
    return false
  }

  if (value.status === 'success') {
    return isSuccessResultForCache(value.result)
  }

  if (value.status === 'error') {
    return isErrorResultForCache(value.error)
  }

  return false
}

function readRecord(
  rawValue: string,
  target: IdentifierPersistentCacheTarget,
  nowMs: number,
): BioFileEnvelope | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    return null
  }

  if (!isRecord(parsed)) {
    return null
  }

  if (parsed.namespace !== PERSISTENT_CACHE_NAMESPACE || parsed.scope !== PERSISTENT_CACHE_SCOPE) {
    return null
  }

  if (parsed.cacheVersion !== PERSISTENT_CACHE_VERSION || parsed.schemaVersion !== SCHEMA_VERSION) {
    return null
  }

  if (
    parsed.adapterMode !== target.adapterMode ||
    parsed.inputType !== target.inputType ||
    parsed.canonicalIdentifier !== target.canonicalIdentifier
  ) {
    return null
  }

  if (typeof parsed.expiresAtMs !== 'number' || parsed.expiresAtMs <= nowMs) {
    return null
  }

  if (!isEnvelope(parsed.envelope)) {
    return null
  }

  return parsed.envelope
}

function removeStorageItemSafely(storage: PersistentCacheStorage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // localStorage unavailable or blocked
  }
}

export function createIdentifierPersistentCacheTarget(
  normalizedInput: NormalizedInput,
  adapterMode: MetadataAdapterMode,
): IdentifierPersistentCacheTarget | null {
  if (normalizedInput.kind !== 'identifier') {
    return null
  }

  return {
    adapterMode,
    inputType: normalizedInput.inputType,
    canonicalIdentifier: normalizedInput.canonicalIdentifier,
  }
}

export function buildIdentifierPersistentCacheKey(target: IdentifierPersistentCacheTarget): string {
  const encodedIdentifier = encodeURIComponent(target.canonicalIdentifier)
  return [
    PERSISTENT_CACHE_NAMESPACE,
    PERSISTENT_CACHE_SCOPE,
    `cache_v${PERSISTENT_CACHE_VERSION}`,
    `schema_${SCHEMA_VERSION}`,
    `mode_${target.adapterMode}`,
    `input_${target.inputType}`,
    `id_${encodedIdentifier}`,
  ].join(':')
}

export function readIdentifierPersistentCache(
  target: IdentifierPersistentCacheTarget,
  options: PersistentCacheReadOptions = {},
): BioFileEnvelope | null {
  const storage = resolveStorage(options.storage)
  if (storage === null) {
    return null
  }

  const key = buildIdentifierPersistentCacheKey(target)
  let rawValue: string | null
  try {
    rawValue = storage.getItem(key)
  } catch {
    return null
  }

  if (rawValue === null) {
    return null
  }

  const envelope = readRecord(rawValue, target, options.nowMs ?? Date.now())
  if (envelope !== null) {
    return envelope
  }

  removeStorageItemSafely(storage, key)
  return null
}

export function writeIdentifierPersistentCache(
  target: IdentifierPersistentCacheTarget,
  envelope: BioFileEnvelope,
  options: PersistentCacheWriteOptions = {},
): void {
  const storage = resolveStorage(options.storage)
  if (storage === null) {
    return
  }

  const nowMs = options.nowMs ?? Date.now()
  const record: IdentifierPersistentCacheRecord = {
    namespace: PERSISTENT_CACHE_NAMESPACE,
    scope: PERSISTENT_CACHE_SCOPE,
    cacheVersion: PERSISTENT_CACHE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    adapterMode: target.adapterMode,
    inputType: target.inputType,
    canonicalIdentifier: target.canonicalIdentifier,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + PERSISTENT_CACHE_TTL_MS,
    envelope,
  }

  try {
    storage.setItem(buildIdentifierPersistentCacheKey(target), JSON.stringify(record))
  } catch {
    // localStorage unavailable, blocked, or quota exceeded
  }
}

export function shouldPersistIdentifierEnvelope(envelope: BioFileEnvelope): boolean {
  if (envelope.status === 'success') {
    return envelope.result.input_type === 'pdb_id' || envelope.result.input_type === 'extended_pdb_id'
  }

  return envelope.error.error_code === 'entry_not_found'
}
