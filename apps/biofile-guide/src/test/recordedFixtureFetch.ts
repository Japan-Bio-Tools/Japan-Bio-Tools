import { vi } from 'vitest'
import type { RecordedCapture } from '../mocks/recordedMetadataFixtures'

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

export function fetchFromRecordedCapture(capture: RecordedCapture): FetchFn {
  if (capture.kind === 'http_json') {
    return vi.fn(async () => jsonResponse(capture.body, capture.status))
  }

  if (capture.kind === 'http_status') {
    return vi.fn(async () => new Response('', { status: capture.status }))
  }

  if (capture.kind === 'network_error') {
    return vi.fn(async () => {
      throw new Error(capture.message)
    })
  }

  return vi.fn(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      }),
  )
}
