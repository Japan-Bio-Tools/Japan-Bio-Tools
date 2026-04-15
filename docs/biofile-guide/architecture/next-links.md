# next_links 選定仕様

## この文書の位置づけ

この文書は、BioFile Guide for Structure の URLテンプレート、`next_links`、`destination_type`、`recommended_next_step_code`、リンク最低保証の詳細正本である。
親正本は [`../設計書.md`](../設計書.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。

この文書は、分類ロジック、UI文言、匿名計測、実装順序の詳細正本ではない。

---

## next_links の目的

`next_links` は、判定結果のあとにユーザーが安全に前進するための導線である。
公式サービス群と競合するためではなく、RCSB / PDBe / PDBj / Mol* / iCn3D などを正しく使えるようにするための翻訳結果として返す。

---

## 10. URLテンプレート契約

### 10-1. 基本原則

`next_links.href` は、**allowlist 済み URL テンプレート**と `resolved_identifier` からのみ生成する。
任意文字列連結は禁止する。

### 10-2. テンプレートトークン

実装で使ってよいトークンは以下のみ。

* `{id}`
* `{id_upper}`
* `{id_lower}`

### 10-3. 代表テンプレート

allowlist 候補は以下。

* RCSB entry
* PDBe entry
* PDBj entry
* Mol* remote viewer
* iCn3D remote viewer
* PDBj Molmil local guide
* プロダクト内 guide
* 必要に応じた公式検索入口

### 10-4. ローカル無ID時

ローカルファイルで `resolved_identifier=null` の場合、canonical entry への雑なホーム遷移で埋めてはならない。
`viewer_local_guide` か `guide_article` を返す。

---

## 22. `next_links` 契約

### 22-1. `destination_type`

* `canonical_entry`
* `viewer_remote`
* `viewer_local_guide`
* `guide_article`
* `search_entry`
* `internal_guide`

### 22-2. 選定原則

* 原典確認が必要なら `canonical_entry`
* まず構造を見たいなら `viewer_remote`
* ローカル無IDなら `viewer_local_guide`
* unknown の場合は原典確認可能なら原典を優先
* 実行不能なリンクは返してはならない

### 22-3. Mol* と iCn3D の扱い

* `viewer_remote` の第一候補は Mol* でよい
* iCn3D は必要時の代替または補助候補として返してよい
* Mol* を第一候補にしても、判定基盤を Mol* 依存にしてはならない

### 22-4. 最低保証

* すべての結果で最低1件の `next_links` を返す
* unknown で canonical entry がある場合は最低1件の `canonical_entry` を含める
* ローカル無IDでは最低1件の `viewer_local_guide` または `guide_article` を含める

---

## 23. `recommended_next_step_code`

* `open_rcsb_entry`
* `open_pdbe_entry`
* `open_pdbj_entry`
* `open_molstar_remote`
* `open_icn3d_remote`
* `open_molstar_local_guide`
* `open_molmil_local_guide`
* `check_origin_metadata`
* `check_format_and_retry`
* `read_beginner_guide`

---

## 成功応答の整合性ルール（next_links / recommended_next_step）

* `record_type` が断定されているのに `recommended_next_step` が空である状態は禁止
* unknown を返す場合でも `recommended_next_step` は必須
* `next_links` は0件不可

---

## unknown / error 時のリンク方針

unknown / error の分岐条件は [判定表詳細](decision-table.md) を正本とする。
UI 表示は [unknown UI 文言仕様](unknown-ui.md) を正本とする。
本書では、`next_links` と `recommended_next_step_code` が空にならないこと、allowlist テンプレート以外を使わないことを正本とする。

