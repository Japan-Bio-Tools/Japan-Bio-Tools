import './App.css'

type ProductStatus = 'stable' | 'beta' | 'prototype'

type ProductCard = {
  status: ProductStatus
  statusLabel: string
  titleJa: string
  titleEn: string
  summary: string
  href?: string
}

const PRODUCTS: ProductCard[] = [
  {
    status: 'beta',
    statusLabel: 'Beta',
    titleJa: 'BioFile Guide for Structure',
    titleEn: 'Structure Entry Translator',
    summary: 'PDB / mmCIF の入口判定を、契約ベースで「何者か / 注意点 / 次の一手」に整理します。',
    href: './biofile-guide/',
  },
  {
    status: 'prototype',
    statusLabel: 'Prototype',
    titleJa: 'Local Viewer Integration Track',
    titleEn: 'Viewer Integration Track',
    summary: 'Mol* / iCn3D 導線の検証を進める予定の試作トラックです。公開導線は準備中です。',
  },
]

function statusClassName(status: ProductStatus): string {
  if (status === 'stable') {
    return 'statusBadge statusBadgeStable'
  }
  if (status === 'beta') {
    return 'statusBadge statusBadgeBeta'
  }
  return 'statusBadge statusBadgePrototype'
}

export default function App() {
  return (
    <main className="portalRoot">
      <header className="portalHero">
        <p className="typeEnglishLabel">Japan-Bio-Tools Ecosystem Portal</p>
        <h1 className="typeBrandHeading">Japan-Bio-Tools</h1>
        <p className="heroLead">
          日本発の生命科学ツール群を、静かで精密な設計原則で接続するポータルです。
        </p>
        <p className="heroSub typeBodyText">
          単体プロダクトのLPではなく、判定・閲覧・検証の流れを段階的に拡張できる入口として設計しています。
        </p>
      </header>

      <section className="portalSection">
        <p className="typeEnglishLabel">Operating Principles</p>
        <h2 className="typePageHeading">運営原則</h2>
        <ul className="principlesList">
          <li>完全サーバーレス / ブラウザ完結を維持する。</li>
          <li>ローカルファイル本文を外部送信せず、ブラウザ内計算で完結させる。</li>
          <li>判定契約を優先し、UIは契約を読みやすく伝える器に徹する。</li>
          <li>実装は段階的に進め、各段階で test/build による検証を通す。</li>
        </ul>
      </section>

      <section className="portalSection">
        <p className="typeEnglishLabel">Products</p>
        <h2 className="typePageHeading">製品群</h2>
        <p className="typeBodyText sectionLead">
          成熟度を明示し、現時点で使える導線と準備中トラックを分けて案内します。
        </p>
        <ul className="productGrid">
          {PRODUCTS.map((product) => (
            <li key={product.titleJa} className="productCard">
              <div className="productMetaRow">
                <span className={statusClassName(product.status)}>{product.statusLabel}</span>
              </div>
              <h3 className="typeSectionHeading">{product.titleJa}</h3>
              <p className="typeEnglishLabel productEnglishName">{product.titleEn}</p>
              <p className="typeBodyText">{product.summary}</p>
              {product.href === undefined ? (
                <p className="productPlaceholder typeMetaLabel">公開導線は準備中です。</p>
              ) : (
                <a className="productLink" href={product.href}>
                  プロダクトへ進む
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="portalSection">
        <p className="typeEnglishLabel">Workflow</p>
        <h2 className="typePageHeading">推奨ワークフロー</h2>
        <ol className="workflowList">
          <li>
            <strong>入口判定</strong>
            <p>まず BioFile Guide で入力種別と注意点を確認し、次の一手を決めます。</p>
          </li>
          <li>
            <strong>原典確認</strong>
            <p>RCSB / PDBe / PDBj などの公式導線で、エントリ情報を照合します。</p>
          </li>
          <li>
            <strong>閲覧・検証</strong>
            <p>必要に応じて外部ビューアや内部ガイドへ進み、用途に合わせて判断を深めます。</p>
          </li>
        </ol>
      </section>

      <section className="portalSection">
        <p className="typeEnglishLabel">References</p>
        <h2 className="typePageHeading">参考資料と連携階層</h2>
        <div className="resourceGrid">
          <article className="resourceTier resourceTierOfficial">
            <div className="resourceHeaderRow">
              <h3 className="typeSectionHeading">公式</h3>
              <span className="statusBadge statusBadgeStable">Official</span>
            </div>
            <ul>
              <li><a href="https://www.rcsb.org/" target="_blank" rel="noreferrer">RCSB PDB</a></li>
              <li><a href="https://www.ebi.ac.uk/pdbe/" target="_blank" rel="noreferrer">PDBe</a></li>
              <li><a href="https://pdbj.org/" target="_blank" rel="noreferrer">PDBj</a></li>
            </ul>
          </article>

          <article className="resourceTier resourceTierCurated">
            <div className="resourceHeaderRow">
              <h3 className="typeSectionHeading">厳選ガイド</h3>
              <span className="statusBadge statusBadgeBeta">Curated</span>
            </div>
            <ul>
              <li><a href="./biofile-guide/">BioFile Guide for Structure</a></li>
              <li><a href="https://www.wwpdb.org/documentation/file-format-content/format33/v3.3.html" target="_blank" rel="noreferrer">PDB Format Documentation</a></li>
              <li><a href="https://mmcif.wwpdb.org/" target="_blank" rel="noreferrer">PDBx/mmCIF Resources</a></li>
            </ul>
          </article>

          <article className="resourceTier resourceTierSponsored">
            <div className="resourceHeaderRow">
              <h3 className="typeSectionHeading">スポンサー</h3>
              <span className="statusBadge statusBadgeSponsored">Sponsored</span>
            </div>
            <p className="typeBodyText">
              現在は掲載枠の公開を行っていません。公開する場合は、公式導線・厳選ガイドより低い視覚優先度で区分表示します。
            </p>
          </article>
        </div>
      </section>
    </main>
  )
}
