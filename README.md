# Japan-Bio-Tools

Japan-Bio-Tools は、ブラウザ完結・サーバーレスで動作する構造バイオインフォマティクス向けモノレポです。

## 現役導線
- `apps/portal`（公開入口）
- `apps/biofile-guide`（BioFile Guide for Structure, 準備中）

## Archive（退役済み参照用）
- `archive/apps/sse-diag`
- `archive/docs/sse-diag`
- `archive/ci-repro-check`

archive は参照用であり、通常の workspace / build / deploy 主経路には含めません。

## Root Commands

```bash
npm ci
npm run dev:portal
npm run dev:biofile-guide
npm run build:pages
```

## GitHub Pages
- Portal: `/Japan-Bio-Tools/`
- BioFile Guide for Structure: `/Japan-Bio-Tools/biofile-guide/`
