# ゴールドセット定義書

## この文書の位置づけ

この文書は、BioFile Guide for Structure のテスト層、初期ゴールドセット、expected output 一致基準、MVP受け入れ条件の詳細正本である。
親正本は [`../設計書.md`](../設計書.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。

この文書は、実装順序や長期ロードマップの詳細正本ではない。

---

## 品質とみなすもの

品質は、判定対象/非対象、success / error / unknown、reason / evidence、warning、next_links、匿名計測、3カードUIが契約どおりに成立していることで確認する。
ゴールドセットは、判定表との突合、unknown の妥当性確認、next_links の妥当性確認、受け入れ条件の確認に使う。

---

## 30. テスト戦略

### 30-1. テスト層

* parser unit test
* adapter unit test
* merge strategy unit test
* classification engine unit test
* warning builder unit test
* next link selector unit test
* recorded fixture contract test
* UI snapshot / render test

### 30-2. ゴールドセット

最低限含める。

* 4文字PDB ID
* 拡張PDB ID
* ローカルPDB
* ローカルmmCIF
* 実験構造
* 予測構造
* integrative structure
* 複数モデル
* 複数鎖
* ligand 含有
* water 含有
* unknown 正答ケース
* invalid_identifier
* parse_failed
* file_too_large
* external metadata 一時障害ケース
* API source conflict case
* entry_not_found case

provider adapter 系の回帰は recorded fixture を正本とし、CI 本線で live API を直叩きしない。

### 30-3. expected output 一致基準

厳密一致:

* `status`
* `schema_version`
* `input_type`
* `resolved_format`
* `record_type`
* `source_database`
* `legacy_pdb_compatibility`
* `recommended_next_step_code`
* `error.error_code`
* `unknown_reason_code`
* `entry_resolution_status`

値または null 一致:

* `resolved_identifier`
* `experiment_method`
* `model_count`
* `chain_count`
* `legacy_pdb_reason_code`

列挙値一致:

* `ligand_status`
* `water_status`
* `confidence.scope`
* `confidence.level`

順序非依存の集合一致:

* `warning_codes`
* `evidence.code`
* `next_links.destination_type`

意味一致:

* `beginner_warning`
* `recommended_next_step`
* `legacy_pdb_reason_text`
* `error.message`
* `error.reason`

---

## 32. 受け入れ条件

本統合完全版に対するMVP受け入れ条件は以下とする。

* 判定対象/非対象が守られている
* 成功応答と失敗応答が本書どおり返る
* `resolved_format` が導入され、意味が固定されている
* `resolved_identifier` が存在確認済みを意味しないことが実装とUIで守られている
* `entry_resolution_status` が実装されている
* `entry_not_found` が `invalid_identifier` と分離されている
* `resolved_identifier` と URLテンプレート契約が守られている
* merge strategy が独立モジュールとして実装されている
* `record_type` / `source_database` / `legacy_pdb_compatibility` が判定表どおりに返る
* `confidence` が主判定スコープに限定されている
* `model_count` / `chain_count` に 0 sentinel を使っていない
* `ligand_status` / `water_status` が三値で返る
* provenance evidence code が実装されている
* warning builder がコード主導で動いている
* warning が `warning_priority_table` に従って表示される
* unknown / error 真理値表どおりに出し分ける
* `next_links` が allowlist テンプレートからのみ生成される
* ローカル無ID時に雑なホーム遷移で埋めていない
* Secondary / Tertiary 失敗痕跡ルールが守られている
* metadata unavailable 系の命名が統一されている
* Mol* が viewer 基盤として使われても、判定基盤が viewer 依存になっていない
* 外部遷移であることが UI 上で明示される
* キャッシュ・リトライ・mock 方針が実装に反映されている
* 匿名計測契約に違反しない
* ゴールドセットで検証可能である
* 3カードUIが契約を壊さず表示できる

---

