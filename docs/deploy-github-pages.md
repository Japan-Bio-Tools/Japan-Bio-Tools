# Deploy: GitHub Pages

## Overview
- `main` ブランチへの push をトリガに GitHub Actions でビルド＆デプロイする。
- GitHub Pages は **単一ディレクトリ**しか配信できないため、各アプリの `dist/` を統合してルート `dist/` を作る。

## Build pipeline（概要）
ルートで以下を実行する：
- `npm run build:pages`
- 実体：`scripts/build-pages.mjs`

処理手順（想定）：
1. 既存のルート `dist/` を削除
2. 各 app を個別に build
   - `npm -w apps/portal run build`
   - `npm -w apps/sse-diag run build`
   - `npm -w apps/tool-b run build`
3. 出力をルート `dist/` に統合
   - `apps/portal/dist`   → `dist/`
   - `apps/sse-diag/dist` → `dist/sse-diag/`
   - `apps/tool-b/dist`   → `dist/tool-b/`
4. `dist/.nojekyll` を作成（必要な場合）

## Why we merge dist/
配信URL配下で複数アプリを運用するため：

- `/Japan-Bio-Tools/`（portal）
- `/Japan-Bio-Tools/sse-diag/`
- `/Japan-Bio-Tools/tool-b/`

## Notes
- 各 app の `vite.config.ts` の `base` はリポジトリ名に依存する。
- リポジトリ名を変えたら `base` を合わせて更新する。
