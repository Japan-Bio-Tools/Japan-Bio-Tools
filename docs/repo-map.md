# リポジトリマップ

## 概要

本リポジトリは npm workspaces を用いたモノレポ構成です。
現役公開導線は `portal` と `biofile-guide` に限定し、退役資産は `archive/` に分離しています。

## トップレベル構成

```
/
├─ apps/
│  ├─ portal/
│  └─ biofile-guide/
├─ packages/
├─ docs/
│  └─ biofile-guide/
├─ scripts/
├─ archive/
│  ├─ apps/sse-diag/
│  ├─ docs/sse-diag/
│  └─ ci-repro-check/
└─ .github/workflows/
```

## 現役アプリ

### apps/portal
- 入口ページ（公開パス: `/Japan-Bio-Tools/`）
- 現役導線を `biofile-guide` へ案内する

### apps/biofile-guide
- 本命アプリ（準備中）
- 公開パス: `/Japan-Bio-Tools/biofile-guide/`

## Archive

### archive/apps/sse-diag
- SSE-Diag 本体（退役済み参照用）
- root workspace / root scripts / Pages build の主経路には含めない

### archive/docs/sse-diag
- SSE-Diag の旧正本ドキュメント群（退役済み参照用）

### archive/ci-repro-check
- 旧CI再現用スナップショット（退役済み）

## Build / Deploy 対象

- 対象: `apps/portal`, `apps/biofile-guide`
- 非対象: `archive/` 配下全体
