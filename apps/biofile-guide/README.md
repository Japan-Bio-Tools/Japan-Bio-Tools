# BioFile Guide for Structure

BioFile Guide for Structure の初期縦切り実装（Phase 1-10 相当）です。  
現在は **mock / fixture 主導** で、契約表示と責務境界を先に成立させています。

## 現在できること

- 4文字PDB ID / 拡張PDB ID / ローカルPDB / ローカルmmCIF の入力
- `runBioFileGuide` を通した pipeline 実行（normalizer → parser/resolver → adapter orchestrator → merge → classification → evidence/warning → next_links → formatter）
- success / unknown / error envelope の描画分岐
- 3カードUI（判定 / 注意 / 次の一手）
- `warning_codes` 優先順に基づく `beginner_warning` 表示（先頭3件優先）
- `next_links` の allowlist テンプレート生成
- 外部遷移リンクの明示（外部サイトバッジ）
- `resolved_identifier` が存在確認済みを意味しない旨の注意表示

## fixture / mock 前提の範囲

- Metadata adapter は interface + mock 実装で接続
- RCSB / PDBe / PDBj は fixture で応答を再現
- 外部API本接続、匿名計測送信、Mol* 統合は未実装

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

## 現時点で未実装のもの

- Anonymous Telemetry（送信処理）
- 外部API本接続（RCSB / PDBe / PDBj の実通信）
- Mol* / iCn3D の埋め込み統合（現在は外部遷移導線のみ）
- 自動テスト（unit / integration / gold-set 実行系）
