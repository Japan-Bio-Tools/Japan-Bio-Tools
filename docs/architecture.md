
# Architecture

## 0. この文書の位置づけ

この文書は、Japan-Bio-Tools における **SSE-Diag の正本仕様** である。  
SSE-Diag の目的、責務分離、状態機械、UI 契約、データ契約、Engine 契約、Diagnosis Pipeline 契約、実装順は本書を優先する。

本書は **設計上の凍結点** を定義する。  
個別タスク、差分パッチ、Codex への依頼文は、本書を参照して作成する。

本書は、従来の `architecture.md` に加えて、Diagnosis Pipeline Application Service 導入仕様を吸収した **完全版** とする。  
追加仕様書に書かれていた内容は、以後は本書へ統合され、本書を唯一の正本とする。

---

## 1. なぜこの形にしたか

SSE-Diag は当初、Mol* を使った SSE 比較診断ツールとして、外部計算結果を Mol* 表示へ注入・上書きし、標準 SSE との差異を診断する構想として始まった。

議論の過程では、次の選択肢が検討された。

- standalone アプリとして進める案
- Mol* plugin 的な構造へ寄せる案
- plugin + 別窓 UI で診断主権を持つ案

再検討の結果、現在の結論は次である。

- **プラグイン方式は採らない**
- **SSE-Diag がアプリ主権を持つ**
- **Mol* は構造データ SSOT および 3D 表示・操作基盤として強く使う**
- **ただし Mol* をホスト基盤にはしない**
- **Engine は将来追加可能な最小 pluginability を持たせる**
- **Diagnosis Pipeline は application service として分離し、Viewer を診断主系統の実装場所にしない**

つまり、SSE-Diag は  
**「Mol* を深く使うが、Mol* に主権は渡さない診断アプリ」**  
として定義する。

---

## 2. プロダクト定義

### 2.1 目的

SSE-Diag は、Mol* を構造可視化と構造データ SSOT の基盤として利用しつつ、  
Mol* 標準 SSE（Baseline）と外部計算 SSE（Override）を、  
**比較成立条件つきで診断できるツール**を提供する。

### 2.2 本プロダクトの価値

本ツールの価値は「SSE を出すこと」そのものではない。価値は次の 3 点にある。

1. **比較成立**  
   Mapping を分離し、比較不能を差分に混ぜない。

2. **監査可能性**  
   どういう条件で比較したかを Contract / ExecutionRecord として追える。

3. **探索導線**  
   Review points を HUD / Table / Viewer 連携で追える。

### 2.3 補助コピー

- **同じ構造でも、解釈は一つじゃない。**
- **比較が成立した状態で、差異を追える。**

### 2.4 非目的

- 正誤判定をすること
- viewer 全機能を自前で再実装すること
- Mol* を置き換えること
- plugin marketplace 向けの plugin として成立させること
- 汎用 plugin platform を完成させること

---

## 3. 不変条件

### 3.1 ブラウザ完結

- 完全サーバーレス
- PDB / mmCIF を外部送信しない
- ローカル読み込み＋ブラウザ内計算で完結する

### 3.2 Mol* SSOT

- 構造データの読み込み・正規化は Mol* を一次ソースとする
- 残基・鎖・原子・モデルの同一性は Mol* 準拠
- 独自パーサは原則実装しない

### 3.3 主権の所在

- **診断状態の主権は SSE-Diag が持つ**
- Mol* は viewer / rendering / interaction 基盤として使う
- Mol* 側に比較状態の真実を持ち込まない

### 3.4 二重主語化の禁止

次の状態を SSE-Diag 側と Mol* 側で二重管理してはならない。

- `comparison_status`
- `view_mode`
- `selection`
- `Comparison Contract`
- `EngineExecutionRecord`
- stale result 採用可否
- selected review point の真実

---

## 4. システムの親子関係

### 4.1 親

**SSE-Diag** がアプリ全体の親である。

SSE-Diag は次を正本として持つ。

- `comparison_status`
- `view_mode`
- `selection`
- `Comparison Contract`
- `EngineExecutionRecord`
- `requested / resolved engine`
- stale discard 判定
- HUD / Table / Diag に出す値
- logging / analytics の主系統

### 4.2 子

**Mol*** は 3D 表示・選択・focus・highlight・camera・rebuild を担う子コンポーネントである。

Mol* は次を担う。

- 3D 構造表示
- representation 更新
- focus
- highlight
- loci 選択
- camera
- rebuild / theme 適用

### 4.3 してはいけないこと

- Mol* 側に `comparison_status` を持たせる
- Mol* 側に Contract を持たせる
- Mol* 側に ExecutionRecord を持たせる
- SSE-Diag を単なる設定パネルにする

---

## 5. First Meaningful Diagnosis

mmCIF ロード後、追加操作なしに次を試行する。

1. Baseline 取得
2. 既定 Engine 解決
3. Override 計算
4. Mapping 分離
5. Diff 算出
6. HUD / Table / Summary 更新
7. Mol* viewer へ必要な描画更新を反映

ユーザーに必要なのは、次が分かることである。

- 何が起きたか
- 今どこまで比較が成立しているか
- 何を見ればよいか

---

## 6. 状態機械

### 6.1 comparison_status

比較成立度を表す。

- `full`
- `partial`
- `baseline_only`

意味:

- `full`: Baseline / Override / Mapping / Diff が成立
- `partial`: Baseline は成立、Override / Mapping / Diff の一部が未成立
- `baseline_only`: Baseline のみ成立

### 6.2 view_mode

現在ユーザーが見ている表示。

- `baseline`
- `override`

### 6.3 selection

現在選択している review point。

- `selectedDiffIndex`
- `selectedDiffRow`
- `current kind_label`
- `current display_residue`

### 6.4 原則

`comparison_status`、`view_mode`、`selection` は **別概念** であり、混同しない。

例:

- `Status: Full / View: Baseline / Selected: 3 / 17`
- `Status: Partial / View: Override / Selected: —`

---

## 7. Baseline / Override / Mapping

### 7.1 Baseline

- Mol* 標準 SSE を Baseline とする
- 取得条件は `baseline_profile` として記録可能

### 7.2 Override

- Engine が計算した SSE を Override とする
- Mol* viewer 側へ注入・上書き可能であること
- 計算条件は `override_profile` として記録可能

#### override_profile の生成原則

`override_profile` は、Viewer が入力した生の文字列をそのまま採用する概念ではない。  
これは **実際に解決・実行された Engine 条件の要約** として扱う。

したがって `override_profile` は、少なくとも以下から組み立ててよい。

- `requested_engine_key`
- `resolved_engine_id`
- `engine metadata`
- `effective_params`

つまり、`override_profile` は **requested 条件ではなく effective 条件ベース** に寄せる。

### 7.3 Mapping

差分算出前に、残基は次へ分類される。

- `mapped`
- `unmapped_baseline_only`
- `unmapped_override_only`
- `ambiguous`

### 7.4 ルール

- Diff の母集団は `mapped` のみ
- unmapped / ambiguous は review point 行に混ぜない
- これらは別表示で監査可能にする

---

## 8. candidate_set と mapped_rate

### 8.1 candidate_set

比較候補集合は **Baseline 側 residue key 集合** とする。

### 8.2 定義

- `candidate_count = |candidate_set|`
- `mapped_count = candidate_set のうち、一意に Override へ対応付けできた数`
- `mapped_rate = mapped_count / candidate_count`

### 8.3 表示規約

率だけを単独表示しない。件数を必ず併記する。

例:

- `Comparable 212 / Candidate 215 (98.6%)`

---

## 9. Comparison Contract

Comparison Contract は、「この比較がどう成立しているか」を示す主権情報であり、**SSE-Diag 側が保持する**。

### 9.1 Contract Summary

常時見えてよい最小要約。

必須項目:

- `model_policy`
- `residue_key_policy`
- `mapping_basis`
- `mapped_count / candidate_count / mapped_rate`
- `engine_summary`

### 9.2 Contract Detail

必要時に監査するための詳細。

必須項目:

- `baseline_profile`
- `override_profile`
- `comparison_scope`
- `chain_policy`
- `model_policy`
- `mapping_basis`

### 9.3 原則

- Contract は SSE-Diag 側の 1 ブロックとして扱い、Mol* viewer 側へ分散させない
- Viewer が Contract を後付け補完しない
- Contract 生成に必要な監査文脈は、service 側入力として明示される

---

## 10. 可用性（availability）と値（value）

### 10.1 原則

各メトリクスは、値と可用性を分ける。

- `available = false` → `—`
- `available = true` かつ `value = 0` → `0`

### 10.2 独立可用性

availability は項目ごとに独立し得る。

例:

- `Unmapped 12`
- `Review points —`

### 10.3 対象

最低限、以下は独立 availability を持つ。

- `review_points`
- `comparable`
- `candidate_count`
- `unmapped_total`
- `ambiguous_count`
- `mapped_rate`
- current selection 系

---

## 11. UI の責務分離

### 11.1 HUD

- 状態表示
- 現在表示の明示
- 現在位置の明示
- 最小ナビ（Prev / Next）

### 11.2 Table

- 全体把握
- filter / sort
- 行選択
- selection の正本 UI

### 11.3 Diag

- Contract detail
- Engine detail
- ExecutionRecord 参照
- 監査の深掘り

### 11.4 Viewer

- 3D 根拠表示
- selection / highlight / focus の反映

### 11.5 Viewer の非再解釈原則

Viewer は service 結果を **表示・採用・破棄** してよい。  
ただし、結果の意味を再構築してはならない。

具体的に Viewer がやってはいけないことは次である。

- `comparison_summary` の再導出
- `comparison_status` の再判定
- `diff_rows` の再分類
- Contract の detail 補完
- `override_profile` の再構築
- service 結果を UI 用に意味変換し直すこと

Viewer に許容されるのは、**表示のための最小整形** のみである。  
この最小整形は、列幅、表示順、視覚的グルーピング、非意味論的なプレゼンテーション調整を指す。  
比較意味論、分類、状態、監査条件の再計算は含まない。

つまり、Viewer は  
**結果の意味を再構築せず render する shell**  
であり、診断意味論の再計算場所ではない。

---

## 12. Diff Table 契約

### 12.1 DiffRow

最低限、以下を持つ。

- `residue_key`
- `display_residue`
- `baseline_label`
- `override_label`
- `kind`
- `kind_label`
- `sort_key`
- `filterable`

### 12.2 原則

- `residue_key` = machine key
- `display_residue` = human-readable label
- UI では原則 `display_residue` を使う

### 12.3 unmapped / ambiguous

これらは review point table に混ぜない。

---

## 13. Diagnosis Pipeline Application Service

### 13.1 目的

Diagnosis Pipeline Application Service は、Viewer から診断オーケストレーションを薄くし、  
診断の真実を application service 側へ寄せるために導入する。

この節の目的は次である。

1. Viewer を入力イベント受理と結果表示へ集中させる
2. 診断パイプラインを 1 つの service として実行できるようにする
3. Engine 追加時に Viewer の分岐増加を防ぐ
4. `Comparison Contract` / `EngineExecutionRecord` / `comparison_status` を一貫生成する
5. HUD / Table / Diag / selection の元データを同一 run 結果に揃える
6. stale discard の監査可能性と採用権分離を両立させる

### 13.2 スコープ

Diagnosis Pipeline service のスコープは、SSE-Diag アプリ内部の orchestration 再配置である。

含むもの:

- diagnosis pipeline service の新設
- pipeline 入出力契約の定義
- pipeline 結果オブジェクトの定義
- Viewer から pipeline 呼び出しへの置換
- stale discard / execution record の責務分割
- Contract 生成に必要な入力文脈の明示
- HUD / diff rows / comparison summary 生成の service 側集約

含まないもの:

- Mol* の描画ロジック大改造
- engine algorithm 自体の変更
- CSS / UI デザイン改修
- 第 2 Engine の導入そのもの
- packages への切り出し

### 13.3 主権

診断状態の主権は引き続き SSE-Diag が持つ。  
Mol* は Baseline 取得、override 適用、focus / highlight、rebuild の基盤であり、`comparison_status` や Contract の正本を持たない。

### 13.4 Viewer の役割

Viewer は以下のみを担う。

- ファイル入力
- `view_mode` 切替要求
- `requested_engine_key` / engine params の保持
- `run_id` 発行
- pipeline 実行要求
- pipeline 結果の採用可否決定
- pipeline 結果の表示
- Mol* への反映指示
- selection の保持・clear・反映

Viewer は、個別 Engine のアルゴリズム詳細を知らない。  
また、`comparison_status` 決定ロジックや Contract 生成ロジックの中心実装場所にならない。

### 13.5 Pipeline service の役割

Pipeline service は以下を担う。

- Engine resolution
- `EngineExecutionRecord` の生成・更新
- `SseEngineInput` の構築
- engine 実行
- mapping
- `comparison_status` 決定
- diff rows / summary / diagnosis record 生成
- stale candidate の記録

### 13.6 stale 採用権の原則

stale discard に関する責務は分ける。

#### service 側

service は以下を行ってよい。

- run ごとの実行結果を生成する
- **superseded され得る結果候補** として stale candidate を記録する
- stale candidate となり得る理由を execution record へ残す

#### shell / Viewer 側

shell は以下を行う。

- 現在の最新 run を知る
- service 結果の `run_id` と現在の最新 run を比較する
- その結果を UI / state に採用するかどうかを最終決定する
- 必要なら discard 確定後の記録更新を行う

重要なのは、  
**service は stale 候補までを扱い、discard の確定は shell が行う**  
という点である。

### 13.7 stale candidate と discarded_stale の関係

`discarded_stale` は「UI に採用しなかった結果」の状態である。  
したがって、**遷移主体は shell である。**

service が返す結果では、少なくとも次を原則とする。

- `running`
- `completed`
- `failed_resolution`
- `failed_execution`

`discarded_stale` を共有型に残すことは許容する。  
ただし、それを **service が返す record の確定状態として付与してよい** とはしない。  
service が返す `EngineExecutionRecord.status` は原則として `running / completed / failed_resolution / failed_execution` の範囲に留まる。

`discarded_stale` への遷移は、shell が最新 run と照合し、当該結果を UI / state に採用しないと確定した後にのみ行う。

### 13.8 用語定義

#### run

1 回の diagnosis pipeline 実行単位。  
各 run は必ず `run_id` を持つ。

#### fresh

shell が現在採用対象として扱える run 結果。

#### stale_candidate

service が返す結果のうち、shell 側の最新 run 状態によって superseded 判定され得る結果候補。  
service が単独で stale 確定するわけではない。

#### adopted_result

shell が実際に UI / state に採用した pipeline 結果。  
HUD / Table / Diag / selection は、この adopted result に整合していなければならない。

#### diagnosis_record

`diagnosis_record` は、**1 run における診断進行度と可用性の軽量記録**である。  
これは UI summary object ではなく、run の診断進行・可用性記録である。

#### comparison_summary

`comparison_summary` は、**1 run の結果由来の比較要約**である。  
それ自体は adopted 済みであることを意味しない。  
shell はその中から adopted result を選ぶ。

`comparison_summary` は **UI / 診断閲覧用の比較要約** であり、  
`diagnosis_record` は **run 進行・可用性記録** である。  
両者は補完関係にあるが、同一概念ではない。

#### engine_execution_record

Engine 解決・実行・失敗・stale 候補・discard 確定を追跡する、監査用 run 記録である。

### 13.9 入力契約

```ts
type DiagnosisContractContext = {
  baseline_profile: string;
  comparison_scope: string;
  chain_policy: string;
  model_policy: string;
  residue_key_policy: string;
  mapping_basis: string;
};

type RunDiagnosisPipelineInput = {
  run_id: string;

  requested_engine_key: string | null;
  default_engine_key: string;
  engine_registry: SseEngineRegistry;
  engine_params: Record<string, string | number | boolean | null | undefined>;

  baseline_map: Map<string, SseLabel>;
  residue_keys: SseResidueKey[];
  residue_display_labels: Map<string, string>;

  contract_context: DiagnosisContractContext;
};
````

#### 入力契約の原則

* service は Contract を生成するなら、その材料をすべて input として受け取る
* `comparison_scope`、`model_policy`、`mapping_basis` などを Viewer が後付けしない
* `baseline_map` と `residue_keys` の関係を曖昧にしない
* `run_id` は service の外で発行される
* `override_profile` は input に含めず、service 側で effective 条件から組み立てる

### 13.10 EngineInput 契約

engine 実行時の入力は、雰囲気で組み立てない。
service は `buildEngineInput(...)` により、正式な EngineInput を生成してから `engine.compute(engineInput)` を呼ぶ。

```ts
function buildEngineInput(input: RunDiagnosisPipelineInput): SseEngineInput {
  return {
    residues: input.residue_keys,
  };
}
```

#### ルール

* `residue_keys` と `residues` の語を混在させない
* Engine に渡した実入力は、必要に応じて metadata や execution record から追えるようにする
* 将来 input が厚くなっても、Viewer は `buildEngineInput(...)` の存在だけを前提とする

### 13.11 出力契約

```ts
type StaleDisposition = 'fresh' | 'stale_candidate';

type RunDiagnosisPipelineResult = {
  run_id: string;

  comparison_status: ComparisonStatus;

  output: SseEngineOutput | null;
  mapping: SseMappingResult | null;
  diff_rows: DiffRow[];

  comparison_summary: SseComparisonSummary;
  diagnosis_record: DiagnosisRecord;
  engine_execution_record: EngineExecutionRecord;

  stale_disposition: StaleDisposition;
  failed: boolean;
};
```

#### 出力契約の原則

* `output` がなくても `engine_execution_record` は返せること
* `comparison_summary`、`diff_rows`、`engine_execution_record`、`diagnosis_record` は同一 run 結果から導出されること
* unknown key は silent fallback しない
* unmapped / ambiguous は review points に混ぜない
* stale 採用可否の最終判断は出力に含めない

### 13.12 処理フロー

Pipeline service は以下の順で処理する。

1. resolution

   * `requested_engine_key` を解決する
   * 未指定なら default 使用
   * 未知 key なら `failed_unknown_key`
   * `requested_engine_key` と `resolved_engine_id` を区別して保持する

2. running record 作成

   * `run_id`
   * `requested_engine_key`
   * `resolved_engine_id`
   * `resolution_mode`
   * `status = running`
   * `started_at`

3. EngineInput 構築

   * `buildEngineInput(input)` を呼ぶ

4. engine 実行

   * `engine.compute(engineInput)` を呼ぶ
   * 失敗時は `failed_execution`
   * 成功時は metadata を取り込む

5. stale candidate 記録

   * service は必要なら `stale_candidate` を記録する
   * ただし UI 採用可否は決めない

6. mapping

   * `baseline_map` と `output.residues` から mapping を構築する

7. status 決定

   * `baseline_only`
   * `partial`
   * `full`

8. review points / diff rows 生成

   * `mapped` の差分のみから review points を作る
   * diff classification を適用して `DiffRow[]` を返す

9. summary / contract 生成

   * `SseComparisonSummary`
   * `DiagnosisRecord`
   * `EngineExecutionRecord`
   * Contract summary / detail

### 13.13 Viewer に残すもの

Viewer 側に残してよいものは以下である。

* mmCIF text の読込
* `loadMmcifText()`
* Baseline snapshot capture / restore
* `getMolstarStandardSse()`
* `extractResidueKeys()`
* `extractResidueDisplayLabels()`
* `applyOverrideSseToMolstarModel()`
* `rebuildCartoonOnly()`
* `focusAndHighlightResidueByKey()`
* `clearDiffSelectionMarks()`
* `run_id` 発行
* 最新 run 保持
* service 結果の採用可否決定
* selection の保持・clear・反映

### 13.14 Pipeline service に寄せるもの

Pipeline service に寄せるべきものは以下である。

* Engine resolution
* EngineInput 構築
* `EngineExecutionRecord` の state machine
* mapping 構築
* `comparison_status` 判定
* Contract summary / detail 生成
* HUD summary 生成
* diff rows 生成
* stale candidate 記録

### 13.15 service の副作用ポリシー

#### 許容するもの

* Engine 実行
* 時刻生成
* `EngineExecutionRecord` 更新のための値生成
* エラー捕捉と結果化

#### 禁止するもの

* Mol* API を直接叩くこと
* DOM / React state / UI store を更新すること
* focus / highlight / rebuild を行うこと
* network 送信を行うこと
* shell の最新 run 状態を書き換えること
* selection を直接変更すること

### 13.16 selection 整合性

selection の主権は shell / Viewer が持つ。
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

### 13.17 推奨ファイル構成

```txt
apps/sse-diag/src/application/
  diagnosis/
    runDiagnosisPipeline.ts
    buildEngineInput.ts
    buildComparisonSummary.ts
    buildContract.ts
    deriveComparisonStatus.ts
    buildDiffRows.ts
    types.ts
```

#### 分離方針

* `runDiagnosisPipeline.ts`

  * orchestration の親
* `buildEngineInput.ts`

  * EngineInput 正式生成
* `deriveComparisonStatus.ts`

  * status 判定 pure 関数
* `buildContract.ts`

  * Contract summary / detail 組み立て
* `buildComparisonSummary.ts`

  * HUD / metrics 組み立て
* `buildDiffRows.ts`

  * mapping → classified diff rows の変換

### 13.18 受け入れ条件

Diagnosis Pipeline Application Service が成立したと見なす最低条件は以下である。

1. Viewer が `engine.compute()` を直接ほぼ握らない
2. Viewer が resolution / mapping / summary 組み立ての中心実装場所でない
3. `runDiagnosisPipeline(...)` を 1 回呼ぶ形へ寄る
4. EngineInput 構築が `buildEngineInput(...)` に明示分離される
5. service は stale candidate を記録できる
6. shell は最終採用可否を決定できる
7. stale result は UI に採用されない
8. discard 候補理由を監査できる
9. service が stale を単独確定しない
10. Contract 生成に必要な文脈が input に明示されている
11. `override_profile` は effective engine 条件から service 側で生成される
12. `comparison_summary` / `diff_rows` / `engine_execution_record` / `diagnosis_record` が同一 run 結果由来である
13. HUD / Table / Diag が同一 run の診断結果を参照する
14. selection が現在採用中の `diff_rows` と整合する
15. viewer highlight / focus が現在採用中 selection と整合する
16. 現在の `prototype.rule` が従来どおり動く
17. baseline restore / override apply の動作が維持される

### 13.19 非目的

本節は以下を要求しない。

* 第 2 Engine の導入そのもの
* 複数 Engine の同時比較
* Engine ごとの複雑な設定 UI
* packages 化
* analytics 基盤の導入

---

## 14. SSE Engine Architecture（完全確定版）

### 14.1 目的

SSE-Diag では、複数の SSE Engine を将来的に追加・差し替えできることを前提とする。
本節は、Engine の位置づけ、現在の実装状態、目標構造、選択解決ルール、実行記録、metadata 契約を一貫した形で定義する。

この節の目的は次の 6 つである。

1. `prototype.rule` の位置づけを明確にする
2. Engine 追加時に Viewer や Mol* adapter 側の変更を最小化する
3. Engine 選択と実行結果の監査可能性を確保する
4. 将来の Rust / WASM Engine を同じ契約で受け入れられる構造を保つ
5. Engine が増えても、比較成立・HUD・Contract・UI 一貫性を壊さない
6. async 実行時の stale result 採用事故を防ぐ

### 14.2 基本方針

* `SseEngine` を **唯一の実行契約** とする
* Engine は UI とは独立した計算コンポーネントとして扱う
* Viewer は Engine 実装の詳細を知らない
* Engine の生成は **registry / factory** を経由する
* Engine 差し替え後も、比較・HUD・Contract に必要な metadata 契約を壊さない
* 本節の目的は **最小の pluginability** を確保することであり、汎用 plugin platform を完成させることではない

### 14.3 現在の位置づけ（Current State）

現時点では、`prototype.rule` を既定 Engine として扱う。

この Engine は:

* 現在の初期実装
* override 注入機構・比較フレーム・UI 連携を検証するための既定 Engine
* 将来も残り得るが、**設計上は特別扱いしない**

重要なのは、`prototype.rule` は
**「現在の既定 Engine」ではあるが、「設計上の特権的存在」ではない**
という点である。

### 14.4 目標構造（Target Architecture）

最終的な目標構造は以下とする。

* Viewer は Engine 実装クラスを直接 `new` しない
* Viewer は `requested_engine_key` と `params` だけを持つ
* Engine の実体生成は **registry / factory** を経由する
* Engine 実装追加時に、Viewer 側の変更は最小で済む
* Viewer / adapter に `prototype.rule` 特例分岐を持ち込まない

### 14.5 実行契約（Execution Contract）

Engine はすべて `SseEngine` 契約に従う。

#### 実行インターフェース

```ts
compute(input): Promise<SseEngineOutput>
```

#### async 統一の理由

* 将来の Rust / WASM Engine を自然に受け入れるため
* Viewer 側の sync / async 分岐を防ぐため
* loading / pending state を一貫して扱えるようにするため

#### Engine の責務

* `compute(input)` を実装する
* `SseEngineOutput` を返す
* 必要な metadata を出力に含める
* UI state や Mol* adapter に依存しない
* 計算ロジックを Engine 内に閉じ込める

### 14.6 Engine Selection Resolution（選択解決ルール）

#### 固定方針

* `requested_engine_key` **未指定** の場合のみ、既定 Engine を使用してよい
* `requested_engine_key` **未知** の場合は、**明示的に失敗**させる
* 未知 key を **silent fallback してはならない**

#### 解決モード

実行記録・ログでは、少なくとも以下を区別できること。

* `direct`
* `default_used`
* `failed_unknown_key`

### 14.7 engine_key と engine_id の意味分離

* `requested_engine_key`

  * ユーザーまたは設定が要求した Engine の選択キー
* `resolved_engine_id`

  * 実際に実行された Engine の識別子

原則として、HUD では主に `engine_name` を表示してよいが、
Contract / ログ / 再現性確認では `requested` と `resolved` を区別できること。

### 14.8 EngineExecutionRecord（実行記録）

Engine 解決失敗時には `SseEngineOutput` 自体が存在しない。
したがって、Engine 選択と実行の監査情報は `SseEngineOutput` とは別に、**EngineExecutionRecord** として扱えることを前提とする。

#### 目的

* Engine 解決失敗時でも、何を要求し、どこで止まったかを追える
* 成功時も、解決情報と計算結果を分けて整理できる
* stale candidate と discard 確定を追跡できる

#### 最低限持つべき項目

* `run_id`
* `requested_engine_key`
* `resolved_engine_id | null`
* `resolution_mode`
* `status`

  * 例: `running` / `failed_resolution` / `failed_execution` / `completed` / `discarded_stale`
* `error | null`
* `started_at`
* `finished_at | null`

必要に応じて、以下を追加してよい。

* `effective_params`
* `engine_name`
* `engine_stage`
* `engine_version`

#### status 遷移の原則

* `running`
* `failed_resolution`
* `failed_execution`
* `completed`

までは service 側で扱ってよい。

`discarded_stale` は **shell による非採用確定後の状態** として扱う。
共有 enum に残すことは許容するが、service 側がこれを stale 確定状態として使うことは前提としない。
service が返す record の status は原則として `running / completed / failed_resolution / failed_execution` の範囲に留まる。

### 14.9 stale result の不採用

`SseEngine.compute(...)` を async 契約にする以上、**古い実行結果を UI へ採用してはならない**。

#### 必須要件

Viewer は少なくとも、以下のどちらかを満たすこと。

1. `run_id` により、最新ではない結果を破棄する
2. `AbortSignal` により、古い実行を中断する

初期実装では、**`run_id` による stale result 棄却**を最低条件としてよい。
`AbortSignal` 対応は推奨だが、初期段階の必須条件とはしない。

### 14.10 Engine Descriptor / Registry

各 Engine は、少なくとも以下の登録情報を持つ。

* `engine_key`
* `engine_id`
* `engine_name`
* `engine_stage`
* `create(params) => SseEngine`

必要に応じて、以下を追加してよい。

* `description`
* `default_params`
* `supports_config`
* `supported_input_schema_version`

descriptor / registry は **薄く保つ**。
目的は Engine 追加容易性であり、複雑な host 化ではない。

### 14.11 schema version の意味分離

#### Descriptor 側

* `supported_input_schema_version`

  * その Engine が **受け入れ可能な入力契約バージョン**

#### Output 側

* `engine_input_schema_version`

  * 今回の実行で **実際に使われた入力契約バージョン**

原則として、「受けられるもの」と「今回使ったもの」を混同させない。

### 14.12 Viewer の責務

Viewer は以下のみを知る。

* 現在の `requested_engine_key`
* 現在の input params
* factory / registry から `SseEngine` を取得して `compute(...)` を呼ぶこと
* stale result を採用しないこと

Viewer は以下を知らない。

* 各 Engine のアルゴリズム詳細
* 各 Engine の実装クラスの内部事情
* 各 Engine 固有の Mol* 操作
* 各 Engine 固有の高度な設定 UI

### 14.13 Mol* adapter との境界

Mol* adapter は、引き続き以下の責務に限定する。

* Baseline 取得
* residue key 抽出
* Override 注入
* focus / highlight
* rebuild / theme 適用

Engine は Mol* adapter の内部事情を知らない。
Mol* adapter も Engine の内部アルゴリズムを知らない。

### 14.14 Engine metadata 契約

Engine のプラガブル化後も、比較・表示・監査のために、以下の metadata 契約は維持する。

最低限維持する項目:

* `engine_id`
* `engine_name`
* `engine_version`
* `engine_stage`
* `engine_input_schema_version`
* `input_profile`
* `effective_params`

#### input_profile の目的

その Engine が今回どの入力前提で計算したかを示す。
比較条件の説明と再現性確認に使う。

#### effective_params の目的

ユーザーが渡した生の input params ではなく、
Engine 内部で正規化・default 補完された後の **実効設定** を表す。

### 14.15 Engine Stage

許可する値:

* `prototype`
* `experimental`
* `reference_like`

これは **成熟度表示** であり、正確性保証ではない。

禁止する印象付け:

* `correct`
* `validated`
* `accurate`
* `trusted`

### 14.16 既定 Engine と default 解決

初期段階では、`prototype.rule` を既定 Engine としてよい。
ただし、既定 Engine 使用は **requested_engine_key が未指定の場合のみ** 許可される。
未知 key 指定時に既定 Engine へ流すことは許可しない。

### 14.17 WASM Engine との整合

将来 Rust / WASM Engine を導入する場合も、同じ `SseEngine` 契約に従う。

守るべき原則:

* Viewer は WASM の実装詳細を知らない
* WASM Engine も registry / factory 経由で生成される
* Mol* から抽出した最小データのみを Engine 入力として渡す
* Rust 側で mmCIF / PDB を再パースしない
* async 契約をそのまま利用する
* stale result を採用しない

### 14.18 受け入れ条件（Pluginability の成立条件）

Engine のプラガブル化が成立したと見なす最低条件は以下である。

1. Viewer が個別 Engine 実装を直接 `new` していない
2. Engine 生成が registry / factory 経由になっている
3. `prototype.rule` が既定 Engine として従来どおり動く
4. 2 個目の Engine を追加しても Viewer 側の変更が最小で済む
5. 既存の R1〜R4 を壊さない
6. metadata 契約が維持される
7. unknown key は silent fallback せず、明示失敗する
8. `requested_engine_key` と `resolved_engine_id` を追跡できる
9. `input_profile` を記録できる
10. `effective_params` を記録できる
11. `compute(input): Promise<SseEngineOutput>` 契約が全 Engine で統一される
12. Viewer / adapter に `prototype.rule` 特例分岐を持ち込まない
13. EngineExecutionRecord により、解決失敗と成功の両方を監査できる
14. stale result を UI に採用しない

### 14.19 非目的

本節は以下を要求しない。

* 複数 Engine の同時比較
* Engine ごとの複雑な設定 UI
* Engine recommendation / ranking
* Engine score
* WASM Engine の同時実装
* 汎用 plugin platform の完成
* AbortSignal 対応の完全実装を初期段階から必須化すること

---

## 15. Mol* との関係

### 15.1 Mol* の役割

Mol* は、SSE-Diag における

* 構造データ SSOT
* 3D 表示
* selection / focus / highlight
* camera
* rebuild / theme 適用

を担う基盤である。

### 15.2 採用しないもの

* Mol* をアプリ主権のホスト基盤にすること
* Mol* 側に comparison / contract / execution の真実を持たせること
* SSE-Diag を Mol* の従属パネルにすること

### 15.3 採用するもの

* SSE-Diag 主権アプリの中で Mol* を深く使う
* Mol* を viewer / interaction engine として利用する
* Mol* の柔軟性は借りるが、主権は渡さない

---

## 16. WASM / Rust 方針

### 16.1 位置づけ

WASM 化は Engine 実装の差し替えとして扱う。
viewer / shell / pipeline service の責務分離を壊す変更として扱わない。

### 16.2 原則

* Viewer は WASM 詳細を知らない
* registry / factory 経由で使う
* Mol* から抽出した最小データのみを渡す
* Rust 側で mmCIF / PDB を再パースしない
* async 契約を維持する
* stale result を採用しない

---

## 17. リリースと実装順

### 17.1 既存フェーズ

* R1: 即時切替＋Baseline復元
* R1.5: HUD compact / expanded
* R2: Diff Table
* R2.5: 分類 pure 関数
* R3: focus / highlight + Prev / Next
* R4: HUD 洗練

### 17.2 次の構造改修

次の基盤改修は、**Diagnosis Pipeline Application Service 導入**である。
これは、Engine pluginability を実装構造へ落とすための最初の基盤改修である。

### 17.3 その次

Diagnosis Pipeline 導入後の次の構造改修は、**Engine pluginability の実利用段階**である。
すなわち、第 2 Engine 追加に進む。

---

## 18. 2週間検証 KPI

* 初回比較成立率（full / partial / baseline_only）
* HUD 展開率
* Contract detail 開封率
* Diff table 到達率
* Diff click / PrevNext 利用率
* Unmapped 率
* Other 比率
* view_mode 別滞在率
* unknown engine key 発生率
* default engine 使用率（未指定由来）
* engine resolution failure 率
* stale result 棄却率
* engine 別比較成立率
* 2 個目 Engine 追加時の Viewer 修正箇所数

---

## 19. 表現ポリシー

### 19.1 推奨語彙

* review points
* comparison
* baseline
* override
* contract
* mapping
* partial

### 19.2 禁止語彙

* correct
* validated
* trusted
* accurate
* issue
* problem

---

## 20. 非目的

この文書は以下を要求しない。

* 複数 Engine の同時比較
* Engine ごとの複雑な設定 UI
* Engine recommendation / ranking
* Engine score
* viewer 全機能の自前再実装
* plugin marketplace 向け配布
* Mol* をホスト基盤にすること

本書の目的はあくまで、
**SSE-Diag が診断状態の主権を持ち、Mol* を強力な可視化・操作基盤として利用し、Diagnosis Pipeline と Engine 拡張を矛盾なく内包できるアーキテクチャを固定すること**
である。

```

