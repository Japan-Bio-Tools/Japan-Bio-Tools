# SSE-Diag

SSE-Diag は、Mol* を SSOT として、Mol*標準SSE（Baseline）と外部計算SSE（Override）を
**比較成立条件つき**で診断するツールです。

## このアプリの価値
- 比較不能を差分に混ぜない
- 比較条件を Contract として示せる
- HUD / Table / Focus で差異を追える

## 現在の開発方針
- 正本仕様は `docs/architecture.md`
- 実装は R1 → R1.5 → R2 → R2.5 → R3 → R4 の順に進める
- Mol*依存は adapter 境界に閉じ込める
- 計算コアは将来 Rust / WASM に置換可能にする

## Dev

リポジトリルートで:

```bash
npm run dev:sse-diag

Build
npm -w apps/sse-diag run build
Notes
ローカルファイル（mmCIF / PDB）は外部送信しない
Mol* が構造データの一次ソース（SSOT）
比較条件や状態機械は docs/architecture.md を参照