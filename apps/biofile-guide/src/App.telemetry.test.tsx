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
import { TELEMETRY_OPT_IN_STORAGE_KEY, isAnonymousTelemetryOptedIn } from './telemetry/anonymousTelemetry'

function emittedEventCodes(): string[] {
  return emitAnonymousTelemetryEventMock.mock.calls.map((call) => String(call[0]))
}

describe('App anonymous telemetry integration', () => {
  beforeEach(() => {
    emitAnonymousTelemetryEventMock.mockReset()
    emitAnonymousTelemetryEventMock.mockResolvedValue(undefined)
    window.localStorage.clear()
  })

  it('shows telemetry opt-in as OFF when no explicit storage value exists', () => {
    render(<App />)

    const optInSwitch = screen.getByRole('switch', { name: '匿名の利用計測' })
    expect(optInSwitch).not.toBeChecked()
    expect(screen.getByText('OFF')).toBeInTheDocument()
  })

  it('stores telemetry opt-in changes with the existing storage key', async () => {
    const user = userEvent.setup()
    render(<App />)

    const optInSwitch = screen.getByRole('switch', { name: '匿名の利用計測' })
    await user.click(optInSwitch)

    expect(window.localStorage.getItem(TELEMETRY_OPT_IN_STORAGE_KEY)).toBe('true')
    expect(optInSwitch).toBeChecked()
    expect(screen.getByText('ON')).toBeInTheDocument()

    await user.click(optInSwitch)

    expect(window.localStorage.getItem(TELEMETRY_OPT_IN_STORAGE_KEY)).toBe('false')
    expect(optInSwitch).not.toBeChecked()
    expect(screen.getByText('OFF')).toBeInTheDocument()
    expect(emitAnonymousTelemetryEventMock).not.toHaveBeenCalled()
  })

  it('reflects stored telemetry opt-in state on initial render', () => {
    window.localStorage.setItem(TELEMETRY_OPT_IN_STORAGE_KEY, 'true')

    render(<App />)

    const optInSwitch = screen.getByRole('switch', { name: '匿名の利用計測' })
    expect(optInSwitch).toBeChecked()
    expect(screen.getByText('ON')).toBeInTheDocument()
  })

  it('keeps UI and telemetry opt-in state consistent when opt-out write falls back', async () => {
    window.localStorage.setItem(TELEMETRY_OPT_IN_STORAGE_KEY, 'true')
    const originalSetItem = Storage.prototype.setItem
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === TELEMETRY_OPT_IN_STORAGE_KEY && value === 'false') {
        throw new Error('write failed')
      }
      return originalSetItem.call(this, key, value)
    })

    try {
      const user = userEvent.setup()
      render(<App />)

      const optInSwitch = screen.getByRole('switch', { name: '匿名の利用計測' })
      expect(optInSwitch).toBeChecked()

      await user.click(optInSwitch)

      expect(window.localStorage.getItem(TELEMETRY_OPT_IN_STORAGE_KEY)).toBeNull()
      expect(isAnonymousTelemetryOptedIn(window.localStorage)).toBe(false)
      expect(optInSwitch).not.toBeChecked()
      expect(screen.getByText('OFF')).toBeInTheDocument()
    } finally {
      setItemSpy.mockRestore()
    }
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
