# 実装手順書

## この文書の位置づけ

この文書は、BioFile Guide for Structure の初期コーディング順序、各ステップの DoD、先に固定すべき型や契約、UI に入ってよい境界、実装禁止事項の詳細正本である。
親正本は [`../設計書.md`](../設計書.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。

この文書は、長期構想や仕様追加のロードマップではない。
初期実装で迷わないために、既存設計契約を実装順序へ並べ替える。

---

## 最初に読む順序

1. [`../設計書.md`](../設計書.md) で親正本の不変条件と詳細正本一覧を確認する。
2. [詳細設計書](detailed-design.md) で DTO、応答スキーマ、adapter、merge strategy、classification engine、builder、formatter の境界を確認する。
3. [判定表詳細](decision-table.md) で判定対象、ID正規化、分類、unknown / error 分岐を確認する。
4. [reason / evidence code 定義書](reason-evidence-codes.md)、[unknown UI 文言仕様](unknown-ui.md)、[next_links 選定仕様](next-links.md) を接続する。
5. [匿名計測仕様](anonymous-telemetry.md) と [ゴールドセット定義書](gold-set.md) で計測と検証を確認する。

---

## 初期コーディング順序

| 順序 | 作る単位 | DoD |
| --- | --- | --- |
| 1 | 型と列挙値 | `schema_version`、success / error envelope、DTO、主要 enum が詳細正本どおりに定義されている |
| 2 | Input Normalizer | 空入力、4文字PDB ID、拡張PDB ID、ローカルPDB、ローカルmmCIF、対象外を判定表どおりに分けられる |
| 3 | Identifier Resolver / Local Parser | ID正規化、`entry_resolution_status`、ローカル構文成立/失敗を契約どおり返せる |
| 4 | Metadata Adapter と mock | RCSB / PDBe / PDBj の差分を正規化DTOへ落とし、CI で mock または recorded fixture を使える |
| 5 | Merge Strategy | Primary / Secondary / Tertiary の優先順位と強い根拠競合時の unknown を再現できる |
| 6 | Classification Engine | `record_type`、`source_database`、`legacy_pdb_compatibility`、`resolved_format`、三値 status を判定表どおりに返せる |
| 7 | Evidence / Warning Builder | evidence 必須条件、metadata unavailable 系、warning 固定マッピング、表示順を契約どおりに返せる |
| 8 | Next Link Selector | allowlist テンプレートだけで `next_links` と `recommended_next_step_code` を返せる |
| 9 | Result Formatter | success / error envelope と 3カードUIに必要な値を欠落なく整形できる |
| 10 | UI | 3カード、unknown / error、外部遷移表示、`resolved_identifier` の注意を契約どおり表示できる |
| 11 | Anonymous Telemetry | 送信可能イベントだけを送り、識別子やファイル名を送らない |
| 12 | Gold Set Validation | ゴールドセットと expected output 一致基準で受け入れ確認できる |

---

## UI に入ってよい境界

UI 実装へ入る前に、少なくとも次を固定する。

* success / error envelope
* 正規化DTO
* 判定表の主要 enum
* reason / evidence / warning code
* `next_links` の destination_type と URL テンプレート
* unknown / error の出し分け
* 3カードへ渡す result 形状

UI は契約を表示する器であり、契約をねじ曲げない。

---

## 実装時の参照先

| 実装対象 | 参照先 |
| --- | --- |
| DTO、応答スキーマ、adapter、cache / retry / mock | [詳細設計書](detailed-design.md) |
| 判定対象、ID正規化、分類、unknown / error | [判定表詳細](decision-table.md) |
| reason / evidence / warning code | [reason / evidence code 定義書](reason-evidence-codes.md) |
| UI文言、3カード、warning 表示順、confidence | [unknown UI 文言仕様](unknown-ui.md) |
| next_links、URLテンプレート、recommended next step | [next_links 選定仕様](next-links.md) |
| 匿名計測 | [匿名計測仕様](anonymous-telemetry.md) |
| テスト、ゴールドセット、受け入れ条件 | [ゴールドセット定義書](gold-set.md) |

---

## 33. 実装禁止事項

* `0` を未判定の代用として使う
* boolean で `unknown` を内包する
* `"null"` を code や表示文として出す
* evidence なしで強い断定を返す
* `resolved_identifier` を「存在確認済みID」として扱う
* `resolved_identifier` を自由連結で URL 化する
* allowlist 外 URL を返す
* classification engine が外部API生レスポンスに直接依存する
* merge strategy を adapter の中へ埋め込む
* warning 文言を自由生成する
* warning の表示順を UI 側で自由に変更する
* Secondary / Tertiary の失敗痕跡を黙って捨てる
* 外部遷移を内部遷移のように見せる
* Mol* の読込成功を provenance や `record_type` の一次根拠として使う
* ローカルファイル本文を外部送信する
* 匿名計測に識別子やファイル名を含める
* `confidence` を互換性判定や全体品質の代表値として誤用する

---

