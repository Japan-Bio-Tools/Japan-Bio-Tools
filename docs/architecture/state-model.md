# 状態モデル

この文書は、Japan-Bio-Tools における SSE-Diag の状態機械、`comparison_status`、`view_mode`、`selection`、Baseline / Override / Mapping、Baseline source、`candidate_set`、`mapped_rate`、availability / value、unavailable / degraded の比較意味論の詳細正本である。  
親正本は [`../architecture.md`](../architecture.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。  
この文書は UI 契約、Diagnosis Pipeline 契約、SSE Engine 契約、Mol* 境界を定義しない。

---

## `comparison_status` の定義

比較成立度を表す。

- `full`
- `partial`
- `baseline_only`

意味:

- `full`: Baseline / Override / Mapping / Diff が成立
- `partial`: Baseline は成立、Override / Mapping / Diff の一部が未成立
- `baseline_only`: Baseline のみ成立

---

## `view_mode` の定義

現在ユーザーが見ている表示。

- `baseline`
- `override`

---

## `selection` の定義

現在選択している review point。

- `selectedDiffIndex`
- `selectedDiffRow`
- `current kind_label`
- `current display_residue`

---

## Baseline / Override / Mapping の定義

### Baseline の定義

- Mol* 標準 SSE を Baseline とする
- 取得条件は `baseline_profile` として記録可能
- Baseline は現段階では Mol* auto を維持する

#### baseline source の定義

Baseline source は次で表す。

- `baseline_source_kind`
- `baseline_resolved_source`
- `baseline_annotation_origin?`

`baseline_source_kind` は、Baseline がどの種類の source から得られたかを表す。  
現段階の値は `molstar_auto` とする。

`baseline_resolved_source` は、実際に解決された Baseline source の表示・監査用ラベルである。  
例として、Mol* auto により解決されたことを示す値を持つ。

`baseline_annotation_origin?` は将来拡張用の optional 項目である。  
構造ファイル内 annotation や外部 annotation を Baseline として扱う拡張を行う場合にのみ使う。現段階では Baseline を Mol* auto から動かさない。

#### baseline_profile の生成原則

`baseline_profile` は、単なる自由記述ではない。  
少なくとも `baseline_source_kind`、`baseline_resolved_source`、必要に応じて `baseline_annotation_origin` から読める Baseline 条件の要約として扱う。

### Override の定義

- Engine が計算した SSE を Override とする
- Mol* viewer 側へ注入・上書き可能であること
- 計算条件は `override_profile` として記録可能
- Override は known methods を軸にし、Engine metadata と coverage を伴う

#### override_profile の生成原則

`override_profile` は、Viewer が入力した生の文字列をそのまま採用する概念ではない。  
これは **実際に解決・実行された Engine 条件の要約** として扱う。

したがって `override_profile` は、少なくとも以下から組み立ててよい。

- `requested_engine_key`
- `resolved_engine_id`
- `engine metadata`
- `effective_params`
- `fidelity_class`
- `compatibility_claim`
- `implementation_origin`
- `implementation_reference`
- `upstream_version_label`
- `coverage`

つまり、`override_profile` は **requested 条件ではなく effective 条件ベース** に寄せる。  
各 Engine metadata の詳細定義は [SSE Engine 契約](sse-engine.md) を正本とする。

### Mapping

差分算出前に、残基は次へ分類される。

- `mapped`
- `unmapped_baseline_only`
- `unmapped_override_only`
- `ambiguous`

### ルール

- Diff の母集団は `mapped` のみ
- unmapped / ambiguous は review point 行に混ぜない
- これらは別表示で監査可能にする
- unavailable / degraded は通常の label flip diff に黙って混ぜない

---

## unavailable / degraded の比較意味論

### unavailable の定義

`unavailable` は、Override Engine が対象 residue に assignment を返せない状態である。  
これは label value ではないため、`C` として扱ってはならない。

### degraded の定義

`degraded` の Engine 側定義は [SSE Engine 契約](sse-engine.md) を正本とする。  
状態モデルでは、degraded assignment が label value を持つ場合でも、通常の available value と同一扱いしてはならない状態として扱う。

### Diff への混入禁止

通常の Diff の母集団は、Baseline と Override の双方に比較可能な label value があり、かつ unavailable / degraded ではない residue に限定する。  
unavailable / degraded は、別表示または監査情報として扱い、Helix / Sheet / Coil の差分へ黙って変換しない。

### availability / value との関係

availability は、label value と別に持つ。  
`available = false` の項目は value を `C` に置換しない。  
`degraded` は `available = true` の label value を伴う場合でも、degradation state を別に保持する。

---

## `candidate_set` と `mapped_rate` の定義

### candidate_set

比較候補集合は **Baseline 側 residue key 集合** とする。

### 定義

- `candidate_count = |candidate_set|`
- `mapped_count = candidate_set のうち、一意に Override へ対応付けできた数`
- `mapped_rate = mapped_count / candidate_count`

### 表示規約

率だけを単独表示しない。件数を必ず併記する。

例:

- `Comparable 212 / Candidate 215 (98.6%)`

---

## availability と value の扱い

### 原則

各メトリクスは、値と可用性を分ける。

- `available = false` → `—`
- `available = true` かつ `value = 0` → `0`

### 独立可用性

availability は項目ごとに独立し得る。

例:

- `Unmapped 12`
- `Review points —`

### 対象

最低限、以下は独立 availability を持つ。

- `review_points`
- `comparable`
- `candidate_count`
- `unmapped_total`
- `ambiguous_count`
- `mapped_rate`
- `coverage`
- `degraded_count`
- `unavailable_count`
- current selection 系
