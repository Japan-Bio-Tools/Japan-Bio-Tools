# Repository Map

## Overview

本リポジトリは npm workspaces を用いた **モノレポ構成**を採用する。
各ツールは **GitHub Pages 上でサブパス配下に公開**され、ビルド成果物は `dist/` に統合される。

---

## Top-level structure

/
├─ apps/ # サブアプリ群（Vite + React）
│ ├─ portal/ # 入口（ポータル）
│ ├─ sse-diag/ # SSE診断（Mol*統合の主戦場）
│ └─ tool-b/ # 将来拡張用の実験ツール
├─ packages/ # 将来の共通パッケージ置き場（必要になったら切り出す）
├─ docs/ # プロジェクト共通ドキュメント
├─ scripts/ # Pages向け統合ビルド等
└─ .github/workflows/ # GitHub Actions

yaml
コードをコピーする

---

## Apps

### apps/portal
- 入口ページ（各ツールへの導線）
- 公開パス: `/Japan-Bio-Tools/`

### apps/sse-diag
- SSE（二次構造）比較診断ツール
- Mol* を SSOT とし、Baseline / Override を比較成立条件つきで診断する
- 正本仕様は `docs/architecture.md`
- 公開パス: `/Japan-Bio-Tools/sse-diag/`

### apps/tool-b
- 将来拡張用のサンプル／実験ツール
- 公開パス: `/Japan-Bio-Tools/tool-b/`

---

## packages/（将来）

- `molstar-adapter`（planned）
  - Mol*統合ロジックの共通化候補
  - 初期段階では存在しない（必要になった時点で切り出す）

---

## Notes

### Vite `base`
GitHub Pages 配下でアセット解決するため、各アプリは `base` を固定する。

- portal: `/Japan-Bio-Tools/`
- sse-diag: `/Japan-Bio-Tools/sse-diag/`
- tool-b: `/Japan-Bio-Tools/tool-b/`

リポジトリ名を変更した場合は、各 app の `base` を合わせて更新する。