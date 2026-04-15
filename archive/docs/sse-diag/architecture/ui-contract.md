# UI 契約

この文書は、Japan-Bio-Tools における SSE-Diag の HUD / Table / Diag / Viewer の責務、Viewer の非再解釈原則、DiffRow、selection の UI 整合性の詳細正本である。  
親正本は [`../architecture.md`](../architecture.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。  
この文書は状態定義、Diagnosis Pipeline 契約、SSE Engine 契約、Mol* 境界を定義しない。

---

## HUD / Table / Diag / Viewer の責務

### HUD の責務

- 状態表示
- 現在表示の明示
- 現在位置の明示
- 最小ナビ（Prev / Next）
- baseline resolved source の要約表示
- override algorithm の要約表示
- coverage の要約表示

### Table の責務

- 全体把握
- filter / sort
- 行選択
- selection の正本 UI

### Diag の責務

- Contract detail
- Engine detail
- ExecutionRecord 参照
- 監査の深掘り
- provenance / fidelity / compatibility の表示
- capability / degradation / coverage の表示
- unavailable reasons の表示

### Viewer の責務

- 3D 根拠表示
- selection / highlight / focus の反映
- baseline と override の視覚分離

---

## Viewer の非再解釈原則

Viewer は service 結果を **表示・採用・破棄** してよい。  
ただし、結果の意味を再構築してはならない。

具体的に Viewer がやってはいけないことは次である。

- `comparison_summary` の再導出
- `comparison_status` の再判定
- `diff_rows` の再分類
- Contract の detail 補完
- `override_profile` の再構築
- `fidelity_class` / `compatibility_claim` の補完
- capability / degradation / coverage の再判定
- unavailable reasons の推測補完
- service 結果を UI 用に意味変換し直すこと

Viewer に許容されるのは、**表示のための最小整形** のみである。  
この最小整形は、列幅、表示順、視覚的グルーピング、非意味論的なプレゼンテーション調整を指す。  
比較意味論、分類、状態、監査条件の再計算は含まない。

つまり、Viewer は  
**結果の意味を再構築せず render する shell**  
であり、診断意味論の再計算場所ではない。

---

## Known-Methods Pivot の表示契約

### HUD の表示

HUD は、現在採用中 run の最小要約として次を表示できること。

* baseline resolved source
* override algorithm
* coverage
* comparison status

HUD は、coverage を `mapped_rate` の代替として表示してはならない。  
coverage と `mapped_rate` の意味は [状態モデル](state-model.md) と [SSE Engine 契約](sse-engine.md) を正本とする。

### Diag の表示

Diag は、監査用に次を表示できること。

* `fidelity_class`
* `compatibility_claim`
* `implementation_origin`
* `implementation_reference`
* `upstream_version_label`
* capability
* degradation
* coverage
* unavailable reasons
* `baseline_source_kind`
* `baseline_resolved_source`
* `baseline_annotation_origin`

Diag は、未設定の provenance を推測で埋めてはならない。  
未設定であること自体を監査可能にする。

### baseline / override の視覚分離

UI は、Baseline と Override を視覚的に分離して表示する。  
Baseline は Mol* auto、Override は known method Engine 由来であることを、比較状態と混同しない形で示す。

---

## Diff Table 契約

### DiffRow の定義

最低限、以下を持つ。

- `residue_key`
- `display_residue`
- `baseline_label`
- `override_label`
- `kind`
- `kind_label`
- `sort_key`
- `filterable`

### 原則

- `residue_key` = machine key
- `display_residue` = human-readable label
- UI では原則 `display_residue` を使う

### unmapped / ambiguous

これらは review point table に混ぜない。

---

## selection 整合性の UI 観点

selection の構造定義は [状態モデル](state-model.md) を正本とする。  
UI 上の selection の主権は SSE-Diag 内の shell / Viewer が持つ。
ただし、その selection は **現在採用中の `diff_rows` に必ず整合していなければならない。**

#### 整合ルール

* `selectedDiffIndex` は現在採用中 `diff_rows` の範囲内であること
* `selectedDiffRow` は現在採用中 `diff_rows[selectedDiffIndex]` と一致すること
* run が切り替わって `diff_rows` が変わった場合、旧 selection はそのまま残してはならない
* 旧 selection と同じ `residue_key` を持つ row が新しい adopted `diff_rows` に存在する場合のみ、選択維持を許容してよい
* 一致が確認できない場合は clear する
* 維持した場合も index は新 `diff_rows` 上で再解決する
* Mol* highlight / focus は現在採用中 selection のみを反映する

#### 禁止事項

* 新 run 採用後に、旧 run の `selectedDiffRow` を残すこと
* `comparison_summary` は新しいのに selection だけ古いままにすること
* viewer highlight が現在採用中 row と一致しないこと
