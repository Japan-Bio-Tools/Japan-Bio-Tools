# Dev Setup

## Requirements
- Node: v24.x（GitHub Actions と揃える）
- npm: v11.x

## Install
リポジトリルートで：

```bash
npm ci
Local dev
sse-diag を起動
bash
コードをコピーする
npm -w apps/sse-diag run dev
portal を起動
bash
コードをコピーする
npm -w apps/portal run dev
tool-b を起動
bash
コードをコピーする
npm -w apps/tool-b run dev
Build
個別ビルド（例：sse-diag）
bash
コードをコピーする
npm -w apps/sse-diag run build
Pages用（dist統合）
bash
コードをコピーする
npm run build:pages
Notes
Vite base
GitHub Pages 配下でアセット解決するため、各アプリは base を固定する。

portal: /Japan-Bio-Tools/

sse-diag: /Japan-Bio-Tools/sse-diag/

tool-b: /Japan-Bio-Tools/tool-b/

リポジトリ名を変更した場合は、各 app の base を合わせて更新する。

Windows / OneDrive の注意
OneDrive 同期下でビルドが不安定になることがある（ローカルで問題→GitHub ActionsではOK、など）

変なビルド落ちが続く場合は、同期の影響を疑って作業ディレクトリを移す

yaml
コードをコピーする

---

もし次に「差分が出る診断UI（HUD/トグル/差分表/クリックハイライト）」までドキュメントに踏み込むなら、**roadmap.md と 引継ぎ資料.md に “MVP-0のExit条件（Aha体験）” をもう少し定量化**（例：クリックでフォーカス、diff上位N表示、所要操作数など）して、ブレないようにもできます。
::contentReference[oaicite:0]{index=0}