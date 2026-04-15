# reason / evidence code 定義書

## この文書の位置づけ

この文書は、BioFile Guide for Structure の `legacy_pdb_reason_code`、`evidence.code`、`unknown_reason_code`、`warning_codes`、metadata unavailable 系、evidence 必須条件の詳細正本である。
親正本は [`../設計書.md`](../設計書.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。

この文書は、判定表、UI文言、URLテンプレート、匿名計測、実装順序の詳細正本ではない。

---

## reason / evidence の基本契約

reason / evidence は、結論を強く見せるための飾りではない。
結論、unknown、warning、legacy PDB 互換性の理由を、UI と検証が追える粒度で渡すための安定キーである。

---

## 成功応答の整合性ルール（reason / evidence）

* `confidence.level=high` なのに `evidence` が空である状態は禁止
* `record_type != unknown` のとき、対応する直接または強い evidence を最低1件必須
* `source_database=AlphaFoldDB` または `ModelArchive` のとき、対応する強い provenance evidence を必須
* `legacy_pdb_compatibility` が `caution` または `incompatible` の場合、理由コードと理由文を必須

---

## 17. code 一覧

### 17-1. `legacy_pdb_reason_code`

* `extended_id_requires_mmcif`
* `integrative_not_supported_in_pdb`
* `mmcif_only_representation`
* `size_or_schema_risk`
* `unknown_origin`

`null` は値の欠如であり、コードではない。
文字列 `"null"` を出力してはならない。

### 17-2. `evidence.code`

* `explicit_exptl_method`
* `explicit_modelcif_marker`
* `explicit_ihm_marker`
* `pdb_identifier_detected`
* `extended_pdb_identifier_detected`
* `explicit_pdb_archive_provenance`
* `explicit_alphafolddb_provenance`
* `explicit_modelarchive_provenance`
* `multiple_models_detected`
* `single_model_detected`
* `multiple_chains_detected`
* `single_chain_detected`
* `water_records_detected`
* `ligand_records_detected`
* `local_file_without_reliable_provenance`
* `legacy_pdb_incompatibility_marker`
* `legacy_pdb_caution_marker`
* `format_pdb_detected`
* `format_mmcif_detected`
* `metadata_primary_source_used`
* `metadata_secondary_source_used`
* `metadata_tertiary_source_used`
* `metadata_source_conflict_detected`
* `external_metadata_lookup_failed`
* `metadata_secondary_lookup_failed`
* `metadata_tertiary_lookup_failed`

### 17-3. `unknown_reason_code`

* `insufficient_evidence`
* `conflicting_evidence`
* `unresolved_provenance`
* `parse_limited`
* `unsupported_representation_boundary`
* `metadata_temporarily_unavailable`

### 17-4. `warning_codes`

* `legacy_pdb_risk`
* `multiple_models_present`
* `multiple_chains_present`
* `ligand_present`
* `water_present`
* `origin_uncertain`
* `classification_low_confidence`
* `integrative_representation_caution`
* `external_metadata_temporarily_unavailable`

### 17-5. metadata unavailable 系の役割差

| 種別                  | コード                                         | 意味                                |
| ------------------- | ------------------------------------------- | --------------------------------- |
| warning_codes       | `external_metadata_temporarily_unavailable` | 外部メタデータの一部が一時取得不能だったが、結果は返せている    |
| unknown_reason_code | `metadata_temporarily_unavailable`          | unknown になった主要因が外部メタデータの一時取得不能である |
| error.error_code    | `external_metadata_unavailable`             | 外部メタデータが取得不能で、かつ安全な前進導線も十分に返せない   |

---

## Secondary / Tertiary 失敗痕跡の義務化

### 27-4. Secondary / Tertiary 失敗痕跡の義務化

* Primary 成功かつ Secondary が timeout / network error / 5xx で失敗した場合、`metadata_secondary_lookup_failed` を evidence に追加する
* Primary 成功かつ Tertiary が timeout / network error / 5xx で失敗した場合、`metadata_tertiary_lookup_failed` を evidence に追加する
* これらの失敗は単独では error にしない
* 必要に応じて `external_metadata_temporarily_unavailable` を warning に追加する

---

## UI に渡す粒度

* `evidence` は `code` と `detail` の組で渡す。
* `warning_codes` は安定キーであり、表示文である `beginner_warning` は [unknown UI 文言仕様](unknown-ui.md) の固定マッピングに従う。
* `unknown_reason_code` は unknown の主要因を示す。
* `legacy_pdb_reason_code` は `null` を値の欠如として扱い、文字列 `"null"` を出力してはならない。

