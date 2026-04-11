
---

## `docs/architecture.md`
```md
# Architecture

## 0. この文書の位置づけ

この文書は、Japan-Bio-Tools における **SSE-Diag の正本仕様** である。  
SSE-Diag の目的、境界、状態機械、UI契約、データ契約、実装順は本書を優先する。

本書は **契約凍結版** であり、実装はこの契約に従って進める。

---

## 1. 概要

SSE-Diag は、Mol* を SSOT（Single Source of Truth）として、
外部計算で得た SSE（二次構造）を Mol* 表示へ注入・上書きし、
Mol*標準SSE（Baseline）と Override SSE を
**比較成立条件つき**で診断できるツールである。

このツールの価値は「SSEを出すこと」ではない。価値は次の3点にある。

1. **比較成立**
   - Mapping を先に分離し、比較不能を差分に混ぜない
2. **監査可能性**
   - どういう条件で比較したかを Contract として示せる
3. **探索導線**
   - HUD / Table / Focus により差異を追える

補助コピー:
- **同じ構造でも、解釈は一つじゃない。**
- **比較が成立した状態で、差異を追える。**

---

## 2. 不変条件

### 2.1 ブラウザ完結
- 完全サーバーレスで動作する
- ユーザーの PDB / mmCIF を外部送信しない
- ローカル読み込み＋ブラウザ内計算で完結する

### 2.2 Mol* SSOT
- 構造データの読み込み・正規化は Mol* を一次ソースとする
- 残基・鎖・原子の同一性、インデックス、モデル構造は Mol* に従う
- 独自パーサは原則実装しない

### 2.3 境界分離
- 可視化（Mol*）と計算（Engine / WASM）を分離する
- 計算ロジックは UI に依存させない
- Mol* 依存は adapter 境界に閉じ込める

### 2.4 非目的
- 正誤判定はしない
- `correct / validated / trusted / accurate` を示唆しない
- `issue / problem / error` のような断定語で誘導しない

---

## 3. ユーザーと用途

対象は、構造を日常的に見る研究者・学生・R&D である。  
一般向けではない。優先するのは次の3つ。

- 雑比較ではない安心感
- 必要時に監査できる構造
- 差異を追うための探索コスト低減

---

## 4. First Meaningful Diagnosis

mmCIF ロード後、追加操作なしに以下を試行する。

1. Baseline取得（Mol*標準SSE）
2. 既定EngineでOverride生成
3. Mapping分離
4. Diff算出（mappedのみ）
5. HUD更新
6. 何が起きたかをUIで明示

例:
- `Prototype rule applied`

---

## 5. 状態機械と表示モード

### 5.1 comparison_status
比較成立度を表す。

- `full`
- `partial`
- `baseline_only`

意味:
- `full`: Baseline / Override / Mapping / Diff が成立
- `partial`: Baseline は成立、Override または Mapping または Diff の一部が未成立
- `baseline_only`: Baseline のみ成立

### 5.2 view_mode
現在ユーザーが見ている表示を表す。

- `baseline`
- `override`

### 5.3 二軸の分離
`comparison_status` と `view_mode` は別概念であり、混同しない。

例:
- `Status: Full / View: Baseline`
- `Status: Full / View: Override`
- `Status: Partial / View: Override`
- `Status: Baseline only / View: Baseline`

### 5.4 制約
- `comparison_status = baseline_only` の場合、`view_mode = baseline` に固定する
- `comparison_status = partial` で `view_mode = override` は許容するが、HUD に `Partial` を必ず併記する

---

## 6. Baseline / Override / Mapping

### 6.1 Baseline
- Mol*標準SSEを Baseline とする
- 取得条件は `baseline_profile` として記録可能であること

### 6.2 Override
- Engine により生成したSSEを Override とする
- Mol* へ注入・上書き可能であること
- 計算条件は `override_profile` として記録可能であること

### 6.3 Mapping分類
残基は差分算出前に、必ず以下へ分類される。

- `mapped`
- `unmapped_baseline_only`
- `unmapped_override_only`
- `ambiguous`

### 6.4 ルール
- Diff の母集団は `mapped` のみ
- unmapped / ambiguous は diff に含めない
- HUD / Diag で別表示する

---

## 7. candidate_set と mapped_rate

### 7.1 candidate_set
`candidate_set` は、**Baseline側 residue key の集合** とする。  
comparison_scope により限定された Baseline 側集合を分母に使う。

### 7.2 定義
- `candidate_count = |candidate_set|`
- `mapped_count = candidate_set のうち、一意にOverrideへ対応付けできた数`
- `mapped_rate = mapped_count / candidate_count`

### 7.3 表示規約
率だけを単独表示しない。必ず件数を併記する。

例:
- `Comparable 212 / Candidate 215 (98.6%)`

---

## 8. Comparison Contract

Comparison Contract は、「この比較がどう成立しているか」を示すブロックである。  
分散させず、1ブロックで表示する。

### 8.1 Contract Summary
常時見えてよい最小要約。

必須項目:
- `model_policy`
- `residue_key_policy`
- `mapping_basis`
- `mapped_count / candidate_count (mapped_rate)`
- `engine_summary`

### 8.2 Contract Detail
必要時に監査するための詳細。

必須項目:
- `baseline_profile`
- `override_profile`
- `comparison_scope`
- `chain_policy`
- `model_policy`
- `mapping_basis`

### 8.3 配置
- Summary: HUD expanded または Diag上部
- Detail: Diag内の折りたたみ領域

---

## 9. Engineメタ情報

Override計算結果は、最低限以下を持つ。

- `engine_id`
- `engine_name`
- `engine_version`
- `engine_stage`
- `engine_params`
- `computed_at`
- `input_profile`
- `engine_input_schema_version`

### 9.1 engine_stage
- `prototype`
- `experimental`
- `reference_like`

役割は **成熟度の表示** であり、正確性保証ではない。

---

## 10. 可用性（availability）と値（value）

### 10.1 原則
各メトリクスは、値と可用性を分ける。

- `available = false` → `—`
- `available = true` かつ `value = 0` → `0`

### 10.2 項目別availability独立
主要メトリクスの availability は **項目ごとに独立し得る**。

例:
- `Unmapped 12`
- `Review points —`

これは許容されるし、むしろ正しい。

### 10.3 対象
最低限、以下は availability を個別にもつ。

- `review_points`
- `comparable`
- `candidate_count`
- `unmapped_total`
- `ambiguous_count`
- `mapped_rate`

---

## 11. HUD仕様

### 11.1 HUD Compact
常時見える最小見出し。

表示項目:
- `Status`
- `View`
- `Engine stage`
- `Review points`
- `Unmapped`

例:
- `Full · View: Baseline · Prototype · Review points 17 · Unmapped 3`
- `Partial · View: Override · Prototype · Review points — · Unmapped 12`
- `Baseline only · View: Baseline · — · Review points — · Unmapped —`

### 11.2 HUD Expanded
詳細な確認用。

表示項目:
- `Comparable`
- `Candidate`
- `Mapped rate`
- `Unmapped total`
- `Ambiguous`
- `Engine name/version`
- `Contract Summary`

### 11.3 HUDの責務
- 状態表示
- 現在表示の明示
- 連続探索（Prev / Next）
- 詳細設定の説明は持たない

---

## 12. Diff分類と探索順

### 12.1 内部分類キー
- `LabelFlip_HC`
- `LabelFlip_EC`
- `LabelFlip_HE`
- `BoundaryShift`
- `Singleton`
- `Other`

### 12.2 UI表示名
- Helix/Coil反転
- Sheet/Coil反転
- Helix/Sheet反転
- 境界ズレ
- 孤立差分
- その他

### 12.3 Default order
スコアではなく、既定の並び順で探索を助ける。

1. Helix/Sheet反転
2. Helix/Coil反転
3. Sheet/Coil反転
4. 境界ズレ
5. 孤立差分
6. その他

---

## 13. Diff Table 契約

### 13.1 DiffRow
R2時点から、最低限以下を持つ。

- `residue_key`
- `display_residue`
- `baseline_label`
- `override_label`
- `kind`
- `kind_label`
- `sort_key`
- `filterable`

### 13.2 residue_key と display_residue の分離
- `residue_key` は一意性のための machine key
- `display_residue` は人間が読むための human label

UI・動画・説明では、原則 `display_residue` を使う。

### 13.3 display_residue の要件
フォーマットは repomix反映後に確定するが、要件は固定する。

- chain識別を含む
- 可能なら残基名＋連番を含む
- 同一性を壊さず、人間に読みやすい

例:
- `A:GLY123`

---

## 14. UI責務分離

- **HUD**  
  状態表示 / view表示 / 連続探索
- **Table**  
  全体把握 / フィルタ / ソート / 選択
- **Diag**  
  Contract / Engine詳細 / 方針表示 / 監査

この責務を跨いで情報を重複させすぎない。

---

## 15. WASM / Rust 方針

### 15.1 Rust/WASMにする領域
- SSE推定アルゴリズムなどの計算コア
- 必要に応じた重い計算

### 15.2 Rust/WASMにしない領域
- Mol*構造ロード
- residue key抽出
- 注入 / 復元 / 再描画
- UI

### 15.3 原則
- Rust側で mmCIF/PDB を再パースしない
- Mol* から抽出した最小データのみ渡す

---

## 16. リリース順

- `R1`：即時切替＋Baseline復元
- `R1.5`：HUD（status / view / compact / expanded / availability規約）
- `R2`：Table（DiffRow契約固定、display_residue含む）
- `R2.5`：分類pure関数＋kind_label/sort_key/filterable充足
- `R3`：focus / highlight＋Prev / Next
- `R4`：HUD洗練（current index / class）

---

## 17. 2週間検証KPI

- 初回比較成立率（full / partial / baseline_only）
- HUD展開率
- Contract detail開封率
- Diff table到達率
- Diffクリック率 / PrevNext利用率
- Unmapped率
- Other比率
- view_mode別滞在率

---

## 18. 表現ポリシー

### 推奨語彙
- review points
- comparison
- baseline
- override
- contract
- mapping
- partial

### 禁止語彙
- correct
- validated
- trusted
- accurate
- issue
- problem
- error