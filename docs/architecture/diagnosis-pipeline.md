# 診断パイプライン

この文書は、Japan-Bio-Tools における SSE-Diag の Diagnosis Pipeline Application Service、input / output 契約、`EngineInput v2` 構築、Viewer と service の責務分離、`stale_candidate` と discard 確定の責務分離の詳細正本である。  
親正本は [`../architecture.md`](../architecture.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。  
この文書は UI 契約、SSE Engine 契約、Mol* 境界を定義しない。Engine resolution と `EngineExecutionRecord` の詳細は [SSE Engine 契約](sse-engine.md) を正本とする。

---

## service の目的

Diagnosis Pipeline Application Service は、Viewer から診断オーケストレーションを薄くし、  
診断の真実を application service 側へ寄せるために導入する。

この節の目的は次である。

1. Viewer を入力イベント受理と結果表示へ集中させる
2. 診断パイプラインを 1 つの service として実行できるようにする
3. Engine 追加時に Viewer の分岐増加を防ぐ
4. `Comparison Contract` / `EngineExecutionRecord` / `comparison_status` を一貫生成する
5. HUD / Table / Diag / selection の元データを同一 run 結果に揃える
6. stale discard の監査可能性と採用権分離を両立させる

---

## Viewer と service の責務分離

### 主権

診断状態の主権は引き続き SSE-Diag が持つ。  
Mol* は Baseline 取得、override 適用、focus / highlight、rebuild の基盤であり、`comparison_status` や Contract の正本を持たない。

### Viewer の役割

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

### Pipeline service の役割

Pipeline service は以下を担う。

- Engine resolution
- `EngineExecutionRecord` の生成・更新
- `EngineInput v2` の構築
- engine 実行
- mapping
- `comparison_status` 決定
- diff rows / summary / diagnosis record 生成
- capability / degradation / coverage の結果伝播

---

## 入力契約

```ts
type DiagnosisContractContext = {
  baseline_source_kind: string;
  baseline_resolved_source: string;
  baseline_annotation_origin?: string | null;
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
  raw_backbone: RawBackboneCarrier;
  derived_geometry?: DerivedGeometryCarrier | null;

  contract_context: DiagnosisContractContext;
};
```

`RawBackboneCarrier` は、residue key と raw backbone atom の有無・座標を Engine へ運ぶ carrier である。  
`DerivedGeometryCarrier` は、raw backbone から得られる補助的な geometry carrier であり、必須入力の代替ではない。

#### 入力契約の原則

* service は Contract を生成するなら、その材料をすべて input として受け取る
* `comparison_scope`、`model_policy`、`mapping_basis` などを Viewer が後付けしない
* `baseline_source_kind`、`baseline_resolved_source`、`baseline_annotation_origin` は Contract 生成前の input として渡す
* `baseline_map` と `residue_keys` の関係を曖昧にしない
* known method Engine に渡す raw backbone carrier を Viewer が ad hoc に組み立てない
* `run_id` は service の外で発行される
* `override_profile` は input に含めず、service 側で effective 条件から組み立てる

---

## `EngineInput v2` 構築契約

engine 実行時の入力は、雰囲気で組み立てない。  
service は `buildEngineInput(...)` により、正式な `EngineInput v2` を生成してから `engine.compute(engineInput)` を呼ぶ。

```ts
function buildEngineInput(input: RunDiagnosisPipelineInput): SseEngineInputV2 {
  return {
    schema_version: 'engine-input.v2',
    residues: input.residue_keys,
    raw_backbone: input.raw_backbone,
    derived_geometry: input.derived_geometry ?? null,
  };
}
```

#### ルール

* `residue_keys` と `residues` の語を混在させない
* `raw_backbone` を known method Engine の一次入力 carrier とする
* `derived_geometry` は convenience として扱い、raw backbone の代替にしない
* Engine に渡した実入力は、必要に応じて metadata や execution record から追えるようにする
* 将来 input が厚くなっても、Viewer は `buildEngineInput(...)` の存在だけを前提とする
* raw backbone の抽出境界は [Mol* 境界](molstar-boundary.md) を正本とする
* `EngineInput v2` の Engine 側意味論は [SSE Engine 契約](sse-engine.md) を正本とする

### raw backbone carrier の組み立て

Pipeline service は、Mol* adapter から受け取った構造由来の raw backbone carrier を、そのまま Engine input の一次情報として渡す。  
service は known method のアルゴリズム詳細を知らず、raw backbone から独自に二次構造 assignment を推定しない。

raw backbone に required input の欠落がある場合、service は欠落を隠さず Engine へ渡す。  
その欠落を `degraded` として扱うか `unavailable` とするかは、Engine 固有 policy と Engine metadata の責務である。

---

## 出力契約

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
  engine_capability: EngineCapabilityReport | null;
  engine_degradation: EngineDegradationReport | null;
  engine_coverage: EngineCoverageReport | null;
  unavailable_reasons: EngineUnavailableReason[];

  stale_disposition: StaleDisposition;
  failed: boolean;
};
```

#### 出力契約の原則

* `output` がなくても `engine_execution_record` は返せること
* `comparison_summary`、`diff_rows`、`engine_execution_record`、`diagnosis_record` は同一 run 結果から導出されること
* capability / degradation / coverage / unavailable reasons は同一 run の Engine 結果または Engine metadata から運ぶこと
* unknown key は silent fallback しない
* unmapped / ambiguous / unavailable / degraded は通常の review points に黙って混ぜない
* stale 採用可否の最終判断は出力に含めない

### provenance と summary 生成

service は、Contract / summary 生成に必要な provenance を input と Engine 結果から集める。  
ただし、Engine の `fidelity_class`、`compatibility_claim`、`implementation_origin`、`implementation_reference`、`upstream_version_label` の意味は再定義しない。

service が行ってよいこと:

* baseline source 系 input を Contract detail へ運ぶ
* Engine metadata を `override_profile` と Diag 用 summary へ運ぶ
* capability / degradation / coverage を HUD / Diag の元データへ運ぶ
* unavailable reasons を通常 label value と分けて運ぶ

service が行ってはいけないこと:

* degraded assignment を通常 assignment へ格上げすること
* unavailable を `C` に変換すること
* known method の互換性主張を service 側で補完すること
* `implementation_reference` や `upstream_version_label` を推測で埋めること

---

## stale_candidate と discard 確定の責務分離

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

---

## service の副作用ポリシー

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

---

## Viewer に残すもの

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

---

## service に寄せるもの

Pipeline service に寄せるべきものは以下である。

* Engine resolution
* `EngineInput v2` 構築
* `EngineExecutionRecord` の生成・更新
* mapping 構築
* `comparison_status` 判定
* Contract summary / detail 生成
* HUD summary 生成
* diff rows 生成
* stale candidate 記録
* capability / degradation / coverage の伝播

---

## 成立条件

Diagnosis Pipeline Application Service が成立したと見なす最低条件は以下である。

1. Viewer が `engine.compute()` を直接ほぼ握らない
2. Viewer が resolution / mapping / summary 組み立ての中心実装場所でない
3. `runDiagnosisPipeline(...)` を 1 回呼ぶ形へ寄る
4. `EngineInput v2` 構築が `buildEngineInput(...)` に明示分離される
5. service は stale candidate を記録できる
6. shell は最終採用可否を決定できる
7. stale result は UI に採用されない
8. discard 候補理由を監査できる
9. service が stale を単独確定しない
10. Contract 生成に必要な baseline source と provenance 文脈が input に明示されている
11. `override_profile` は effective engine 条件から service 側で生成される
12. `comparison_summary` / `diff_rows` / `engine_execution_record` / `diagnosis_record` が同一 run 結果由来である
13. HUD / Table / Diag が同一 run の診断結果を参照する
14. selection が現在採用中の `diff_rows` と整合する
15. viewer highlight / focus が現在採用中 selection と整合する
16. capability / degradation / coverage が同一 run 結果として運ばれる
17. unavailable / degraded が通常 diff へ黙って混入しない
18. `prototype.rule` の降格後も比較フレーム検証用 Engine として動作確認できる
19. baseline restore / override apply の動作が維持される

---

## 非目的

本節は以下を要求しない。

* 第 2 Engine の導入そのもの
* 複数 Engine の同時比較
* Engine ごとの複雑な設定 UI
* packages 化
* analytics 基盤の導入
