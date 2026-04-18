# Security & Privacy（Local-only / 外部送信しない）

## データ取り扱い（最重要）
- ツールは **ユーザーのローカルファイル（PDB/mmCIF）** をブラウザで読み込む。
- **読み込んだ構造データを外部サーバへ送信しない。**
- 永続キャッシュの初期実装では、**identifier 入力の正規化済み識別子と判定結果のみ** をブラウザ `localStorage` に保持する（TTLあり）。
- **ローカルファイル本文・ファイル名・raw text は `localStorage` に保存しない。**
- 解析・可視化・差分生成は **ブラウザ内（JS/WASM）で完結**させる。

## ネットワーク方針
- `VITE_BIOFILE_GUIDE_ADAPTER_MODE` の既定値は `mock` であり、このモードでは外部 metadata API へ問い合わせない。
- `real_rcsb` / `real_pdbe` / `real_pdbj` を明示的に選んだ場合のみ、対応する公開 metadata API を read-only で参照する。
- 外部参照時に送信してよい値は、正規化済み識別子と API 問い合わせに必要な最小パラメータに限定する。
- **ローカル投入ファイル本文・座標・ファイル名・raw text は外部送信しない。**

## 匿名計測方針
- 追加の Analytics/Telemetry SDK は導入していない。
- 匿名計測は UI から opt-in / opt-out を切り替えられ、`VITE_BIOFILE_GUIDE_ANONYMOUS_TELEMETRY_ENDPOINT` が設定され、かつ opt-in が `true` のときだけ送信する。
- 送信 payload は `event_code` と `event_category` のみとし、raw structure data や識別子を含めない。

## ホスティング
- GitHub Pages に静的ホスティングする。
- 生成物は `dist/` の静的ファイルのみ。
- バックエンドサービスは使わない。

## PRレビュー用チェックリスト
- [ ] ファイル内容を外部送信するコード経路がない
- [ ] `adapter mode` の既定が `mock` で、real mode は明示切替になっている
- [ ] real mode でも外部送信が識別子中心の最小パラメータに限定されている
- [ ] 依存関係が “勝手に通信” しない（SDK/Telemetry等）
- [ ] 匿名計測が opt-in 前提で、識別子・入力本文・ファイル名を送信しない
