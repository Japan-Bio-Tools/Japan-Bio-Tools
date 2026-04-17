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
- real adapter の最小運用品質向上（provider別 timeout、一時失敗のみ1回 retry、session-memory cache）

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
- real adapter は `404` / malformed を retry せず、network / timeout / `5xx` のみ 1 回 retry します
- session cache は in-memory のみで、`found` と `not_found` を対象にします（`unavailable` は既定で cache しません）

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

## Optional Live Check (non-blocking)

live API 疎通確認は本線 CI と分離した任意運用です。  
本線の lint / build / test は、これまでどおり recorded fixture / mock 前提で live API 非依存のままです。

ローカル実行:

```bash
npm -w apps/biofile-guide run live-check
```

GitHub Actions 手動実行:

- Actions で `BioFile Guide Optional Live API Check (non-blocking)` を選択
- `Run workflow` で起動

live check の最小確認内容:

- RCSB / PDBe / PDBj それぞれで known ID `1CRN` が `success` になること
- RCSB / PDBe / PDBj それぞれで unknown ID `0000` が `not_found` になること

live check failure の意味:

- provider endpoint 側の一時不調、ネットワーク不調、または応答形状変化の兆候
- 本線の recorded fixture 回帰（lint/build/test）失敗と同義ではない

## 現時点で未実装のもの

- Anonymous Telemetry の運用設定UIと高度化（初期送信処理は opt-in + event code 限定で実装済み）
- 永続キャッシュ（localStorage による identifier 入力の初期実装は導入済み。IndexedDB / server cache は未実装）
- 高度な retry policy（指数バックオフ、circuit breaker など）
- Mol* / iCn3D の埋め込み統合（現在は外部遷移導線のみ）
- gold-set 最低ケース coverage の拡張（expected-output 駆動の初期実装は導入済み）
