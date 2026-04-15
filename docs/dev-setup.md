# Dev Setup

## Requirements
- Node: v24.x（GitHub Actions と揃える）
- npm: v11.x

## Install
リポジトリルートで実行:

```bash
npm ci
```

## Local dev

portal を起動:

```bash
npm run dev:portal
```

biofile-guide を起動:

```bash
npm run dev:biofile-guide
```

## Build

個別ビルド（例: biofile-guide）:

```bash
npm -w apps/biofile-guide run build
```

Pages 用（dist 統合）:

```bash
npm run build:pages
```

## Vite base
GitHub Pages 配下でアセット解決するため、現役アプリは `base` を固定する。

- portal: `/Japan-Bio-Tools/`
- biofile-guide: `/Japan-Bio-Tools/biofile-guide/`

## Archive apps
`archive/apps/sse-diag` は退役済み参照用であり、root workspace の通常コマンドには含めない。
必要な場合のみ、対象ディレクトリに移動して個別実行する。
