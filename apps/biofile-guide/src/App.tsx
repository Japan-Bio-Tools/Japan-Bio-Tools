import { useMemo, useState } from 'react'
import './App.css'
import { runBioFileGuide } from './application/runBioFileGuide'
import { isExternalDestination } from './domain/nextLinkSelector'
import type { BioFileEnvelope, ErrorEnvelope, SuccessEnvelope } from './types/contracts'

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

function formatNullable(value: string | number | null): string {
  return value === null ? 'unknown' : String(value)
}

function renderExternalBadge(isExternal: boolean): string {
  return isExternal ? '外部サイト' : '内部導線'
}

function renderEntryResolutionNote(status: SuccessEnvelope['result']['entry_resolution_status']): string {
  if (status === 'verified') {
    return 'entry_resolution_status=verified のため、この識別子は公式APIで存在確認できています。'
  }
  if (status === 'not_found') {
    return 'entry_resolution_status=not_found のため、形式は妥当ですが該当エントリは確認できていません。'
  }
  return 'entry_resolution_status=unresolved のため、存在可否は断定できません。'
}

function SuccessView({ envelope }: { envelope: SuccessEnvelope }): JSX.Element {
  const result = envelope.result
  const hasUnknown = result.record_type === 'unknown' || result.source_database === 'unknown'
  const prioritizedWarnings = result.beginner_warning.slice(0, 3)
  const remainingWarnings = result.beginner_warning.slice(3)

  return (
    <section className="resultPanel">
      <header className="resultHeader">
        <h2>判定結果</h2>
        <span className={`statusPill statusSuccess`}>success</span>
      </header>

      <div className="metaRow">
        <span>schema_version: {envelope.schema_version}</span>
        <span>input_type: {result.input_type}</span>
        <span>entry_resolution_status: {result.entry_resolution_status}</span>
      </div>

      {hasUnknown ? (
        <div className="notice noticeUnknown">
          <strong>unknown を含む結果です。</strong>
          <p>断定できない理由: {formatNullable(result.unknown_reason_code)}</p>
        </div>
      ) : null}

      <p className="identifierNote">
        `resolved_identifier` は URL 組み立て用の正規化IDであり、存在確認済みを意味しません。
      </p>
      <p className="identifierNote">{renderEntryResolutionNote(result.entry_resolution_status)}</p>

      <div className="cardGrid">
        <article className="card">
          <h3>カード1: この入力は何者か</h3>
          <dl className="detailList">
            <div><dt>record_type</dt><dd>{result.record_type}</dd></div>
            <div><dt>resolved_format</dt><dd>{result.resolved_format}</dd></div>
            <div><dt>source_database</dt><dd>{result.source_database}</dd></div>
            <div><dt>experiment_method</dt><dd>{formatNullable(result.experiment_method)}</dd></div>
            <div><dt>confidence</dt><dd>{result.confidence.level}</dd></div>
            <div><dt>resolved_identifier</dt><dd>{formatNullable(result.resolved_identifier)}</dd></div>
          </dl>
        </article>

        <article className="card">
          <h3>カード2: 最初に気をつけること</h3>
          <dl className="detailList">
            <div><dt>legacy_pdb_compatibility</dt><dd>{result.legacy_pdb_compatibility}</dd></div>
            <div><dt>legacy_pdb_reason_text</dt><dd>{formatNullable(result.legacy_pdb_reason_text)}</dd></div>
            <div><dt>model_count</dt><dd>{formatNullable(result.model_count)}</dd></div>
            <div><dt>chain_count</dt><dd>{formatNullable(result.chain_count)}</dd></div>
            <div><dt>ligand_status</dt><dd>{result.ligand_status}</dd></div>
            <div><dt>water_status</dt><dd>{result.water_status}</dd></div>
          </dl>
          <div className="warningBlock">
            <h4>beginner_warning（priority順）</h4>
            <ul>
              {prioritizedWarnings.length === 0 ? <li>なし</li> : null}
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
        </article>

        <article className="card">
          <h3>カード3: 次に開く場所</h3>
          <p className="nextStepCode">{result.recommended_next_step_code}</p>
          <p>{result.recommended_next_step}</p>
          <ul className="linkList">
            {result.next_links.map((link) => {
              const external = isExternalDestination(link.destination_type)
              return (
                <li key={`${link.destination_type}:${link.href}`}>
                  <a href={link.href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
                    {link.label}
                  </a>
                  <span className="linkBadge">{renderExternalBadge(external)}</span>
                  <small>{link.reason}</small>
                </li>
              )
            })}
          </ul>
        </article>
      </div>

      <div className="evidenceBlock">
        <h3>evidence</h3>
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

  return (
    <section className="resultPanel">
      <header className="resultHeader">
        <h2>エラー結果</h2>
        <span className={`statusPill statusError`}>error</span>
      </header>
      <div className="errorSummary">
        <p><strong>{error.error_code}</strong></p>
        <p>{error.message}</p>
        <p>{error.reason}</p>
      </div>
      <article className="card">
        <h3>次の一手</h3>
        <p className="nextStepCode">{error.recommended_next_step_code}</p>
        <p>{error.recommended_next_step}</p>
        <ul className="linkList">
          {error.next_links.map((link) => {
            const external = isExternalDestination(link.destination_type)
            return (
              <li key={`${link.destination_type}:${link.href}`}>
                <a href={link.href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
                  {link.label}
                </a>
                <span className="linkBadge">{renderExternalBadge(external)}</span>
                <small>{link.reason}</small>
              </li>
            )
          })}
        </ul>
      </article>
      <article className="card">
        <h3>confirmed_facts</h3>
        <ul>
          {error.confirmed_facts.length === 0 ? <li>なし</li> : null}
          {error.confirmed_facts.map((fact) => (
            <li key={`${fact.code}:${fact.detail}`}>
              <code>{fact.code}</code> - {fact.detail}
            </li>
          ))}
        </ul>
      </article>
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

  const run = async (): Promise<void> => {
    setIsRunning(true)
    try {
      const envelope = await runBioFileGuide({ textInput, file: selectedFile })
      setResult(envelope)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <main className="appRoot">
      <header className="appHeader">
        <h1>BioFile Guide for Structure</h1>
        <p>判定契約に基づく初期縦切り実装（fixture-driven）</p>
        <a href="../" className="backLink">← Portal に戻る</a>
      </header>

      <section className="inputPanel">
        <h2>入力</h2>
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
          <h2>結果表示</h2>
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
