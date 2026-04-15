# 判定表詳細

## この文書の位置づけ

この文書は、BioFile Guide for Structure の判定対象、ID正規化、`resolved_format`、`record_type`、`source_database`、`legacy_pdb_compatibility`、success / error / unknown 分岐、競合時の扱い、断定禁止条件の詳細正本である。
親正本は [`../設計書.md`](../設計書.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。

この文書は、UI文言、reason / evidence code、URLテンプレート、匿名計測、実装順序の詳細正本ではない。

---

## 判定表の基本方針

判定契約では、対象入力と対象外入力を混同しない。
対象入力で根拠不足または根拠競合がある場合は unknown に落とし、形式不正や構文破損は error として扱う。
`record_type` と `source_database` は誤断定コストが高いため、強い根拠同士が競合する場合は積極的に `unknown` を選ぶ。

---

## 3. 対象範囲

### 3-1. 判定対象

MVP時点の判定対象は以下に限定する。

* 4文字PDB ID
* 拡張PDB ID
* ローカルPDBファイル
* ローカルmmCIFファイル

### 3-2. 判定対象外

以下はMVPの判定対象外とする。

* chain抽出
* water除去
* backbone-only 出力
* 構造比較
* 変異影響推定
* 相互作用解析
* 妥当性スコア計算
* 独自レンダリング
* サーバー保存前提の履歴管理

### 3-3. 判定不能と対象外の違い

* **判定不能**: 対象入力ではあるが、根拠不足または根拠競合のため unknown を返す状態
* **対象外**: そもそも本プロダクトが扱わない入力や要求

---

## 6. ソース競合時の優先順位表

### 6-1. フィールド群ごとの優先順位

| フィールド群                                    | 第1優先     | 第2優先     | 第3優先     | 競合時の扱い                     |
| ----------------------------------------- | -------- | -------- | -------- | -------------------------- |
| canonical identifier / entry existence    | RCSB     | PDBe     | PDBj     | Primary優先。Primary不達時のみ下位採用 |
| experiment method                         | RCSB     | PDBe     | PDBj     | Primary優先。Primary欠損時のみ補完   |
| archive-level metadata                    | RCSB     | PDBe     | PDBj     | Primary優先                  |
| cross-reference / supplementary metadata  | PDBe     | RCSB     | PDBj     | 補助扱い。主判定の一次根拠にはしない         |
| Japanese guidance / local viewer guidance | PDBj     | -        | -        | 導線用途のみ                     |
| provenance for AlphaFoldDB / ModelArchive | 強い直接根拠のみ | 強い直接根拠のみ | 強い直接根拠のみ | 強い直接根拠が競合したら unknown       |

### 6-2. 競合ルール

* Primary と Secondary が同じ結論なら、その結論を採用する
* Primary が直接根拠を持ち、Secondary が弱い間接根拠のみなら、Primary を採用する
* Primary と Secondary が**ともに強い直接根拠**を持ちつつ結論が競合する場合、勝手に寄せず `unknown` に倒す
* 補助的な非中核フィールドが競合した場合は Primary を採用する
* `record_type` と `source_database` は誤断定コストが高いため、競合時は積極的に `unknown` を選ぶ

---

## 9. ID正規化契約

### 9-1. 4文字PDB ID

wwPDB は拡張ID移行前の従来型 PDB ID を4文字で運用してきた。 ([wwpdb.org](https://www.wwpdb.org/documentation/new-format-for-pdb-ids?utm_source=chatgpt.com))

| 項目                        | 契約          |
| ------------------------- | ----------- |
| 受理条件                      | 英数字4文字      |
| 入力時                       | 前後空白除去      |
| canonical 表現              | 大文字4文字      |
| `resolved_identifier`     | canonical 値 |
| `entry_resolution_status` | API照会結果で決定  |

### 9-2. 拡張PDB ID

wwPDB は拡張PDB ID を `pdb_00001abc` 形式で案内している。拡張IDは mmCIF 側で保持される。 ([wwpdb.org][5])

| 項目                        | 契約                  |
| ------------------------- | ------------------- |
| 受理条件                      | `pdb_` + 8文字英数字     |
| 入力時                       | 前後空白除去              |
| canonical 表現              | 小文字 `pdb_` + 小文字8文字 |
| `resolved_identifier`     | canonical 値         |
| `entry_resolution_status` | API照会結果で決定          |

### 9-3. 正規化失敗

* 形式要件を満たさない場合は `invalid_identifier`
* 正規化できたが API で存在確認不能の場合は `not_found` または `unresolved`
* 形式不正と存在不明を混同してはならない

---

## 15. `resolved_format` 契約

### 15-1. 用語の固定

`resolved_format` は、**解決または解釈された対象フォーマット**を意味する。
入力形式そのものを意味しない。

### 15-2. 判定ルール

* 4文字PDB ID 入力 → 原則 `pdb`
* 拡張PDB ID 入力 → 原則 `mmcif`
* ローカルPDB 構文成立 → `pdb`
* ローカルmmCIF 構文成立 → `mmcif`
* 判定不能 → `unknown`

---

## 16. 判定表

### 16-1. `record_type`

優先順位は以下。

1. 実験構造を直接示す明示メタデータあり → `experimental_structure`
2. ModelCIF系など計算モデルを直接示す明示メタデータあり → `computed_model`
3. IHM系など integrative/hybrid を直接示す明示メタデータあり → `integrative_structure`
4. 入力IDや由来情報から強く一意推定できる → 対応する値
5. 弱い状況証拠のみ → 原則 `unknown`
6. 強い根拠同士が競合 → `unknown`

### 16-2. `source_database`

* PDB ID / 拡張PDB ID 入力で canonical archive entry として解決 → `PDB`
* ローカルファイルで AlphaFoldDB provenance の強い直接根拠あり → `AlphaFoldDB`
* ローカルファイルで ModelArchive provenance の強い直接根拠あり → `ModelArchive`
* ローカルファイルで強い provenance なし → `local_file`
* 判定不能 → `unknown`

### 16-3. `legacy_pdb_compatibility`

* 旧PDB形式で安全に扱える根拠が十分ある → `compatible`
* 情報欠落リスクがあるが断定不能 → `caution`
* 拡張PDB ID前提、integrative、mmCIF前提表現など旧PDB非互換が明確 → `incompatible`
* 根拠不足 → `unknown`

### 16-4. `model_count` / `chain_count`

* 明確に取得可能 → 実数
* 未取得・判定不能 → `null`

### 16-5. `ligand_status` / `water_status`

* 検出あり → `detected`
* 検出なし → `not_detected`
* 検出不能・未判定 → `unknown`

---

## 成功応答の整合性ルール（判定値）

* `model_count=0` および `chain_count=0` を未判定値として使ってはならない
* `ligand_status=not_detected` は「検出しなかった」を意味し、検出不能時は `unknown` を使う

---

## 20. unknown / error の出し分け真理値表

### 20-1. 基本原則

* **形式不正**は error
* **構文破損**は error
* **分類不能**は success + unknown
* **外部API一時障害でも前進可能なら success + unknown**
* **外部API障害で前進も不能なら error**

### 20-2. 条件表

| 条件                                          | 応答                                    |
| ------------------------------------------- | ------------------------------------- |
| 入力なし                                        | `error.empty_input`                   |
| PDB ID / 拡張PDB ID の形式不正                     | `error.invalid_identifier`            |
| ローカルファイルの構文解析失敗                             | `error.parse_failed`                  |
| ローカルファイルがサイズ上限超過                            | `error.file_too_large`                |
| ローカル解析が時間上限超過                               | `error.timeout_exceeded`              |
| IDは妥当、Primary/Secondary のいずれかで存在確認成功、分類根拠十分 | `success`                             |
| IDは妥当、存在確認成功、根拠不足                           | `success` + `unknown`                 |
| IDは妥当、存在確認成功、強い根拠競合                         | `success` + `unknown`                 |
| IDは妥当、Primary失敗、Secondary成功、分類可能            | `success`                             |
| IDは妥当、Primary失敗、Secondary成功、根拠不足            | `success` + `unknown`                 |
| IDは妥当、Primary/Secondary ともに「存在なし」を返す        | `error.entry_not_found`               |
| IDは妥当、全API失敗、静的導線で前進可能                      | `success` + `unknown`                 |
| IDは妥当、全API失敗、前進導線も安全に返せない                   | `error.external_metadata_unavailable` |

### 20-3. MVP運用上の強調

通常系では `success + unknown` を優先し、`error.external_metadata_unavailable` は**安全な前進導線も返せない場合に限る**。

---

## 断定禁止条件

以下は既存契約を判定表側から読みやすく並べ直したものであり、新しい判定要件ではない。

* 弱い状況証拠のみで `record_type` を断定してはならない。
* 強い根拠同士が競合する場合、勝手に寄せず `unknown` に倒す。
* `record_type` と `source_database` は誤断定コストが高いため、競合時は積極的に `unknown` を選ぶ。
* `entry_resolution_status=verified` ではない状態を、実在確認済みとして扱ってはならない。
* 形式不正と存在不明を混同してはならない。
* `0` を未判定の代用として使ってはならない。
* boolean で `unknown` を内包してはならない。


[5]: https://www.wwpdb.org/documentation/new-format-for-pdb-ids?utm_source=chatgpt.com "Extended PDB ID With 12 Characters"

