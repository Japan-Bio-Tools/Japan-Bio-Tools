# Japan-Bio-Tools（構造バイオインフォマティクスツール群）

Japan-Bio-Tools は、**ブラウザ完結・完全サーバーレス**で動作する、
構造バイオインフォマティクス向けツール群です。

基本原則:
- 構造データ（PDB / mmCIF）を外部送信しない
- ローカル読み込み＋ブラウザ内計算で完結する
- Mol* を構造データの一次ソース（SSOT）とする
- 外部で計算・生成したデータを可視化へ注入・上書きできる構造を保つ
- 段階的に実装するが、各段階でプロダクトレベル品質を保つ

## 現在の主戦場
- `apps/sse-diag`
  - 二次構造診断
  - Mol*標準SSEと外部計算SSEを、**比較成立条件つき**で診断するツール

## ドキュメント
- [`docs/architecture.md`](../docs/architecture.md)
  - SSE-Diag アーキテクチャの親正本
- [`docs/architecture/`](../docs/architecture/)
  - 状態モデル、UI 契約、Diagnosis Pipeline、SSE Engine、Mol* 境界、ロードマップの詳細正本
- `docs/repo-map.md`
  - リポジトリ構成
- `docs/dev-setup.md`
  - 開発環境
- `docs/deploy-github-pages.md`
  - GitHub Pages デプロイ
- `docs/security-privacy.md`
  - ローカル処理・外部送信しない方針

## 開発
リポジトリルートで:

```bash
npm ci
npm run dev:sse-diag
```

## 公開

- Portal: `/Japan-Bio-Tools/`
- SSE-Diag: `/Japan-Bio-Tools/sse-diag/`

