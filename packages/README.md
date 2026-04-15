# Japan-Bio-Tools（packages）

`packages/` は共通化が必要になった時に利用する領域です。
現時点では本命アプリ `apps/biofile-guide` の実装準備を優先し、過度な共通化は行いません。

## 現役構成
- 現役アプリ: `apps/portal`, `apps/biofile-guide`
- 現役 docs: `docs/`（`docs/biofile-guide/` を含む）
- 現役 build/deploy: `npm run build:pages`（portal + biofile-guide のみ）

## Archive 構成
- `archive/apps/sse-diag`
- `archive/docs/sse-diag`
- `archive/ci-repro-check`

archive は参照用・退役済みであり、通常の workspace / build / deploy 主経路に含めない。

## 開発コマンド（root）

```bash
npm run dev:portal
npm run dev:biofile-guide
npm run build:pages
```
