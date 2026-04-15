import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

async function runSample(label: string): Promise<void> {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: label }))
  await user.click(screen.getByRole('button', { name: '判定を実行' }))
}

describe('App contract rendering', () => {
  it('renders the success contract as three cards with identifier caution and external labels', async () => {
    await runSample('実験構造の例')

    expect(await screen.findByText('experimental_structure')).toBeInTheDocument()
    expect(screen.getByText('カード1: この入力は何者か')).toBeInTheDocument()
    expect(screen.getByText('カード2: 最初に気をつけること')).toBeInTheDocument()
    expect(screen.getByText('カード3: 次に開く場所')).toBeInTheDocument()
    expect(screen.getByText(/存在確認済みを意味しません/)).toBeInTheDocument()
    expect(screen.getAllByText('外部サイト').length).toBeGreaterThan(0)
  })

  it('renders error details with a next action and at least one guide link', async () => {
    await runSample('不正入力の例')

    expect(await screen.findByText('invalid_identifier')).toBeInTheDocument()
    expect(screen.getByText('check_format_and_retry')).toBeInTheDocument()
    expect(screen.getByText('RCSB 検索入口')).toBeInTheDocument()
    expect(screen.getByText('フォーマットガイド')).toBeInTheDocument()
    expect(screen.getAllByText('外部サイト').length).toBeGreaterThan(0)
  })
})
