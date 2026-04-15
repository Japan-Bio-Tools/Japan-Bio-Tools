# SSE Engine 契約

この文書は、Japan-Bio-Tools における SSE-Diag の SSE Engine 実行契約、Known-Methods Pivot、engine selection / resolution、`engine_key` / `engine_id`、`EngineExecutionRecord`、Engine metadata、capability / degradation / coverage の詳細正本である。  
親正本は [`../architecture.md`](../architecture.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。  
この文書は UI 契約、Diagnosis Pipeline の input / output 契約、Mol* 境界を定義しない。

---

## SSE Engine アーキテクチャ

### 目的

SSE-Diag では、複数の SSE Engine を将来的に追加・差し替えできることを前提とする。
本節は、Engine の位置づけ、現在の実装状態、目標構造、選択解決ルール、実行記録、metadata 契約を一貫した形で定義する。

この節の目的は次の 7 つである。

1. `prototype.rule` を主力から降格し、known method 比較ワークベンチへ移行する
2. known method engine を `engine_key` と metadata で監査可能にする
3. Engine 追加時に Viewer や Mol* adapter 側の変更を最小化する
4. Engine 選択と実行結果の監査可能性を確保する
5. 将来の Rust / WASM Engine を同じ契約で受け入れられる構造を保つ
6. Engine が増えても、比較成立・HUD・Contract・UI 一貫性を壊さない
7. async 実行時の stale result 採用事故を防ぐ

### 基本方針

* `SseEngine` を **唯一の実行契約** とする
* Engine は UI とは独立した計算コンポーネントとして扱う
* Viewer は Engine 実装の詳細を知らない
* Engine の生成は **registry / factory** を経由する
* Engine 差し替え後も、比較・HUD・Contract・監査のために必要な metadata 契約を壊さない
* 本節の目的は **最小の pluginability** を確保することであり、汎用 plugin platform を完成させることではない

### Known-Methods Pivot の目的

SSE-Diag の Override は、内部試作用ルールを主力にする段階から、known methods を並べて比較できるワークベンチへ移行する。  
ここでいう known method は、二次構造 assignment の既知アルゴリズムまたは既知実装系列を、SSE-Diag の Engine 契約に載せたものである。

この移行は、known method の結果を正解として扱うためではない。  
目的は、Baseline と Override の由来、入力充足度、互換性主張、coverage を明示したうえで、比較成立条件つきの診断を行うことである。

### known method catalog の定義

初期 catalog は次を軸にする。

| `engine_key` | 位置づけ |
| --- | --- |
| `dssp.explicit.v1` | DSSP 系 known method を明示的な Engine として扱う Override 候補 |
| `stride.v1` | STRIDE 系 known method を明示的な Engine として扱う Override 候補 |
| `psea.v1` | P-SEA 系 known method を明示的な Engine として扱う Override 候補 |
| `prototype.rule` | 内部試作用ルール。known method 比較の主力ではなく、動作確認・比較フレーム検証用に降格する |

`prototype.rule` は残してよいが、known algorithm として扱わない。  
また、`prototype.rule` を Viewer や adapter の特例分岐にしてはならない。

### known algorithm 命名責任

Engine の名前は、SSE-Diag が UI と監査記録で表示する主張である。  
したがって、`engine_key`、`engine_id`、`engine_name` は、実装が何を名乗るかを過大に表現してはならない。

守るべき原則:

* known method 名を含む Engine は、`fidelity_class` と `compatibility_claim` を必ず持つ
* upstream 実装と同一でない場合、同一実装であるかのように表示しない
* 互換性は `compatibility_claim` と provenance metadata で限定して表現する
* `correct` / `validated` / `trusted` / `accurate` の印象付けをしない

### 目標構造（Target Architecture）

最終的な目標構造は以下とする。

* Viewer は Engine 実装クラスを直接 `new` しない
* Viewer は `requested_engine_key` と `params` だけを持つ
* Engine の実体生成は **registry / factory** を経由する
* Engine 追加時に、Viewer 側の変更は最小で済む
* Viewer / adapter に `prototype.rule` 特例分岐を持ち込まない
* known method の追加は Engine descriptor と Engine 実装の追加として扱う

### 実行契約（Execution Contract）

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
* capability / degradation / coverage を結果として表現できる
* UI state や Mol* adapter に依存しない
* 計算ロジックを Engine 内に閉じ込める

---

## engine selection / resolution の定義

#### 固定方針

* `requested_engine_key` **未指定** の場合のみ、既定 Engine を使用してよい
* `requested_engine_key` **未知** の場合は、**明示的に失敗**させる
* 未知 key を **silent fallback してはならない**

#### 解決モード

実行記録・ログでは、少なくとも以下を区別できること。

* `direct`
* `default_used`
* `failed_unknown_key`

---

## engine_key と engine_id の意味分離

* `requested_engine_key`

  * ユーザーまたは設定が要求した Engine の選択キー
* `resolved_engine_id`

  * 実際に実行された Engine の識別子

原則として、HUD では主に `engine_name` を表示してよいが、
Contract / ログ / 再現性確認では `requested` と `resolved` を区別できること。

known method catalog では、`engine_key` はユーザーまたは設定が要求する選択キーであり、`engine_id` は実行された実装を監査する識別子である。  
たとえば `stride.v1` を要求しても、Contract / ログでは実際に解決された `resolved_engine_id` と provenance metadata を確認できなければならない。

---

## EngineExecutionRecord の定義

Engine 解決失敗時には `SseEngineOutput` 自体が存在しない。
したがって、Engine 選択と実行の監査情報は `SseEngineOutput` とは別に、**EngineExecutionRecord** として扱えることを前提とする。

#### 目的

* Engine 解決失敗時でも、何を要求し、どこで止まったかを追える
* 成功時も、解決情報と計算結果を分けて整理できる
* stale candidate と discard 確定を追跡できる

`stale_candidate` と discard 確定の責務分離は [診断パイプライン](diagnosis-pipeline.md) を正本とする。

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

---

## stale result 非採用方針

`SseEngine.compute(...)` を async 契約にする以上、**古い実行結果を UI へ採用してはならない**。

#### 必須要件

Viewer は少なくとも、以下のどちらかを満たすこと。

1. `run_id` により、最新ではない結果を破棄する
2. `AbortSignal` により、古い実行を中断する

初期実装では、**`run_id` による stale result 棄却**を最低条件としてよい。
`AbortSignal` 対応は推奨だが、初期段階の必須条件とはしない。

---

## Engine metadata 契約

Engine のプラガブル化後も、比較・表示・監査のために、以下の metadata 契約は維持する。

最低限維持する項目:

* `engine_id`
* `engine_name`
* `engine_version`
* `engine_stage`
* `engine_input_schema_version`
* `fidelity_class`
* `compatibility_claim`
* `implementation_origin`
* `input_profile`
* `effective_params`
* `capability`
* `degradation`
* `coverage`

必要に応じて、以下を持てる。

* `implementation_reference`
* `upstream_version_label`

#### input_profile の目的

その Engine が今回どの入力前提で計算したかを示す。
比較条件の説明と再現性確認に使う。

#### effective_params の目的

ユーザーが渡した生の input params ではなく、
Engine 内部で正規化・default 補完された後の **実効設定** を表す。

#### fidelity_class の定義

`fidelity_class` は、Engine が known method に対してどの深さの実装主張を持つかを表す必須 metadata である。  
これは正確性保証ではなく、実装由来と互換性主張の強さを読むための分類である。

初期値は次を許容する。

* `prototype`: known method 互換を主張しない内部試作用ルール
* `method_inspired`: known method を参考にするが、互換出力を主張しない実装
* `explicit_reimplementation`: 既知アルゴリズムの仕様または参照資料に基づく明示的な再実装
* `upstream_wrapped`: upstream 実装またはその移植を wrapper として利用する実装

#### compatibility_claim の定義

`compatibility_claim` は、その Engine が何とどの範囲で互換と主張するかを説明する必須 metadata である。  
空文字や暗黙の既定値は禁止する。known method 名を名乗る Engine は、互換性の範囲、既知の差分、未対応入力をここで限定してよい。

#### implementation_origin の定義

`implementation_origin` は、実装の由来を表す必須 metadata である。  
初期値は次を許容する。

* `internal`: SSE-Diag 内部実装
* `ported`: 既存実装または既存資料からの移植
* `wrapped_upstream`: upstream 実装を wrapper として利用
* `external_reference`: 外部参照に基づく再実装

#### implementation_reference / upstream_version_label の定義

`implementation_reference` は、参照した論文、仕様、実装、または repository などを示す provenance 深度である。  
`upstream_version_label` は、upstream 実装や移植元の版を識別できる場合に持つ。

これらは、すべての Engine で常に値を持てるとは限らない。  
ただし known method 名を UI に出す場合は、値が未設定であることも Diag で監査可能にする。

---

## capability / degradation / coverage の定義

### capability の定義

`capability` は、Engine が必要とする入力、利用できる optional 入力、未対応条件を示す metadata である。  
少なくとも、required input、optional input、unsupported condition を区別できること。

### degradation の定義

`degraded` は、required input 未達だが engine 固有 policy に従って assignment を返した状態である。  
これは通常の assignment と同一品質として扱ってはならない。

Engine は degraded assignment を返す場合、理由と policy を結果または metadata で監査可能にする。  
required input 未達により assignment を返せない場合は、`unavailable` として扱い、黙って `C` に吸収してはならない。

### coverage の定義

`coverage` は、Engine が assignment を返せた範囲を示す。  
これは Mapping の `mapped_rate` とは別概念である。

* `coverage`: Override Engine が候補 residue に対して assignment を返せた範囲
* `mapped_rate`: Baseline 側 candidate と Override 側 assignment を比較可能に対応付けできた割合

UI や Contract では、この 2 つを混同してはならない。

---

## engine stage の定義

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

---

## default engine の扱い

`stride.v1` は default override の候補とする。  
ただし、次の条件が揃うまでは default を `stride.v1` へ切り替えない。

* `stride.v1` が `fidelity_class`、`compatibility_claim`、`implementation_origin` を持つ
* 必要な `implementation_reference` / `upstream_version_label` の有無が Diag で監査可能である
* Baseline 側で `baseline_source_kind` / `baseline_resolved_source` が明示される
* capability / degradation / coverage が HUD または Diag で確認できる
* unavailable / degraded を黙って `C` に吸収しない表示と summary が成立している
* `EngineInput v2` の raw backbone carrier が Pipeline から渡される

default 使用は、引き続き **requested_engine_key が未指定の場合のみ** 許可される。  
未知 key 指定時に default Engine へ流すことは許可しない。

---

## WASM engine との整合

将来 Rust / WASM Engine を導入する場合も、同じ `SseEngine` 契約に従う。

守るべき原則:

* Viewer は WASM の実装詳細を知らない
* WASM Engine も registry / factory 経由で生成される
* Mol* から抽出した最小データのみを Engine 入力として渡す
* Rust 側で mmCIF / PDB を再パースしない
* async 契約をそのまま利用する
* stale result を採用しない

---

## 成立条件

Known-Methods Pivot が Engine 契約として成立したと見なす最低条件は以下である。

1. Viewer が個別 Engine 実装を直接 `new` していない
2. Engine 生成が registry / factory 経由になっている
3. `prototype.rule` が known method 主力から降格している
4. `dssp.explicit.v1`、`stride.v1`、`psea.v1` を catalog 上の known method 候補として扱える
5. known method 名を持つ Engine が `fidelity_class` と `compatibility_claim` を必ず持つ
6. `implementation_origin` を必ず持つ
7. `implementation_reference` / `upstream_version_label` の有無を監査できる
8. capability / degradation / coverage を記録できる
9. degraded assignment と unavailable assignment を黙って `C` に吸収しない
10. unknown key は silent fallback せず、明示失敗する
11. `requested_engine_key` と `resolved_engine_id` を追跡できる
12. `input_profile` と `effective_params` を記録できる
13. `compute(input): Promise<SseEngineOutput>` 契約が全 Engine で統一される
14. Viewer / adapter に `prototype.rule` 特例分岐を持ち込まない
15. EngineExecutionRecord により、解決失敗と成功の両方を監査できる
16. stale result を UI に採用しない
17. `stride.v1` は切替ゲートを満たすまで default override にしない

---

## 非目的

本節は以下を要求しない。

* 複数 Engine の同時比較
* Engine ごとの複雑な設定 UI
* Engine recommendation / ranking
* Engine score
* WASM Engine の同時実装
* 汎用 plugin platform の完成
* AbortSignal 対応の完全実装を初期段階から必須化すること
* known method の正確性保証
* upstream 実装との完全一致保証
* Baseline を Mol* auto 以外へ切り替えること
