# Repository Map

## Overview

本リポジトリは npm workspaces を用いた **モノレポ構成**を採用する。

---

## Root

```

/
├─ apps/                  # サブアプリ群
├─ packages/              # 将来の共通パッケージ置き場
├─ docs/                  # プロジェクト共通ドキュメント
├─ scripts/               # ビルド・公開用スクリプト
├─ package.json

```

---

## apps/

### apps/portal
- ツール一覧・入口
- GitHub Pages 上のルート

### apps/sse-diag
- SSE 診断・可視化ツール
- Mol* 統合の初期実装対象

### apps/tool-b
- 将来拡張用のサンプル／実験ツール

---

## packages/（将来）

- `molstar-adapter`（planned）
  - Mol* 統合ロジックの共通化候補
  - 初期段階では存在しない