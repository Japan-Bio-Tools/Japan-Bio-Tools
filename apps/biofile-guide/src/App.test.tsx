import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { runBioFileGuide } from './application/runBioFileGuide'
import App from './App'

async function runSample(label: string): Promise<void> {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: label }))
  await user.click(screen.getByRole('button', { name: '判定を実行' }))
}

function cardByHeading(name: string): HTMLElement {
  const card = screen.getByRole('heading', { name }).closest('.card')
  expect(card).not.toBeNull()
  return card as HTMLElement
}

function detailsBySummary(container: HTMLElement, summary: string): HTMLElement {
  const details = within(container).getByText(summary).closest('details')
  expect(details).not.toBeNull()
  return details as HTMLElement
}

describe('App contract rendering', () => {
  it('renders success with Card2 warning-priority main view and Card3 next-step main view', async () => {
    await runSample('実験構造の例')

    expect((await screen.findAllByText('experimental_structure')).length).toBeGreaterThan(0)
    expect(screen.getByText('1. これは何の構造か')).toBeInTheDocument()
    expect(screen.getByText('2. まず気をつけること')).toBeInTheDocument()
    expect(screen.getByText('3. 次にどこを見るか')).toBeInTheDocument()
    expect(screen.getByText('実験で決定された構造')).toBeInTheDocument()
    expect(screen.getByText('おすすめの最初の行動')).toBeInTheDocument()
    expect(screen.getByText(/存在確認済みを意味しません/)).toBeInTheDocument()
    expect(screen.getAllByText('外部サイト').length).toBeGreaterThan(0)

    const card1 = cardByHeading('1. これは何の構造か')

    const card1PrimaryList = card1.querySelector('.detailListPrimary')
    expect(card1PrimaryList).not.toBeNull()
    expect(within(card1PrimaryList as HTMLElement).queryByText('experimental_structure')).not.toBeInTheDocument()

    const card1TechnicalDetails = detailsBySummary(card1, '技術情報（raw contract）')
    expect(within(card1TechnicalDetails as HTMLElement).getByText('record_type')).toBeInTheDocument()
    expect(within(card1TechnicalDetails as HTMLElement).getByText('experimental_structure')).toBeInTheDocument()

    const card2 = cardByHeading('2. まず気をつけること')
    const warningPrimaryLabel = within(card2).getByText('最初に見てほしい注意（warning top3）')
    const warningPrimaryBlock = warningPrimaryLabel.closest('.warningPrimaryBlock')
    expect(warningPrimaryBlock).not.toBeNull()
    expect((warningPrimaryBlock as HTMLElement).querySelectorAll('li').length).toBeGreaterThan(0)

    const card2TechnicalDetails = detailsBySummary(card2, '技術情報（raw contract）')
    const warningCodesLabel = within(card2TechnicalDetails).getByText('warning_codes')
    const warningCodesValue = warningCodesLabel.closest('div')?.querySelector('code')?.textContent ?? ''
    expect(warningCodesValue.length).toBeGreaterThan(0)
    expect(within(card2).queryByText('warning_codes:')).not.toBeInTheDocument()

    const card3 = cardByHeading('3. 次にどこを見るか')
    expect(within(card3).getByText('おすすめの最初の行動')).toBeInTheDocument()
    expect(within(card3).getByText('今すぐ見る候補')).toBeInTheDocument()
    const card3TechnicalDetails = detailsBySummary(card3, '技術情報（raw contract）')
    const nextStepCodeLabel = within(card3TechnicalDetails).getByText('recommended_next_step_code:')
    expect(nextStepCodeLabel.closest('details')).toBe(card3TechnicalDetails)

    const rcsbLink = within(card3).getByRole('link', { name: 'RCSB エントリ' })
    const rcsbLinkRow = rcsbLink.closest('.linkLabelRow')
    expect(rcsbLinkRow).not.toBeNull()
    expect(within(rcsbLinkRow as HTMLElement).getByText('外部サイト')).toBeInTheDocument()
  })

  it('renders error with a primary next action and auxiliary technical code details', async () => {
    await runSample('不正入力の例')

    expect(await screen.findByText('invalid_identifier')).toBeInTheDocument()
    expect(screen.getByText('1. 何が起きたか')).toBeInTheDocument()
    expect(screen.getByText('2. 次の一手')).toBeInTheDocument()
    expect(screen.getByText('3. 確認できた事実')).toBeInTheDocument()
    expect(screen.getByText('おすすめの最初の行動')).toBeInTheDocument()
    expect(screen.getByText('今すぐ開く候補')).toBeInTheDocument()
    expect(screen.getByText('RCSB 検索入口')).toBeInTheDocument()
    expect(screen.getByText('フォーマットガイド')).toBeInTheDocument()
    expect(screen.getAllByText('外部サイト').length).toBeGreaterThan(0)

    const errorNextActionCard = cardByHeading('2. 次の一手')
    const errorTechnicalDetails = detailsBySummary(errorNextActionCard, '技術情報（raw contract）')
    const errorNextStepCodeLabel = within(errorTechnicalDetails).getByText('recommended_next_step_code:')
    expect(errorNextStepCodeLabel.closest('details')).toBe(errorTechnicalDetails)
    const errorNextStepCode = within(errorNextActionCard).getByText('check_format_and_retry')
    expect(errorNextStepCode.closest('details')).toBe(errorTechnicalDetails)

    const searchLink = within(errorNextActionCard).getByRole('link', { name: 'RCSB 検索入口' })
    const searchLinkRow = searchLink.closest('.linkLabelRow')
    expect(searchLinkRow).not.toBeNull()
    expect(within(searchLinkRow as HTMLElement).getByText('外部サイト')).toBeInTheDocument()

    const guideLink = within(errorNextActionCard).getByRole('link', { name: 'フォーマットガイド' })
    const guideLinkRow = guideLink.closest('.linkLabelRow')
    expect(guideLinkRow).not.toBeNull()
    expect(within(guideLinkRow as HTMLElement).queryByText('外部サイト')).not.toBeInTheDocument()
  })

  it('keeps Card2 warnings in top3 plus collapsible remainder when more than three warnings exist', async () => {
    const user = userEvent.setup()
    render(<App />)

    const localPdbWithManyWarnings = [
      'HEADER    LOCAL WARNING TEST',
      'MODEL        1',
      'ATOM      1  N   GLY A   1      11.104  13.207   2.100  1.00 20.00           N',
      'HETATM    2  C1  LIG A   2      12.000  14.000   3.000  1.00 20.00           C',
      'HETATM    3  O   HOH A   3      13.000  15.000   4.000  1.00 20.00           O',
      'ENDMDL',
      'MODEL        2',
      'ATOM      4  CA  GLY B   1      14.500  16.000   5.100  1.00 20.00           C',
      'ENDMDL',
      'END',
    ].join('\n')
    const file = new File([localPdbWithManyWarnings], 'many-warnings.pdb', { type: 'text/plain' })

    await user.upload(screen.getByLabelText('ローカルファイル'), file)
    await user.click(screen.getByRole('button', { name: '判定を実行' }))

    const card2 = cardByHeading('2. まず気をつけること')
    const warningPrimaryLabel = within(card2).getByText('最初に見てほしい注意（warning top3）')
    const warningPrimaryBlock = warningPrimaryLabel.closest('.warningPrimaryBlock')
    expect(warningPrimaryBlock).not.toBeNull()

    const primaryList = (warningPrimaryBlock as HTMLElement).querySelector('.warningPrimaryList')
    expect(primaryList).not.toBeNull()
    const primaryWarningItems = within(primaryList as HTMLElement).getAllByRole('listitem')
    expect(primaryWarningItems).toHaveLength(3)
    expect(primaryWarningItems.map((item) => item.textContent?.trim())).toEqual([
      '出自を断定できないため、原典情報の確認を先に行ってください。',
      '根拠が弱いため、断定せず原典確認を優先してください。',
      '複数モデルを含むため、最初に見るモデルの選び方に注意してください。',
    ])

    const remainingSummary = within(warningPrimaryBlock as HTMLElement).getByText('残り 3 件の warning を表示')
    const remainingDetails = remainingSummary.closest('details')
    expect(remainingDetails).not.toBeNull()
    await user.click(remainingSummary)

    const remainingWarningItems = within(remainingDetails as HTMLElement).getAllByRole('listitem')
    expect(remainingWarningItems).toHaveLength(3)
    expect(remainingWarningItems.map((item) => item.textContent?.trim())).toEqual([
      '複数鎖を含むため、対象鎖を先に確認してください。',
      'リガンドを含むため、解釈時にリガンド有無を確認してください。',
      '水分子を含むため、用途に応じて除外方針を確認してください。',
    ])

    const card2TechnicalDetails = detailsBySummary(card2, '技術情報（raw contract）')
    const warningCodesLabel = within(card2TechnicalDetails).getByText('warning_codes')
    const warningCodesValue = warningCodesLabel.closest('div')?.querySelector('code')?.textContent ?? ''
    expect(warningCodesValue).toBe(
      'origin_uncertain, classification_low_confidence, multiple_models_present, multiple_chains_present, ligand_present, water_present',
    )
  })

  it('keeps Card3 primary link aligned with next_links[0] order', async () => {
    const expected = await runBioFileGuide({ textInput: '1CRN', file: null, adapterMode: 'mock' })
    expect(expected.status).toBe('success')
    if (expected.status !== 'success') {
      return
    }
    const expectedFirstLink = expected.result.next_links[0]
    expect(expectedFirstLink).toBeDefined()

    await runSample('実験構造の例')

    const card3 = cardByHeading('3. 次にどこを見るか')
    const primaryLinksHeading = within(card3).getByRole('heading', { name: '今すぐ見る候補', level: 4 })
    const primaryLinksSection = primaryLinksHeading.closest('.nextLinksSection')
    expect(primaryLinksSection).not.toBeNull()

    const primaryLinks = within(primaryLinksSection as HTMLElement).getAllByRole('link')
    expect(primaryLinks).toHaveLength(1)

    const primaryLink = primaryLinks[0]
    expect(primaryLink).toHaveTextContent(expectedFirstLink.label)
    expect(primaryLink).toHaveAttribute('href', expectedFirstLink.href)

    const primaryLinkRow = primaryLink.closest('.linkLabelRow')
    expect(primaryLinkRow).not.toBeNull()
    expect(within(primaryLinkRow as HTMLElement).getByText('外部サイト')).toBeInTheDocument()
  })
})
