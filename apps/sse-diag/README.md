# SSE-Diag（SSE 診断）

SSE-Diag は、Mol* を SSOT として、Mol* auto SSE（Baseline）と known method SSE（Override）を
**比較成立条件つき**で診断するツールです。

## このアプリの価値
- 比較不能を差分に混ぜない
- 比較条件を Contract として示せる
- known method の provenance / compatibility を監査できる
- HUD / Table / Focus で差異を追える

## 現在の開発方針
- 親正本は [`../../docs/architecture.md`](../../docs/architecture.md)
- 詳細定義は [`../../docs/architecture/`](../../docs/architecture/) 配下の分割文書を参照する
- 実装順と KPI は [ロードマップ](../../docs/architecture/roadmap.md) を参照する
- Known-Methods Pivot の詳細は [SSE Engine 契約](../../docs/architecture/sse-engine.md) を参照する
- Mol* 依存は adapter 境界に閉じ込める
- 計算コアは将来 Rust / WASM に置換可能にする

## 開発

リポジトリルートで:

```bash
npm run dev:sse-diag
```

## ビルド

```bash
npm -w apps/sse-diag run build
```

## 注意点

- ローカルファイル（mmCIF / PDB）は外部送信しない
- Mol* が構造データの一次ソース（SSOT）
- 比較条件や状態機械の詳細は [状態モデル](../../docs/architecture/state-model.md) を参照する
