# Architecture

## 0. この文書の位置づけ

この文書は、Japan-Bio-Tools における **SSE-Diag の正本仕様** である。
SSE-Diag の目的、責務分離、状態機械、UI契約、データ契約、Engine契約、実装順は本書を優先する。

本書は **設計上の凍結点** を定義する。
個別タスク、差分パッチ、Codex への依頼文は、本書を参照して作成する。

---

## 1. なぜこの形にしたか

SSE-Diag は当初、Mol* を使った SSE 比較診断ツールとして、外部計算結果を Mol* 表示へ注入・上書きし、標準SSEとの差異を診断する構想として始まった。

議論の過程では、次の選択肢が検討された。

* standalone アプリとして進める案
* Mol* plugin 的な構造へ寄せる案
* plugin + 別窓 UI で診断主権を持つ案

再検討の結果、現在の結論は次である。

* **プラグイン方式は採らない**
* **SSE-Diag がアプリ主権を持つ**
* **Mol* は構造データSSOTおよび 3D 表示・操作基盤として強く使う**
* **ただし Mol* をホスト基盤にはしない**
* **Engine は将来追加可能な最小 pluginability を持たせる**

つまり、SSE-Diag は
**「Mol* を深く使うが、Mol* に主権は渡さない診断アプリ」**
として定義する。

---

## 2. プロダクト定義

### 2.1 目的

SSE-Diag は、Mol* を構造可視化と構造データSSOTの基盤として利用しつつ、
Mol*標準SSE（Baseline）と外部計算SSE（Override）を、
**比較成立条件つきで診断できるツール**を提供する。

### 2.2 本プロダクトの価値

本ツールの価値は「SSEを出すこと」そのものではない。価値は次の3点にある。

1. **比較成立**
   Mapping を分離し、比較不能を差分に混ぜない

2. **監査可能性**
   どういう条件で比較したかを Contract / ExecutionRecord として追える

3. **探索導線**
   Review points を HUD / Table / Viewer 連携で追える

### 2.3 補助コピー

* **同じ構造でも、解釈は一つじゃない。**
* **比較が成立した状態で、差異を追える。**

### 2.4 非目的

* 正誤判定をすること
* viewer 全機能を自前で再実装すること
* Mol* を置き換えること
* plugin marketplace 向けの plugin として成立させること
* 汎用 plugin platform を完成させること

---

## 3. 不変条件

### 3.1 ブラウザ完結

* 完全サーバーレス
* PDB / mmCIF を外部送信しない
* ローカル読み込み＋ブラウザ内計算で完結する

### 3.2 Mol* SSOT

* 構造データの読み込み・正規化は Mol* を一次ソースとする
* 残基・鎖・原子・モデルの同一性は Mol* 準拠
* 独自パーサは原則実装しない

### 3.3 主権の所在

* **診断状態の主権は SSE-Diag が持つ**
* Mol* は viewer / rendering / interaction 基盤として使う
* Mol* 側に比較状態の真実を持ち込まない

### 3.4 二重主語化の禁止

次の状態を SSE-Diag 側と Mol* 側で二重管理してはならない。

* comparison_status
* view_mode
* Comparison Contract
* EngineExecutionRecord
* stale result 採用可否
* selected review point の真実

---

## 4. システムの親子関係

### 4.1 親

**SSE-Diag** がアプリ全体の親である。

SSE-Diag は次を正本として持つ。

* comparison_status
* view_mode
* selection
* Comparison Contract
* EngineExecutionRecord
* requested / resolved engine
* stale discard 判定
* HUD / Table / Diag に出す値
* logging / analytics の主系統

### 4.2 子

**Mol*** は 3D 表示・選択・focus・highlight・camera・rebuild を担う子コンポーネントである。

Mol* は次を担う。

* 3D 構造表示
* representation 更新
* focus
* highlight
* loci 選択
* camera
* rebuild / theme 適用

### 4.3 してはいけないこと

* Mol* 側に comparison_status を持たせる
* Mol* 側に Contract を持たせる
* Mol* 側に ExecutionRecord を持たせる
* SSE-Diag を単なる設定パネルにする

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

* 何が起きたか
* 今どこまで比較が成立しているか
* 何を見ればよいか

---

## 6. 状態機械

### 6.1 comparison_status

比較成立度を表す。

* `full`
* `partial`
* `baseline_only`

意味:

* `full`: Baseline / Override / Mapping / Diff が成立
* `partial`: Baseline は成立、Override / Mapping / Diff の一部が未成立
* `baseline_only`: Baseline のみ成立

### 6.2 view_mode

現在ユーザーが見ている表示。

* `baseline`
* `override`

### 6.3 selection

現在選択している review point。

* `selectedDiffIndex`
* `selectedDiffRow`
* `current kind_label`
* `current display_residue`

### 6.4 原則

`comparison_status`、`view_mode`、`selection` は**別概念**であり、混同しない。

例:

* `Status: Full / View: Baseline / Selected: 3 / 17`
* `Status: Partial / View: Override / Selected: —`

---

## 7. Baseline / Override / Mapping

### 7.1 Baseline

* Mol* 標準SSEを Baseline とする
* 取得条件は `baseline_profile` として記録可能

### 7.2 Override

* Engine が計算したSSEを Override とする
* Mol* viewer 側へ注入・上書き可能であること
* 計算条件は `override_profile` として記録可能

### 7.3 Mapping

差分算出前に、残基は次へ分類される。

* `mapped`
* `unmapped_baseline_only`
* `unmapped_override_only`
* `ambiguous`

### 7.4 ルール

* Diff の母集団は `mapped` のみ
* unmapped / ambiguous は review point 行に混ぜない
* これらは別表示で監査可能にする

---

## 8. candidate_set と mapped_rate

### 8.1 candidate_set

比較候補集合は **Baseline 側 residue key 集合** とする。

### 8.2 定義

* `candidate_count = |candidate_set|`
* `mapped_count = candidate_set のうち、一意に Override へ対応付けできた数`
* `mapped_rate = mapped_count / candidate_count`

### 8.3 表示規約

率だけを単独表示しない。件数を必ず併記する。

例:

* `Comparable 212 / Candidate 215 (98.6%)`

---

## 9. Comparison Contract

Comparison Contract は、「この比較がどう成立しているか」を示す主権情報であり、**SSE-Diag 側が保持する**。

### 9.1 Contract Summary

常時見えてよい最小要約。

必須項目:

* model_policy
* residue_key_policy
* mapping_basis
* mapped_count / candidate_count / mapped_rate
* engine_summary

### 9.2 Contract Detail

必要時に監査するための詳細。

必須項目:

* baseline_profile
* override_profile
* comparison_scope
* chain_policy
* model_policy
* mapping_basis

### 9.3 原則

Contract は SSE-Diag 側の 1 ブロックとして扱い、Mol* viewer 側へ分散させない。

---

## 10. 可用性（availability）と値（value）

### 10.1 原則

各メトリクスは、値と可用性を分ける。

* `available = false` → `—`
* `available = true` かつ `value = 0` → `0`

### 10.2 独立可用性

availability は項目ごとに独立し得る。

例:

* `Unmapped 12`
* `Review points —`

### 10.3 対象

最低限、以下は独立 availability を持つ。

* review_points
* comparable
* candidate_count
* unmapped_total
* ambiguous_count
* mapped_rate
* current selection 系

---

## 11. UI の責務分離

### 11.1 HUD

* 状態表示
* 現在表示の明示
* 現在位置の明示
* 最小ナビ（Prev / Next）

### 11.2 Table

* 全体把握
* filter / sort
* 行選択
* selection の正本UI

### 11.3 Diag

* Contract detail
* Engine detail
* ExecutionRecord 参照
* 監査の深掘り

### 11.4 Viewer

* 3D 根拠表示
* selection / highlight / focus の反映

---

## 12. Diff Table 契約

### 12.1 DiffRow

最低限、以下を持つ。

* `residue_key`
* `display_residue`
* `baseline_label`
* `override_label`
* `kind`
* `kind_label`
* `sort_key`
* `filterable`

### 12.2 原則

* `residue_key` = machine key
* `display_residue` = human-readable label
* UIでは原則 `display_residue` を使う

### 12.3 unmapped / ambiguous

これらは review point table に混ぜない。

---

## 13. SSE Engine Architecture（完全確定版）

### 13.1 目的

SSE-Diag では、複数の SSE Engine を将来的に追加・差し替えできることを前提とする。
本節は、Engine の位置づけ、現在の実装状態、目標構造、選択解決ルール、実行記録、metadata 契約を一貫した形で定義する。

この節の目的は次の 6 つである。

1. `prototype.rule` の位置づけを明確にする
2. Engine 追加時に Viewer や Mol* adapter 側の変更を最小化する
3. Engine 選択と実行結果の監査可能性を確保する
4. 将来の Rust / WASM Engine を同じ契約で受け入れられる構造を保つ
5. Engine が増えても、比較成立・HUD・Contract・UI一貫性を壊さない
6. async 実行時の stale result 採用事故を防ぐ

### 13.2 基本方針

* `SseEngine` を **唯一の実行契約** とする
* Engine は UI とは独立した計算コンポーネントとして扱う
* Viewer は Engine 実装の詳細を知らない
* Engine の生成は **registry / factory** を経由する
* Engine 差し替え後も、比較・HUD・Contract に必要な metadata 契約を壊さない
* 本節の目的は **最小の pluginability** を確保することであり、汎用 plugin platform を完成させることではない

### 13.3 現在の位置づけ（Current State）

現時点では、`prototype.rule` を既定 Engine として扱う。

この Engine は:

* 現在の初期実装
* override 注入機構・比較フレーム・UI 連携を検証するための既定 Engine
* 将来も残り得るが、**設計上は特別扱いしない**

重要なのは、`prototype.rule` は
**「現在の既定 Engine」ではあるが、「設計上の特権的存在」ではない**という点である。

今後追加される Engine（例: `baseline.pass_through`、`annotated.cif`、`dssp.annotation`、`wasm.default`）と同列の、**1つの Engine 実装**として扱う。

### 13.4 目標構造（Target Architecture）

最終的な目標構造は以下とする。

* Viewer は Engine 実装クラスを直接 `new` しない
* Viewer は `requested_engine_key` と `params` だけを持つ
* Engine の実体生成は **registry / factory** を経由する
* Engine 実装追加時に、Viewer 側の変更は最小で済む
* Viewer / adapter に `prototype.rule` 特例分岐を持ち込まない

つまり、Viewer は

* どの Engine を要求するか
* その Engine にどの params を渡すか

だけを知ればよく、
**個別 Engine クラスの import / direct instantiation を要求しない構造**を目指す。

### 13.5 実行契約（Execution Contract）

Engine はすべて `SseEngine` 契約に従う。

#### 実行インターフェース

すべての Engine は以下に従う。

```ts
compute(input): Promise<SseEngineOutput>
```

#### async 統一の理由

* 将来の Rust / WASM Engine を自然に受け入れるため
* Viewer 側の sync / async 分岐を防ぐため
* loading / pending state を一貫して扱えるようにするため

たとえ現在の `prototype.rule` が同期的に計算可能でも、契約上は `Promise` を返す形に統一する。

#### Engine の責務

各 Engine 実装は以下を担う。

* `compute(input)` を実装する
* `SseEngineOutput` を返す
* 必要な metadata を出力に含める
* UI state や Mol* adapter に依存しない
* 計算ロジックを Engine 内に閉じ込める

これにより、Engine の違いは
**計算の中身の違い**に閉じ込められ、
比較・HUD・Contract・Table 側は同じ契約で扱える。

### 13.6 Engine Selection Resolution（選択解決ルール）

Engine 選択は、以下のルールで解決する。

#### 固定方針

* `requested_engine_key` **未指定** の場合のみ、既定 Engine を使用してよい
* `requested_engine_key` **未知** の場合は、**明示的に失敗**させる
* 未知 key を **silent fallback してはならない**

#### 理由

このプロダクトの価値は比較成立と監査可能性にある。
したがって、

* ユーザーが何を要求したか
* 実際に何が走ったか

が曖昧になる設計は許容しない。

#### 解決モード

実行記録・ログでは、少なくとも以下を区別できること。

* `direct`
* `default_used`
* `failed_unknown_key`

必要なら将来拡張してよいが、初期段階ではこの最小集合で十分である。

### 13.7 engine_key と engine_id の意味分離

`engine_key` と `engine_id` は、同じ文字列になる場合があっても、**意味としては別**に扱う。

#### 定義

* `requested_engine_key`
  ユーザーまたは設定が要求した Engine の選択キー
* `resolved_engine_id`
  実際に実行された Engine の識別子

#### 原則

* HUD では主に `engine_name` を表示してよい
* Contract / ログ / 再現性確認では、`requested` と `resolved` を区別できること
* 「選んだつもりの Engine」と「実際に走った Engine」がズレた場合、それを追跡できること

### 13.8 EngineExecutionRecord（実行記録）

Engine 解決失敗時には `SseEngineOutput` 自体が存在しない。
したがって、Engine 選択と実行の監査情報は `SseEngineOutput` とは別に、**EngineExecutionRecord** として扱えることを前提とする。

#### 目的

* Engine 解決失敗時でも、何を要求し、どこで止まったかを追えるようにする
* 成功時も、解決情報と計算結果を分けて整理できるようにする
* stale result 棄却や async 実行追跡の単位を持つ

#### 最低限持つべき項目

* `run_id`
* `requested_engine_key`
* `resolved_engine_id | null`
* `resolution_mode`
* `status`

  * 例: `resolved` / `failed_resolution` / `running` / `completed` / `discarded_stale`
* `error | null`
* `started_at`
* `finished_at | null`

必要に応じて、以下を追加してよい。

* `effective_params`
* `engine_name`
* `engine_stage`

ただし、最初から巨大な実行履歴システムにしない。
本節の目的は、**解決失敗・実行成功・stale result 棄却を追える最低限の記録**を持つことにある。

### 13.9 stale result の不採用

`SseEngine.compute(...)` を async 契約にする以上、**古い実行結果を UI へ採用してはならない**。

#### 必須要件

Viewer は少なくとも、以下のどちらかを満たすこと。

1. `run_id` により、最新ではない結果を破棄する
2. `AbortSignal` により、古い実行を中断する

初期実装では、**`run_id` による stale result 棄却**を最低条件としてよい。
`AbortSignal` 対応は推奨だが、初期段階の必須条件とはしない。

#### 理由

ユーザーが

* A を選ぶ
* すぐ B を選ぶ
* しかし A の結果が後から着弾する

という状況で、A の結果を UI に採用すると、
**「今見ている Engine」と「表示されている結果」が食い違う**。
これは誤認であり、本プロダクトの監査可能性を壊す。

### 13.10 Engine Descriptor / Registry

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

ただし、descriptor / registry は **薄く保つ**。
目的は Engine 追加容易性であり、設定UIや複雑な schema editor を最初から抱え込むことではない。

### 13.11 schema version の意味分離

schema version は、**descriptor 側** と **実行結果側** で意味を分ける。

#### Descriptor 側

* `supported_input_schema_version`

意味:

* その Engine が **受け入れ可能な入力契約バージョン**

#### Output 側

* `engine_input_schema_version`

意味:

* 今回の実行で **実際に使われた入力契約バージョン**

#### 原則

* 同じ概念名として曖昧に扱わない
* 「受けられるもの」と「今回使ったもの」を区別する
* 将来の互換性確認・再現性確認で混同させない

### 13.12 Viewer の責務

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

現段階では、Viewer は **engine selector + params の保持** までで十分とする。
Engine 固有の複雑設定 UI は本節の非目的である。

### 13.13 Mol* adapter との境界

Mol* adapter は、引き続き以下の責務に限定する。

* Baseline 取得
* residue key 抽出
* Override 注入
* focus / highlight
* rebuild / theme 適用

Engine は Mol* adapter の内部事情を知らない。
Mol* adapter も Engine の内部アルゴリズムを知らない。

両者は `input` / `output` 契約を介して接続される。

### 13.14 Engine metadata 契約

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

`input_profile` は、その Engine が今回どの入力前提で計算したかを示す。
比較条件の説明と再現性確認に使う。

#### effective_params の目的

`effective_params` は、ユーザーが渡した生の input params ではなく、
Engine 内部で正規化・default 補完された後の **実効設定** を表す。

これにより、以下を後から追える。

* 何を入力したか
* 実際に何が使われたか
* なぜ結果がそうなったか

`effective_params` は HUD 常時表示を必須としない。
Diag・ログ・実行記録で追えればよい。

### 13.15 Engine Stage

Engine の成熟度は `engine_stage` で示す。

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

つまり、Engine が `reference_like` であっても、本プロダクトは正誤判定ツールにはならない。

### 13.16 既定 Engine と default 解決

初期段階では、`prototype.rule` を既定 Engine としてよい。

ただし、既定 Engine 使用は **requested_engine_key が未指定の場合のみ** 許可される。
未知 key 指定時に既定 Engine へ流すことは許可しない。

ログと監査では、最低限以下を追えること。

* `requested_engine_key`
* `resolved_engine_id`
* `resolution_mode`

これにより、default 使用と未知 key 失敗を明確に区別する。

### 13.17 WASM Engine との整合

将来 Rust / WASM Engine を導入する場合も、同じ `SseEngine` 契約に従う。

守るべき原則:

* Viewer は WASM の実装詳細を知らない
* WASM Engine も registry / factory 経由で生成される
* Mol* から抽出した最小データのみを Engine 入力として渡す
* Rust 側で mmCIF / PDB を再パースしない
* async 契約 (`Promise<SseEngineOutput>`) をそのまま利用する
* stale result を採用しない

つまり、WASM 化は
**Engine 実装の差し替え** として扱い、
可視化や SSOT を壊す変更として扱わない。

### 13.18 受け入れ条件（Pluginability の成立条件）

Engine のプラガブル化が成立したと見なす最低条件は以下。

1. Viewer が個別 Engine 実装を直接 `new` していない
2. Engine 生成が registry / factory 経由になっている
3. `prototype.rule` が「既定 Engine」として従来どおり動く
4. 2個目の Engine を追加しても Viewer 側の変更が最小で済む
5. 既存の R1〜R4（切替、HUD、Table、selection、focus/highlight）を壊さない
6. metadata 契約が維持される
7. unknown key は silent fallback せず、明示失敗する
8. `requested_engine_key` と `resolved_engine_id` を追跡できる
9. `input_profile` を記録できる
10. `effective_params` を記録できる
11. `compute(input): Promise<SseEngineOutput>` 契約が全 Engine で統一される
12. Viewer / adapter に `prototype.rule` 特例分岐を持ち込まない
13. EngineExecutionRecord により、解決失敗と成功の両方を監査できる
14. stale result を UI に採用しない

### 13.19 非目的

本節は以下を要求しない。

* 複数 Engine の同時比較
* Engine ごとの複雑な設定 UI
* Engine recommendation / ranking
* Engine score
* WASM Engine の同時実装
* 汎用 plugin platform の完成
* AbortSignal 対応の完全実装を初期段階から必須化すること

本節の目的はあくまで、
**Engine を追加・差し替えしても、比較成立・監査可能性・UI一貫性が壊れない最小構造を確保すること**である。

---

## 14. Mol* との関係

### 14.1 Mol* の役割

Mol* は、SSE-Diag における

* 構造データSSOT
* 3D 表示
* selection / focus / highlight
* camera
* rebuild / theme 適用

を担う基盤である。

### 14.2 採用しないもの

* Mol* をアプリ主権のホスト基盤にすること
* Mol* 側に comparison / contract / execution の真実を持たせること
* SSE-Diag を Mol* の従属パネルにすること

### 14.3 採用するもの

* SSE-Diag 主権アプリの中で Mol* を深く使う
* Mol* を viewer / interaction engine として利用する
* Mol* の柔軟性は借りるが、主権は渡さない

---

## 15. WASM / Rust 方針

### 15.1 位置づけ

WASM 化は Engine 実装の差し替えとして扱う。
viewer / shell の責務分離を壊す変更として扱わない。

### 15.2 原則

* Viewer は WASM 詳細を知らない
* registry / factory 経由で使う
* Mol* から抽出した最小データのみを渡す
* Rust 側で mmCIF / PDB を再パースしない
* async 契約を維持する
* stale result を採用しない

---

## 16. リリースと実装順

### 16.1 既存フェーズ

* R1: 即時切替＋Baseline復元
* R1.5: HUD compact/expanded
* R2: Diff Table
* R2.5: 分類 pure 関数
* R3: focus/highlight + Prev/Next
* R4: HUD 洗練

### 16.2 次の構造改修

次の基盤改修は、**Engine pluginability** を入れる。
これは plugin marketplace 的な plugin 化ではなく、**SSE-Diag 主権のまま Engine を増やしやすくするための内部構造改修**である。

---

## 17. 2週間検証KPI

* 初回比較成立率（full / partial / baseline_only）
* HUD展開率
* Contract detail 開封率
* Diff table 到達率
* Diff click / PrevNext 利用率
* Unmapped率
* Other比率
* view_mode 別滞在率
* unknown engine key 発生率
* default engine 使用率（未指定由来）
* engine resolution failure率
* stale result 棄却率
* engine 別比較成立率
* 2個目 Engine 追加時の Viewer 修正箇所数

---

## 18. 表現ポリシー

### 18.1 推奨語彙

* review points
* comparison
* baseline
* override
* contract
* mapping
* partial

### 18.2 禁止語彙

* correct
* validated
* trusted
* accurate
* issue
* problem

---

## 19. 非目的

この文書は以下を要求しない。

* 複数 Engine の同時比較
* Engine ごとの複雑な設定 UI
* Engine recommendation / ranking
* Engine score
* viewer 全機能の自前再実装
* plugin marketplace 向け配布
* Mol* をホスト基盤にすること

本書の目的はあくまで、
**SSE-Diag が診断状態の主権を持ち、Mol* を強力な可視化・操作基盤として利用するアーキテクチャを固定すること**である。

---

この版を入れた repomix を次に渡してください。
その状態を前提に、**Codex に実装させるためのプロンプト**を作ります。
