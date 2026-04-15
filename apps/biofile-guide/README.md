# BioFile Guide for Structure

BioFile Guide for Structure の初期縦切り実装（Phase 1-10 相当）です。  
現在は既定で **mock / recorded fixture 主導** です。RCSB / PDBe / PDBj については read-only real adapter 第1弾を追加済みで、明示的に切り替えた場合だけ外部 API へ問い合わせます。

## 現在できること

- 4文字PDB ID / 拡張PDB ID / ローカルPDB / ローカルmmCIF の入力
- `runBioFileGuide` を通した pipeline 実行（normalizer → parser/resolver → adapter orchestrator → merge → classification → evidence/warning → next_links → formatter）
- success / unknown / error envelope の描画分岐
- 3カードUI（判定 / 注意 / 次の一手）
- `warning_codes` 優先順に基づく `beginner_warning` 表示（先頭3件優先）
- `next_links` の allowlist テンプレート生成
- 外部遷移リンクの明示（外部サイトバッジ）
- `resolved_identifier` が存在確認済みを意味しない旨の注意表示
- recorded fixture ベースの回帰テスト（domain / application / adapter / UI）

## adapter mode

既定値は `mock` です。

```bash
VITE_BIOFILE_GUIDE_ADAPTER_MODE=mock
```

RCSB read-only adapter を使う場合だけ、以下を指定します。

```bash
VITE_BIOFILE_GUIDE_ADAPTER_MODE=real_rcsb
```

PDBe read-only adapter を使う場合だけ、以下を指定します。

```bash
VITE_BIOFILE_GUIDE_ADAPTER_MODE=real_pdbe
```

PDBj read-only adapter を使う場合だけ、以下を指定します。

```bash
VITE_BIOFILE_GUIDE_ADAPTER_MODE=real_pdbj
```

モードの意味は次のとおりです。

- `mock`: RCSB / PDBe / PDBj すべて mock
- `real_rcsb`: Primary の RCSB のみ real、PDBe / PDBj は mock
- `real_pdbe`: Secondary の PDBe のみ real、RCSB / PDBj は mock
- `real_pdbj`: Tertiary の PDBj のみ real、RCSB / PDBe は mock

既定値は `mock` です。テストは fetch を mock し、ネットワーク実通信なしで回します。

## recorded fixture

- recorded fixture catalog: `src/mocks/recordedMetadataFixtures.ts`
- mock mode はこの catalog を参照して provider ごとの差分を再現します
- adapter unit test は recorded capture を fetch stub 化して実通信なしで検証します
- CI 本線は live API 直叩きを前提にしません

## Dev

リポジトリルートで実行:

```bash
npm run dev:biofile-guide
```

## Lint

```bash
npm -w apps/biofile-guide run lint
```

## Build

```bash
npm -w apps/biofile-guide run build
```

## Test

```bash
npm -w apps/biofile-guide run test
```

## 現時点で未実装のもの

- Anonymous Telemetry（送信処理）
- RCSB adapter の retry / cache 作り込み
- live API の任意疎通確認ジョブ（本線CIとは分離）
- Mol* / iCn3D の埋め込み統合（現在は外部遷移導線のみ）
- gold-set 全面実行系
