import { render, screen, within } from '@testing-library/react'
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

    expect((await screen.findAllByText('experimental_structure')).length).toBeGreaterThan(0)
    expect(screen.getByText('1. これは何の構造か')).toBeInTheDocument()
    expect(screen.getByText('2. まず気をつけること')).toBeInTheDocument()
    expect(screen.getByText('3. 次にどこを見るか')).toBeInTheDocument()
    expect(screen.getByText('実験で決定された構造')).toBeInTheDocument()
    expect(screen.getByText('おすすめの最初の行動')).toBeInTheDocument()
    expect(screen.getByText(/存在確認済みを意味しません/)).toBeInTheDocument()
    expect(screen.getAllByText('外部サイト').length).toBeGreaterThan(0)

    const card1 = screen.getByRole('heading', { name: '1. これは何の構造か' }).closest('.card')
    expect(card1).not.toBeNull()

    const card1PrimaryList = (card1 as HTMLElement).querySelector('.detailListPrimary')
    expect(card1PrimaryList).not.toBeNull()
    expect(within(card1PrimaryList as HTMLElement).queryByText('experimental_structure')).not.toBeInTheDocument()

    const card1TechnicalDetails = within(card1 as HTMLElement)
      .getByText('技術情報（raw contract）')
      .closest('details')
    expect(card1TechnicalDetails).not.toBeNull()
    expect(within(card1TechnicalDetails as HTMLElement).getByText('record_type')).toBeInTheDocument()
    expect(within(card1TechnicalDetails as HTMLElement).getByText('experimental_structure')).toBeInTheDocument()

    const rcsbLink = screen.getByRole('link', { name: 'RCSB エントリ' })
    const rcsbLinkRow = rcsbLink.closest('.linkLabelRow')
    expect(rcsbLinkRow).not.toBeNull()
    expect(within(rcsbLinkRow as HTMLElement).getByText('外部サイト')).toBeInTheDocument()
  })

  it('renders error details with a next action and at least one guide link', async () => {
    await runSample('不正入力の例')

    expect(await screen.findByText('invalid_identifier')).toBeInTheDocument()
    expect(screen.getByText('2. 次の一手')).toBeInTheDocument()
    expect(screen.getByText('check_format_and_retry')).toBeInTheDocument()
    expect(screen.getByText('RCSB 検索入口')).toBeInTheDocument()
    expect(screen.getByText('フォーマットガイド')).toBeInTheDocument()
    expect(screen.getAllByText('外部サイト').length).toBeGreaterThan(0)

    const searchLink = screen.getByRole('link', { name: 'RCSB 検索入口' })
    const searchLinkRow = searchLink.closest('.linkLabelRow')
    expect(searchLinkRow).not.toBeNull()
    expect(within(searchLinkRow as HTMLElement).getByText('外部サイト')).toBeInTheDocument()

    const guideLink = screen.getByRole('link', { name: 'フォーマットガイド' })
    const guideLinkRow = guideLink.closest('.linkLabelRow')
    expect(guideLinkRow).not.toBeNull()
    expect(within(guideLinkRow as HTMLElement).queryByText('外部サイト')).not.toBeInTheDocument()
  })
})
