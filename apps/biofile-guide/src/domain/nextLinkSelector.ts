import type { ClassificationOutcome } from '../application/pipelineTypes'
import { LINK_TEMPLATES, NEXT_STEP_TEXT_MAP } from './contractConstants'
import type { DestinationType, NextLink, RecommendedNextStepCode } from '../types/contracts'

type LinkTemplate = keyof typeof LINK_TEMPLATES

function buildHref(templateName: LinkTemplate, resolvedIdentifier: string | null): string | null {
  const template = LINK_TEMPLATES[templateName].template
  const needsIdToken = /{id(_upper|_lower)?}/.test(template)
  if (needsIdToken && resolvedIdentifier === null) {
    return null
  }

  const id = resolvedIdentifier ?? ''
  return template
    .replaceAll('{id}', id)
    .replaceAll('{id_upper}', id.toUpperCase())
    .replaceAll('{id_lower}', id.toLowerCase())
}

function makeLink(
  templateName: LinkTemplate,
  resolvedIdentifier: string | null,
  label: string,
  reason: string,
): NextLink | null {
  const href = buildHref(templateName, resolvedIdentifier)
  if (href === null) {
    return null
  }
  return {
    label,
    reason,
    destination_type: LINK_TEMPLATES[templateName].destinationType,
    href,
  }
}

function pushIfNotNull(target: NextLink[], link: NextLink | null): void {
  if (link !== null) {
    target.push(link)
  }
}

function dedupeLinks(links: NextLink[]): NextLink[] {
  const seen = new Set<string>()
  const result: NextLink[] = []
  for (const link of links) {
    const key = `${link.destination_type}:${link.href}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(link)
    }
  }
  return result
}

function defaultNextStepCode(outcome: ClassificationOutcome): RecommendedNextStepCode {
  if (outcome.resolvedIdentifier === null) {
    return 'open_molmil_local_guide'
  }
  if (outcome.recordType === 'unknown' || outcome.sourceDatabase === 'unknown') {
    return 'check_origin_metadata'
  }
  return 'open_rcsb_entry'
}

export function selectNextLinksForSuccess(
  outcome: ClassificationOutcome,
): {
  code: RecommendedNextStepCode
  text: string
  links: NextLink[]
} {
  const links: NextLink[] = []
  const recommendedCode = defaultNextStepCode(outcome)

  if (outcome.resolvedIdentifier !== null) {
    pushIfNotNull(
      links,
      makeLink(
        'rcsbEntry',
        outcome.resolvedIdentifier,
        'RCSB エントリ',
        '原典情報の確認',
      ),
    )
    pushIfNotNull(
      links,
      makeLink(
        'molstarRemote',
        outcome.resolvedIdentifier,
        'Mol* Viewer',
        '構造を素早く確認',
      ),
    )
    if (outcome.recordType === 'unknown' || outcome.sourceDatabase === 'unknown') {
      pushIfNotNull(
        links,
        makeLink(
          'pdbeEntry',
          outcome.resolvedIdentifier,
          'PDBe エントリ',
          '補助ソースの突合',
        ),
      )
    }
  } else {
    pushIfNotNull(
      links,
      makeLink('molmilLocalGuide', null, 'ローカル閲覧ガイド', 'ローカルファイル表示の手順確認'),
    )
    pushIfNotNull(
      links,
      makeLink('beginnerGuide', null, 'フォーマットガイド', 'PDB/mmCIF の基本確認'),
    )
  }

  if (links.length === 0) {
    pushIfNotNull(
      links,
      makeLink('internalGuide', null, '内部ガイド', '次の確認手順へ進む'),
    )
  }

  return {
    code: recommendedCode,
    text: NEXT_STEP_TEXT_MAP[recommendedCode],
    links: dedupeLinks(links),
  }
}

export function selectNextLinksForError(
  errorCode: string,
  resolvedIdentifier: string | null,
): {
  code: RecommendedNextStepCode
  text: string
  links: NextLink[]
} {
  let code: RecommendedNextStepCode = 'check_format_and_retry'
  const links: NextLink[] = []

  if (errorCode === 'invalid_identifier' || errorCode === 'empty_input') {
    code = 'check_format_and_retry'
    pushIfNotNull(
      links,
      makeLink('rcsbSearch', 'PDB', 'RCSB 検索入口', '有効なID表記を確認'),
    )
    pushIfNotNull(
      links,
      makeLink('beginnerGuide', null, 'フォーマットガイド', '入力形式の確認'),
    )
  } else if (errorCode === 'entry_not_found' && resolvedIdentifier !== null) {
    code = 'check_origin_metadata'
    pushIfNotNull(
      links,
      makeLink('rcsbSearch', resolvedIdentifier, 'RCSB 検索入口', '類似IDを検索して確認'),
    )
    pushIfNotNull(
      links,
      makeLink('pdbeEntry', resolvedIdentifier, 'PDBe エントリ', '別ソースの確認'),
    )
  } else {
    code = 'read_beginner_guide'
    pushIfNotNull(
      links,
      makeLink('beginnerGuide', null, 'フォーマットガイド', '前提条件の確認'),
    )
    pushIfNotNull(
      links,
      makeLink('internalGuide', null, '内部ガイド', '入力条件の再確認'),
    )
  }

  return {
    code,
    text: NEXT_STEP_TEXT_MAP[code],
    links: dedupeLinks(links),
  }
}

export function isExternalDestination(destinationType: DestinationType): boolean {
  return destinationType === 'canonical_entry' || destinationType === 'viewer_remote' || destinationType === 'search_entry'
}
