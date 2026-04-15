# unknown UI 文言仕様

## この文書の位置づけ

この文書は、BioFile Guide for Structure の unknown / error 表示、warning 表示文、warning 表示順、confidence、3カードUI、入力画面、外部遷移表示の詳細正本である。
親正本は [`../設計書.md`](../設計書.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。

この文書は、分類ロジック、reason / evidence code、URLテンプレート、匿名計測、実装順序の詳細正本ではない。

---

## unknown 表示の基本契約

unknown は失敗ではなく、根拠不足または根拠競合を無理に断定しないための正しい出力である。
UI は、分からない理由、確認済み事実、次の一手を表示し、ユーザーを止めずに前へ進める。
unknown / error の分岐条件は [判定表詳細](decision-table.md) を正本とする。

---

## 21. `confidence` 契約

`confidence.scope` は固定値 `primary_classification` とする。
`confidence.level` は以下に対する総合信頼度である。

* `record_type`
* `source_database`

レベル判定:

* `high`: 明示的で直接的な根拠が複数ある
* `medium`: 明示的根拠が1つ、または間接根拠が複数ある
* `low`: 間接根拠のみ、または根拠が弱い

設計ルール:

* `low` で強い断定をしない
* `low` のときは unknown フォールバックを優先する
* `high` は evidence の質で決める
* この値をカード2の互換性判定へ転用してはならない

---

## 18. `warning_codes → beginner_warning` 生成契約

### 18-1. 基本原則

`warning_codes` は安定キーであり、`beginner_warning` はそのキーから生成される表示文である。

### 18-2. 生成ルール

* 固定マッピングで実装する
* 自由文生成は禁止
* 承認済みテンプレ群からのみ生成する
* UIは語尾や改行の調整だけ行ってよい
* 意味の追加・削除・強調変更はしてはならない

### 18-3. 例

| warning_code                                | beginner_warning テンプレ例              |
| ------------------------------------------- | ----------------------------------- |
| `legacy_pdb_risk`                           | この構造は旧PDB形式へ落とすと情報が欠ける可能性があります。     |
| `multiple_models_present`                   | 複数モデルを含むため、最初に見るモデルの選び方に注意してください。   |
| `origin_uncertain`                          | 出自を断定できないため、原典情報の確認を先に行ってください。      |
| `external_metadata_temporarily_unavailable` | 外部情報の一部を今は確認できないため、分かる範囲だけを案内しています。 |

---

## 19. warning 表示順契約

### 19-1. 基本原則

複数 warning が同時に立つ場合、表示順を実装者裁量にしてはならない。
`beginner_warning` は、**warning_priority_table** に従って並べる。

### 19-2. warning_priority_table

| 優先順位 | warning_code                                |
| ---- | ------------------------------------------- |
| 1    | `legacy_pdb_risk`                           |
| 2    | `origin_uncertain`                          |
| 3    | `classification_low_confidence`             |
| 4    | `integrative_representation_caution`        |
| 5    | `external_metadata_temporarily_unavailable` |
| 6    | `multiple_models_present`                   |
| 7    | `multiple_chains_present`                   |
| 8    | `ligand_present`                            |
| 9    | `water_present`                             |

### 19-3. 表示ルール

* 高優先 warning を先頭に並べる
* 同順位は code 名の昇順で固定してよい
* UI は順序を変更してはならない
* 先頭3件を優先表示し、残りは折りたたみでもよい

---

## 24. UI 契約

### 24-1. 画面一覧

* 入力画面
* 判定結果画面
* エラー/対象外案内領域
* 利用上の注意・免責表示
* プライバシー/計測方針表示
* ローカル閲覧ガイドまたは内部ガイド

### 24-2. 入力画面

* 対応入力を明示する
* 保存しないことを近接表示する
* ID入力時のみ外部メタデータ照会が起こりうることを明示する
* 深い解析はしないことを明示する

### 24-3. 結果画面

結果画面は3カード固定。

**カード1: この入力は何者か**
`record_type`, `resolved_format`, `source_database`, `experiment_method`, `confidence`

**カード2: 最初に気をつけること**
`beginner_warning`, `legacy_pdb_compatibility`, `legacy_pdb_reason_text`, `model_count`, `chain_count`, `ligand_status`, `water_status`

**カード3: 次に開く場所**
`recommended_next_step`, `next_links`

### 24-4. `resolved_identifier` のUI注意

UI は `resolved_identifier` の有無だけで実在確認済みと見せてはならない。
実在確認は `entry_resolution_status=verified` のときに限る。

### 24-5. warning 表示順

`beginner_warning` の表示順は `warning_priority_table` に従う。
UI はこの順序を変更してはならない。
表示は先頭3件を優先表示し、残りは折りたたみ可能とする。

### 24-6. 外部遷移表示

`canonical_entry`, `viewer_remote`, `search_entry` は外部遷移表示を必須とする。

* 外部遷移ラベルは**リンクラベルの右側**に固定表示する
* 表示形式は「外部サイト」または外部リンクアイコンのいずれかに統一する
* 同一UI内で混在させない

### 24-7. unknown / error 表示

unknown の場合は、断定できない理由、確認済み事実、次の一手を必須表示する。
error の場合も、できなかったこと、理由、次の一手、最低1件の導線を必須表示する。

---

## 禁止文言・禁止表示

以下は既存契約を UI 文言側から読みやすく並べ直したものであり、新しい表示要件ではない。

* `low` で強い断定をしない。
* `confidence` をカード2の互換性判定へ転用してはならない。
* `warning_codes` から自由文を生成してはならない。
* UI は warning の表示順を変更してはならない。
* UI は `resolved_identifier` の有無だけで実在確認済みと見せてはならない。
* 外部遷移を内部遷移のように見せてはならない。
* error の場合も、できなかったこと、理由、次の一手、最低1件の導線を必須表示する。

