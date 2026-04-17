import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { runBioFileGuide } from './application/runBioFileGuide'
import { resolveMetadataAdapterMode } from './application/metadataAdapterFactory'
import { normalizeInput } from './domain/inputNormalizer'
import { isExternalDestination } from './domain/nextLinkSelector'
import {
  createIdentifierPersistentCacheTarget,
  readIdentifierPersistentCache,
  shouldPersistIdentifierEnvelope,
  writeIdentifierPersistentCache,
} from './infrastructure/persistentCache/localStoragePersistentResultCache'
import type { BioFileEnvelope, ErrorEnvelope, SuccessEnvelope } from './types/contracts'
import {
  emitAnonymousTelemetryEvent,
  mapLinkTelemetryEventCode,
  type AnonymousTelemetryEventCode,
} from './telemetry/anonymousTelemetry'

type SampleInput = {
  label: string
  value: string
}

const SAMPLE_INPUTS: SampleInput[] = [
  { label: '実験構造の例', value: '1CRN' },
  { label: '拡張IDの例', value: 'pdb_00001abc' },
  { label: '不正入力の例', value: 'abc' },
  { label: 'API一時不達の例', value: '2UNV' },
]

const ADAPTER_MODE = resolveMetadataAdapterMode(import.meta.env.VITE_BIOFILE_GUIDE_ADAPTER_MODE)

function formatNullable(value: string | number | null): string {
  return value === null ? 'unknown' : String(value)
}

function renderExternalBadge(isExternal: boolean): string {
  return isExternal ? '外部サイト' : '内部導線'
}

function renderEntryResolutionNote(status: SuccessEnvelope['result']['entry_resolution_status']): string {
  if (status === 'verified') {
    return 'entry_resolution_status=verified のため、この識別子は公式APIで存在確認済みです。'
  }
  if (status === 'not_found') {
    return 'entry_resolution_status=not_found のため、入力形式は妥当ですが該当エントリの存在は確認できていません。'
  }
  return 'entry_resolution_status=unresolved のため、存在可否はまだ断定できません。'
}

type TelemetryLink = Pick<SuccessEnvelope['result']['next_links'][number], 'destination_type' | 'href'>

function emitTelemetrySafely(eventCode: AnonymousTelemetryEventCode): void {
  void emitAnonymousTelemetryEvent(eventCode).catch(() => undefined)
}

function trackLinkTelemetry(link: TelemetryLink, isRecommendedAction: boolean): void {
  if (isRecommendedAction) {
    emitTelemetrySafely('click_recommended_next_step')
  }
  const linkEventCode = mapLinkTelemetryEventCode(link)
  if (linkEventCode !== null) {
    emitTelemetrySafely(linkEventCode)
  }
}

const RECORD_TYPE_LABELS: Record<string, string> = {
  experimental_structure: '実験で決定された構造',
  computed_model: '計算で推定された構造モデル',
  integrative_structure: '統合表現を含む構造',
  unknown: '種類を断定できない構造',
}

const SOURCE_DATABASE_LABELS: Record<string, string> = {
  PDB: 'PDB（実験構造データベース）',
  AlphaFoldDB: 'AlphaFoldDB（予測モデル）',
  ModelArchive: 'ModelArchive（計算モデル）',
  local_file: 'ローカルファイル',
  unknown: '出自を断定できません',
}

const RESOLVED_FORMAT_LABELS: Record<string, string> = {
  pdb: 'PDB 形式',
  mmcif: 'mmCIF 形式',
  unknown: '形式を断定できません',
}

const CONFIDENCE_LEVEL_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

function renderRecordTypeLabel(recordType: string): string {
  return RECORD_TYPE_LABELS[recordType] ?? `種類を断定できない構造（${recordType}）`
}

function renderSourceDatabaseLabel(sourceDatabase: string): string {
  return SOURCE_DATABASE_LABELS[sourceDatabase] ?? sourceDatabase
}

function renderResolvedFormatLabel(resolvedFormat: string): string {
  return RESOLVED_FORMAT_LABELS[resolvedFormat] ?? resolvedFormat
}

function renderConfidenceLabel(level: string): string {
  return CONFIDENCE_LEVEL_LABELS[level] ?? level
}

function renderRecordTypeDescription(
  recordType: SuccessEnvelope['result']['record_type'],
  sourceDatabase: SuccessEnvelope['result']['source_database'],
): string {
  if (recordType === 'experimental_structure') {
    return '実験由来の根拠を優先して案内します。原典情報と合わせて確認してください。'
  }
  if (recordType === 'computed_model') {
    return '計算モデル前提で扱います。必要に応じて由来データベースの情報を確認してください。'
  }
  if (recordType === 'integrative_structure') {
    return '統合表現を含むため、旧PDB互換性の注意を先に確認してください。'
  }
  if (sourceDatabase === 'local_file') {
    return 'ローカル入力のため出自を断定せず、確認できた範囲で案内します。'
  }
  return '根拠不足または競合のため断定を保留しています。次の一手から確認を進めてください。'
}

function renderCompatibilitySummary(
  compatibility: SuccessEnvelope['result']['legacy_pdb_compatibility'],
): string {
  if (compatibility === 'compatible') {
    return '現時点で旧PDB形式への明確な互換性リスクは検出されていません。'
  }
  if (compatibility === 'caution') {
    return '旧PDB形式へ落とすと情報が欠ける可能性があります。最初に原典情報を確認してください。'
  }
  if (compatibility === 'incompatible') {
    return '旧PDB形式では表現しきれない可能性が高いため、mmCIF前提で確認してください。'
  }
  return '旧PDB互換性を断定できません。原典情報を先に確認する進め方が安全です。'
}

function renderCompatibilityClass(
  compatibility: SuccessEnvelope['result']['legacy_pdb_compatibility'],
): string {
  if (compatibility === 'compatible') {
    return 'noticeInfo'
  }
  if (compatibility === 'caution') {
    return 'noticeCaution'
  }
  if (compatibility === 'incompatible') {
    return 'noticeErrorLike'
  }
  return 'noticeUnknown'
}

function SuccessView({ envelope }: { envelope: SuccessEnvelope }): JSX.Element {
  const result = envelope.result
  const hasUnknown = result.record_type === 'unknown' || result.source_database === 'unknown'
  const prioritizedWarnings = result.beginner_warning.slice(0, 3)
  const remainingWarnings = result.beginner_warning.slice(3)
  const warningCodes = result.warning_codes.length > 0 ? result.warning_codes.join(', ') : 'none'
  const [primaryNextLink, ...supportingNextLinks] = result.next_links

  return (
    <section className="resultPanel">
      <header className="resultHeader">
        <div className="resultHeaderText">
          <p className="typeEnglishLabel resultHeaderEnglish">Result</p>
          <h2 className="typePageHeading">判定結果</h2>
        </div>
        <span className={`statusPill statusSuccess`}>success</span>
      </header>

      <div className="metaRow">
        <span>schema_version: {envelope.schema_version}</span>
        <span>input_type: {result.input_type}</span>
      </div>

      {hasUnknown ? (
        <div className="notice noticeUnknown">
          <strong>unknown は失敗ではありません。</strong>
          <p>根拠不足または根拠競合のため断定を保留しています。確認できた情報と次の一手で前進できます。</p>
          <p className="nextStepCode secondaryCode"><span>unknown_reason_code: </span><code>{formatNullable(result.unknown_reason_code)}</code></p>
        </div>
      ) : null}

      <p className="identifierNote">
        <strong>注意:</strong> `resolved_identifier` は URL 組み立て用の正規化IDであり、存在確認済みを意味しません。
      </p>
      <p className="identifierNote">{renderEntryResolutionNote(result.entry_resolution_status)}</p>

      <div className="cardGrid">
        <article className="card">
          <p className="typeEnglishLabel cardEnglishLabel">Identity</p>
          <h3 className="typeSectionHeading">1. これは何の構造か</h3>
          <p className="cardLead">構造タイプと由来を先に確認します。断定できない場合は unknown のまま表示します。</p>
          <div className="primaryMeaningBlock">
            <p className="primaryMeaningLabel">判定の要点</p>
            <p className="primaryMeaningTitle">{renderRecordTypeLabel(result.record_type)}</p>
            <p className="primaryMeaningDescription">{renderRecordTypeDescription(result.record_type, result.source_database)}</p>
          </div>
          <dl className="detailList detailListPrimary">
            <div><dt>由来データベース</dt><dd>{renderSourceDatabaseLabel(result.source_database)}</dd></div>
            <div><dt>フォーマット</dt><dd>{renderResolvedFormatLabel(result.resolved_format)}</dd></div>
            <div><dt>信頼度（分類）</dt><dd>{renderConfidenceLabel(result.confidence.level)}</dd></div>
          </dl>
          <details className="technicalDetails">
            <summary>技術情報（raw contract）</summary>
            <dl className="detailList">
              <div><dt>input_type</dt><dd>{result.input_type}</dd></div>
              <div><dt>entry_resolution_status</dt><dd>{result.entry_resolution_status}</dd></div>
              <div><dt>record_type</dt><dd>{result.record_type}</dd></div>
              <div><dt>resolved_format</dt><dd>{result.resolved_format}</dd></div>
              <div><dt>source_database</dt><dd>{result.source_database}</dd></div>
              <div><dt>experiment_method</dt><dd>{formatNullable(result.experiment_method)}</dd></div>
              <div><dt>confidence.scope</dt><dd>{result.confidence.scope}</dd></div>
              <div><dt>confidence.level</dt><dd>{result.confidence.level}</dd></div>
              <div><dt>resolved_identifier</dt><dd>{formatNullable(result.resolved_identifier)}</dd></div>
            </dl>
          </details>
        </article>

        <article className="card">
          <p className="typeEnglishLabel cardEnglishLabel">Cautions</p>
          <h3 className="typeSectionHeading">2. まず気をつけること</h3>
          <p className="cardLead">最初に見てほしい注意を先に確認し、補足の契約値は技術情報で確認してください。</p>
          <div className="warningPrimaryBlock">
            <p className="warningPrimaryLabel">最初に見てほしい注意（warning top3）</p>
            <ul className="warningPrimaryList">
              {prioritizedWarnings.length === 0 ? <li>現在、優先表示すべき warning はありません。</li> : null}
              {prioritizedWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
            {remainingWarnings.length > 0 ? (
              <details>
                <summary>残り {remainingWarnings.length} 件の warning を表示</summary>
                <ul>
                  {remainingWarnings.map((warning, index) => (
                    <li key={`${warning}-rest-${index}`}>{warning}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          <div className={`notice noticeCompact warningSupportBlock ${renderCompatibilityClass(result.legacy_pdb_compatibility)}`}>
            <strong>補足の互換性メモ</strong>
            <p>{renderCompatibilitySummary(result.legacy_pdb_compatibility)}</p>
          </div>
          <details className="technicalDetails">
            <summary>技術情報（raw contract）</summary>
            <dl className="detailList">
              <div><dt>warning_codes</dt><dd><code>{warningCodes}</code></dd></div>
              <div><dt>legacy_pdb_compatibility</dt><dd>{result.legacy_pdb_compatibility}</dd></div>
              <div><dt>legacy_pdb_reason_text</dt><dd>{formatNullable(result.legacy_pdb_reason_text)}</dd></div>
              <div><dt>model_count</dt><dd>{formatNullable(result.model_count)}</dd></div>
              <div><dt>chain_count</dt><dd>{formatNullable(result.chain_count)}</dd></div>
              <div><dt>ligand_status</dt><dd>{result.ligand_status}</dd></div>
              <div><dt>water_status</dt><dd>{result.water_status}</dd></div>
            </dl>
          </details>
        </article>

        <article className="card">
          <p className="typeEnglishLabel cardEnglishLabel">Next Actions</p>
          <h3 className="typeSectionHeading">3. 次にどこを見るか</h3>
          <p className="cardLead">迷ったら、まず下の最初の一手を実行し、必要に応じて補助導線を使ってください。</p>
          <div className="nextActionHero">
            <p className="nextActionLabel">おすすめの最初の行動</p>
            <p className="nextActionText">{result.recommended_next_step}</p>
          </div>
          <div className="nextLinksSection">
            <h4>今すぐ見る候補</h4>
            <ul className="linkList">
              {primaryNextLink === undefined ? <li>表示できる導線がありません。</li> : null}
              {primaryNextLink !== undefined ? (() => {
                const external = isExternalDestination(primaryNextLink.destination_type)
                return (
                  <li key={`${primaryNextLink.destination_type}:${primaryNextLink.href}`}>
                    <div className="linkLabelRow">
                      <a
                        href={primaryNextLink.href}
                        target={external ? '_blank' : undefined}
                        rel={external ? 'noreferrer' : undefined}
                        onClick={() => trackLinkTelemetry(primaryNextLink, true)}
                      >
                        {primaryNextLink.label}
                      </a>
                      {external ? <span className="linkBadge">{renderExternalBadge(external)}</span> : null}
                    </div>
                    <small>{primaryNextLink.reason}</small>
                  </li>
                )
              })() : null}
            </ul>
          </div>
          {supportingNextLinks.length > 0 ? (
            <div className="nextLinksSection">
              <h4>補助的に見る候補</h4>
              <ul className="linkList">
                {supportingNextLinks.map((link) => {
                  const external = isExternalDestination(link.destination_type)
                  return (
                    <li key={`${link.destination_type}:${link.href}`}>
                      <div className="linkLabelRow">
                        <a
                          href={link.href}
                          target={external ? '_blank' : undefined}
                          rel={external ? 'noreferrer' : undefined}
                          onClick={() => trackLinkTelemetry(link, false)}
                        >
                          {link.label}
                        </a>
                        {external ? <span className="linkBadge">{renderExternalBadge(external)}</span> : null}
                      </div>
                      <small>{link.reason}</small>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
          <details className="technicalDetails">
            <summary>技術情報（raw contract）</summary>
            <p className="nextStepCode secondaryCode">
              <span>recommended_next_step_code: </span>
              <code>{result.recommended_next_step_code}</code>
            </p>
          </details>
        </article>
      </div>

      <div className="evidenceBlock">
        <p className="typeEnglishLabel evidenceEnglishLabel">Evidence</p>
        <h3 className="typeSectionHeading">判定に使った根拠（evidence）</h3>
        <ul>
          {result.evidence.map((item) => (
            <li key={`${item.code}:${item.detail}`}>
              <code>{item.code}</code> - {item.detail}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ErrorView({ envelope }: { envelope: ErrorEnvelope }): JSX.Element {
  const { error } = envelope
  const [primaryNextLink, ...supportingNextLinks] = error.next_links

  return (
    <section className="resultPanel">
      <header className="resultHeader">
        <div className="resultHeaderText">
          <p className="typeEnglishLabel resultHeaderEnglish">Process Status</p>
          <h2 className="typePageHeading">処理を完了できませんでした</h2>
        </div>
        <span className={`statusPill statusError`}>error</span>
      </header>
      <p className="cardLead">error は処理失敗ですが、次に進むための一手と導線は必ず残しています。</p>

      <div className="cardGrid">
        <article className="card">
          <p className="typeEnglishLabel cardEnglishLabel">Error Summary</p>
          <h3 className="typeSectionHeading">1. 何が起きたか</h3>
          <p>{error.message}</p>
          <p>{error.reason}</p>
          <p className="nextStepCode secondaryCode">
            <span>error_code: </span>
            <code>{error.error_code}</code>
          </p>
        </article>

        <article className="card">
          <p className="typeEnglishLabel cardEnglishLabel">Recommended Action</p>
          <h3 className="typeSectionHeading">2. 次の一手</h3>
          <p className="cardLead">まず下の最初の一手を実行し、必要に応じて補助導線を使ってください。</p>
          <div className="nextActionHero">
            <p className="nextActionLabel">おすすめの最初の行動</p>
            <p className="nextActionText">{error.recommended_next_step}</p>
          </div>
          <div className="nextLinksSection">
            <h4>今すぐ開く候補</h4>
            <ul className="linkList">
              {primaryNextLink === undefined ? <li>表示できる導線がありません。</li> : null}
              {primaryNextLink !== undefined ? (() => {
                const external = isExternalDestination(primaryNextLink.destination_type)
                return (
                  <li key={`${primaryNextLink.destination_type}:${primaryNextLink.href}`}>
                    <div className="linkLabelRow">
                      <a
                        href={primaryNextLink.href}
                        target={external ? '_blank' : undefined}
                        rel={external ? 'noreferrer' : undefined}
                        onClick={() => trackLinkTelemetry(primaryNextLink, true)}
                      >
                        {primaryNextLink.label}
                      </a>
                      {external ? <span className="linkBadge">{renderExternalBadge(external)}</span> : null}
                    </div>
                    <small>{primaryNextLink.reason}</small>
                  </li>
                )
              })() : null}
            </ul>
          </div>
          {supportingNextLinks.length > 0 ? (
            <div className="nextLinksSection">
              <h4>補助的に開く候補</h4>
              <ul className="linkList">
                {supportingNextLinks.map((link) => {
                  const external = isExternalDestination(link.destination_type)
                  return (
                    <li key={`${link.destination_type}:${link.href}`}>
                      <div className="linkLabelRow">
                        <a
                          href={link.href}
                          target={external ? '_blank' : undefined}
                          rel={external ? 'noreferrer' : undefined}
                          onClick={() => trackLinkTelemetry(link, false)}
                        >
                          {link.label}
                        </a>
                        {external ? <span className="linkBadge">{renderExternalBadge(external)}</span> : null}
                      </div>
                      <small>{link.reason}</small>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
          <details className="technicalDetails">
            <summary>技術情報（raw contract）</summary>
            <p className="nextStepCode secondaryCode">
              <span>recommended_next_step_code: </span>
              <code>{error.recommended_next_step_code}</code>
            </p>
          </details>
        </article>

        <article className="card">
          <p className="typeEnglishLabel cardEnglishLabel">Confirmed Facts</p>
          <h3 className="typeSectionHeading">3. 確認できた事実</h3>
          <p className="cardLead">取得できた根拠のみを表示します。</p>
          <ul>
            {error.confirmed_facts.length === 0 ? <li>なし</li> : null}
            {error.confirmed_facts.map((fact) => (
              <li key={`${fact.code}:${fact.detail}`}>
                <code>{fact.code}</code> - {fact.detail}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}

export default function App(): JSX.Element {
  const [textInput, setTextInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<BioFileEnvelope | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const inputSummary = useMemo(() => {
    if (selectedFile !== null) {
      return `選択ファイル: ${selectedFile.name}`
    }
    return textInput.trim().length > 0 ? `入力ID: ${textInput.trim()}` : '未入力'
  }, [selectedFile, textInput])

  useEffect(() => {
    if (result === null) {
      return
    }
    if (result.status === 'success') {
      const hasUnknown = result.result.record_type === 'unknown' || result.result.source_database === 'unknown'
      emitTelemetrySafely(hasUnknown ? 'result_unknown_rendered' : 'result_rendered')
      return
    }
    if (result.error.error_code === 'parse_failed') {
      emitTelemetrySafely('error_parse_failed')
      return
    }
    if (result.error.error_code === 'invalid_identifier') {
      emitTelemetrySafely('error_invalid_identifier')
    }
  }, [result])

  const run = async (): Promise<void> => {
    setIsRunning(true)
    const normalizedInput = normalizeInput(textInput, selectedFile)
    const cacheTarget = createIdentifierPersistentCacheTarget(normalizedInput, ADAPTER_MODE)
    try {
      if (cacheTarget !== null) {
        const cachedEnvelope = readIdentifierPersistentCache(cacheTarget)
        if (cachedEnvelope !== null) {
          setResult(cachedEnvelope)
          return
        }
      }

      const envelope = await runBioFileGuide({ textInput, file: selectedFile, adapterMode: ADAPTER_MODE })
      setResult(envelope)

      if (cacheTarget !== null && shouldPersistIdentifierEnvelope(envelope)) {
        writeIdentifierPersistentCache(cacheTarget, envelope)
      }
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <main className="appRoot">
      <header className="appHeader">
        <p className="typeEnglishLabel appHeaderEnglish">Structure Entry Translator</p>
        <h1 className="typeBrandHeading">BioFile Guide for Structure</h1>
        <p className="appHeaderLead">判定契約に基づく初期縦切り実装（fixture-driven）</p>
        <a href="../" className="backLink">← Portal に戻る</a>
      </header>

      <section className="inputPanel">
        <p className="typeEnglishLabel panelEnglishLabel">Input</p>
        <h2 className="typePageHeading">入力</h2>
        <p className="helperText">4文字PDB ID / 拡張PDB ID / ローカルPDB / ローカルmmCIF に対応します。</p>
        <p className="helperText">ローカルファイル本文はブラウザ内で処理し、外部送信しません。</p>

        <div className="field">
          <label htmlFor="idInput">ID入力</label>
          <input
            id="idInput"
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            placeholder="例: 1CRN / pdb_00001abc"
            disabled={selectedFile !== null}
          />
        </div>

        <div className="sampleRow">
          {SAMPLE_INPUTS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => {
                setSelectedFile(null)
                setTextInput(sample.value)
              }}
            >
              {sample.label}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="fileInput">ローカルファイル</label>
          <input
            id="fileInput"
            type="file"
            accept=".pdb,.ent,.cif,.mmcif,text/plain"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          {selectedFile !== null ? (
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="clearFileButton"
            >
              ファイル選択を解除
            </button>
          ) : null}
        </div>

        <div className="runRow">
          <button type="button" onClick={run} disabled={isRunning}>
            {isRunning ? '判定中...' : '判定を実行'}
          </button>
          <span className="inputSummary">{inputSummary}</span>
        </div>
      </section>

      {result === null ? (
        <section className="resultPanel placeholderPanel">
          <p className="typeEnglishLabel panelEnglishLabel">Result</p>
          <h2 className="typePageHeading">結果表示</h2>
          <p>まだ実行されていません。ID入力またはファイル選択後に「判定を実行」を押してください。</p>
        </section>
      ) : result.status === 'success' ? (
        <SuccessView envelope={result} />
      ) : (
        <ErrorView envelope={result} />
      )}
    </main>
  )
}
