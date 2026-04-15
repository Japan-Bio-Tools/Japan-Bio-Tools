import type { AdapterLookupResult } from '../../application/pipelineTypes'
import { SCHEMA_VERSION, type AdapterSource, type SourceRole } from '../../types/contracts'

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type RetryPolicyOptions = {
  timeoutMs: number
  maxRetries?: number
  retryDelayMs?: number
}

export type SessionCachePolicyOptions = {
  cacheTtlMs?: number
  cacheFound?: boolean
  cacheNotFound?: boolean
  cacheUnavailable?: boolean
}

type RetryOutcome =
  | {
      kind: 'response'
      response: Response
    }
  | {
      kind: 'timeout'
    }
  | {
      kind: 'network_error'
    }

type CacheEntry = {
  expiresAt: number
  value: AdapterLookupResult
}

const DEFAULT_MAX_RETRIES = 1
const DEFAULT_RETRY_DELAY_MS = 0
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000
const SESSION_LOOKUP_CACHE = new Map<string, CacheEntry>()

function normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return value < 0 ? 0 : Math.floor(value)
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  const normalized = normalizeNonNegativeInt(value, fallback)
  return normalized === 0 ? fallback : normalized
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'name' in error && error.name === 'AbortError'
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return
  }
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchWithTimeout(
  fetchFn: FetchFn,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<RetryOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchFn(input, {
      ...init,
      signal: controller.signal,
    })
    return {
      kind: 'response',
      response,
    }
  } catch (error) {
    return isAbortError(error) ? { kind: 'timeout' } : { kind: 'network_error' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchWithRetryPolicy(
  fetchFn: FetchFn,
  input: RequestInfo | URL,
  init: RequestInit,
  policy: RetryPolicyOptions,
): Promise<RetryOutcome> {
  const timeoutMs = normalizePositiveInt(policy.timeoutMs, 1)
  const maxRetries = normalizeNonNegativeInt(policy.maxRetries, DEFAULT_MAX_RETRIES)
  const retryDelayMs = normalizeNonNegativeInt(policy.retryDelayMs, DEFAULT_RETRY_DELAY_MS)
  const maxAttempts = maxRetries + 1

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const outcome = await fetchWithTimeout(fetchFn, input, init, timeoutMs)
    const hasNextAttempt = attempt < maxAttempts - 1

    if (!hasNextAttempt) {
      return outcome
    }

    if (outcome.kind === 'network_error' || outcome.kind === 'timeout') {
      await sleep(retryDelayMs)
      continue
    }

    if (outcome.kind === 'response' && outcome.response.status >= 500) {
      await sleep(retryDelayMs)
      continue
    }

    return outcome
  }

  return {
    kind: 'network_error',
  }
}

export function buildSessionCacheKey(
  source: AdapterSource,
  role: SourceRole,
  endpointBase: string,
  canonicalIdentifier: string,
): string {
  return `${source}:${role}:${SCHEMA_VERSION}:${endpointBase}:${canonicalIdentifier}`
}

export function readFromSessionCache(key: string): AdapterLookupResult | null {
  const cached = SESSION_LOOKUP_CACHE.get(key)
  if (!cached) {
    return null
  }

  if (cached.expiresAt < Date.now()) {
    SESSION_LOOKUP_CACHE.delete(key)
    return null
  }

  return cached.value
}

function isCacheableState(
  state: AdapterLookupResult['state'],
  options: SessionCachePolicyOptions,
): boolean {
  const cacheFound = options.cacheFound ?? true
  const cacheNotFound = options.cacheNotFound ?? true
  const cacheUnavailable = options.cacheUnavailable ?? false

  if (state === 'found') {
    return cacheFound
  }
  if (state === 'not_found') {
    return cacheNotFound
  }
  return cacheUnavailable
}

export function writeToSessionCache(
  key: string,
  result: AdapterLookupResult,
  options: SessionCachePolicyOptions = {},
): void {
  if (!isCacheableState(result.state, options)) {
    return
  }

  const ttl = normalizePositiveInt(options.cacheTtlMs, DEFAULT_CACHE_TTL_MS)
  SESSION_LOOKUP_CACHE.set(key, {
    expiresAt: Date.now() + ttl,
    value: result,
  })
}

export function clearAdapterSessionLookupCache(): void {
  SESSION_LOOKUP_CACHE.clear()
}
