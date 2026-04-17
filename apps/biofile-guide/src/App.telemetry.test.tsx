import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { emitAnonymousTelemetryEventMock } = vi.hoisted(() => ({
  emitAnonymousTelemetryEventMock: vi.fn(async () => undefined),
}))

vi.mock('./telemetry/anonymousTelemetry', async () => {
  const actual = await vi.importActual<typeof import('./telemetry/anonymousTelemetry')>('./telemetry/anonymousTelemetry')
  return {
    ...actual,
    emitAnonymousTelemetryEvent: emitAnonymousTelemetryEventMock,
  }
})

import App from './App'

function emittedEventCodes(): string[] {
  return emitAnonymousTelemetryEventMock.mock.calls.map((call) => String(call[0]))
}

describe('App anonymous telemetry integration', () => {
  beforeEach(() => {
    emitAnonymousTelemetryEventMock.mockReset()
    emitAnonymousTelemetryEventMock.mockResolvedValue(undefined)
  })

  it('separates unknown render telemetry from error telemetry', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '拡張IDの例' }))
    await user.click(screen.getByRole('button', { name: '判定を実行' }))

    expect(await screen.findByText('unknown は失敗ではありません。')).toBeInTheDocument()
    const emitted = emittedEventCodes()
    expect(emitted).toContain('result_unknown_rendered')
    expect(emitted).not.toContain('error_parse_failed')
    expect(emitted).not.toContain('error_invalid_identifier')
  })

  it('emits link and recommended-next-step click events from Card3 links', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '実験構造の例' }))
    await user.click(screen.getByRole('button', { name: '判定を実行' }))

    await screen.findByText('3. 次にどこを見るか')
    await user.click(screen.getByRole('link', { name: 'RCSB エントリ' }))
    await user.click(screen.getByRole('link', { name: 'Mol* Viewer' }))

    const emitted = emittedEventCodes()
    expect(emitted).toContain('click_recommended_next_step')
    expect(emitted).toContain('click_link_rcsb')
    expect(emitted).toContain('click_link_molstar')
  })

  it('keeps UI flow alive even when telemetry emission fails', async () => {
    emitAnonymousTelemetryEventMock.mockRejectedValue(new Error('telemetry down'))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '不正入力の例' }))
    await user.click(screen.getByRole('button', { name: '判定を実行' }))

    expect(await screen.findByText('invalid_identifier')).toBeInTheDocument()
    expect(emittedEventCodes()).toContain('error_invalid_identifier')
  })
})
