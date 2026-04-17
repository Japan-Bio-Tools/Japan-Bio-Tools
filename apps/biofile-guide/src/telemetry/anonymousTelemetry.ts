import type { DestinationType } from '../types/contracts'

export const TELEMETRY_OPT_IN_STORAGE_KEY = 'biofile_guide.telemetry.opt_in'

const TELEMETRY_ENDPOINT = (import.meta.env.VITE_BIOFILE_GUIDE_ANONYMOUS_TELEMETRY_ENDPOINT ?? '').trim()

export const TELEMETRY_EVENT_CODES = [
  'result_rendered',
  'result_unknown_rendered',
  'click_recommended_next_step',
  'click_link_rcsb',
  'click_link_pdbe',
  'click_link_pdbj',
  'click_link_molstar',
  'click_link_icn3d',
  'click_link_molmil',
  'error_parse_failed',
  'error_invalid_identifier',
] as const

export type AnonymousTelemetryEventCode = (typeof TELEMETRY_EVENT_CODES)[number]

export type AnonymousTelemetryEventCategory = 'result' | 'next_action' | 'link' | 'error'

export interface AnonymousTelemetryPayload {
  event_code: AnonymousTelemetryEventCode
  event_category: AnonymousTelemetryEventCategory
}

export type TelemetryLinkInput = {
  destination_type: DestinationType
  href: string
}

type LinkTelemetryEventCode = Extract<AnonymousTelemetryEventCode, `click_link_${string}`>

type TelemetryEventCategoryMap = Record<AnonymousTelemetryEventCode, AnonymousTelemetryEventCategory>

const TELEMETRY_EVENT_CATEGORY_MAP: TelemetryEventCategoryMap = {
  result_rendered: 'result',
  result_unknown_rendered: 'result',
  click_recommended_next_step: 'next_action',
  click_link_rcsb: 'link',
  click_link_pdbe: 'link',
  click_link_pdbj: 'link',
  click_link_molstar: 'link',
  click_link_icn3d: 'link',
  click_link_molmil: 'link',
  error_parse_failed: 'error',
  error_invalid_identifier: 'error',
}

export type AnonymousTelemetryTransport = (
  endpoint: string,
  payload: AnonymousTelemetryPayload,
) => Promise<void>

export type AnonymousTelemetryDispatchOptions = {
  endpoint?: string | null
  optIn?: boolean
  storage?: Pick<Storage, 'getItem'> | null
  transport?: AnonymousTelemetryTransport
}

function resolveLocalStorage(): Pick<Storage, 'getItem'> | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function resolveEndpoint(endpointOverride?: string | null): string | null {
  const endpoint = (endpointOverride ?? TELEMETRY_ENDPOINT).trim()
  return endpoint.length > 0 ? endpoint : null
}

function buildAnonymousTelemetryPayload(eventCode: AnonymousTelemetryEventCode): AnonymousTelemetryPayload {
  return {
    event_code: eventCode,
    event_category: TELEMETRY_EVENT_CATEGORY_MAP[eventCode],
  }
}

async function defaultAnonymousTelemetryTransport(
  endpoint: string,
  payload: AnonymousTelemetryPayload,
): Promise<void> {
  const body = JSON.stringify(payload)
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const accepted = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
    if (accepted) {
      return
    }
  }

  if (typeof fetch !== 'function') {
    return
  }

  await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  })
}

function parseLinkUrl(href: string): URL | null {
  try {
    if (typeof window === 'undefined') {
      return new URL(href, 'https://local.invalid')
    }
    return new URL(href, window.location.origin)
  } catch {
    return null
  }
}

export function isAnonymousTelemetryOptedIn(
  storage: Pick<Storage, 'getItem'> | null = resolveLocalStorage(),
): boolean {
  if (storage === null) {
    return false
  }
  return storage.getItem(TELEMETRY_OPT_IN_STORAGE_KEY) === 'true'
}

export async function emitAnonymousTelemetryEvent(
  eventCode: AnonymousTelemetryEventCode,
  options: AnonymousTelemetryDispatchOptions = {},
): Promise<void> {
  const optIn = options.optIn ?? isAnonymousTelemetryOptedIn(options.storage ?? resolveLocalStorage())
  const endpoint = resolveEndpoint(options.endpoint)
  if (!optIn || endpoint === null) {
    return
  }

  const payload = buildAnonymousTelemetryPayload(eventCode)
  const transport = options.transport ?? defaultAnonymousTelemetryTransport

  try {
    await transport(endpoint, payload)
  } catch {
    // テレメトリ失敗は本体処理へ影響させない
  }
}

export function mapLinkTelemetryEventCode(link: TelemetryLinkInput): LinkTelemetryEventCode | null {
  if (link.destination_type === 'internal_guide' || link.destination_type === 'guide_article') {
    return null
  }

  const parsed = parseLinkUrl(link.href)
  if (parsed === null) {
    return null
  }

  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname.toLowerCase()

  if (host.endsWith('molstar.org')) {
    return 'click_link_molstar'
  }
  if (host.endsWith('ncbi.nlm.nih.gov') && path.includes('/structure/icn3d/')) {
    return 'click_link_icn3d'
  }
  if (host.endsWith('pdbj.org') && path.includes('/help/molmil')) {
    return 'click_link_molmil'
  }
  if (host.endsWith('rcsb.org')) {
    return 'click_link_rcsb'
  }
  if (host.endsWith('ebi.ac.uk') && path.includes('/pdbe/')) {
    return 'click_link_pdbe'
  }
  if (host.endsWith('pdbj.org')) {
    return 'click_link_pdbj'
  }
  return null
}
