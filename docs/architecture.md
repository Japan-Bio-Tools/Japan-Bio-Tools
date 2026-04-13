# アーキテクチャ

## この文書の位置づけ

この文書は、Japan-Bio-Tools における **SSE-Diag アーキテクチャの親正本** である。
全体の不変条件、診断状態の主権の所在、文書体系、参照ルールを定義する。

この文書は、詳細契約の本文を再掲しない。
詳細定義の正本は [`docs/architecture/`](architecture/) 配下の各子文書に置く。
親文書は、子文書の要約と索引を担う。

---

## 参照ルール

- 親正本はこの文書である。
- 詳細定義は、該当領域の子文書を正本とする。
- 各概念の詳細定義は 1 箇所にのみ置き、他文書では要約とリンクに留める。
- 子文書は、この文書が定める不変条件と主権の所在に従う。
- 可変の実装順、KPI、検証観点は [`roadmap.md`](architecture/roadmap.md) を参照する。

---

## 詳細正本一覧

| 領域 | 詳細正本 |
| --- | --- |
| 目的、非目的、全体像 | [全体像](architecture/overview.md) |
| `comparison_status`、`view_mode`、`selection`、Baseline / Override / Mapping、Baseline source、`candidate_set`、`mapped_rate`、availability / value、unavailable / degraded | [状態モデル](architecture/state-model.md) |
| HUD / Table / Diag / Viewer の責務、DiffRow、selection の UI 整合性、Known-Methods Pivot の表示契約 | [UI 契約](architecture/ui-contract.md) |
| Diagnosis Pipeline の input / output 契約、`EngineInput v2`、service 責務、`stale_candidate` と discard の責務分離 | [診断パイプライン](architecture/diagnosis-pipeline.md) |
| Known-Methods Pivot、SSE Engine resolution、`engine_key` / `engine_id`、`EngineExecutionRecord`、Engine metadata、capability / degradation / coverage | [SSE Engine 契約](architecture/sse-engine.md) |
| Mol* SSOT、Mol* 境界、raw backbone 抽出、Mol* が持たない真実 | [Mol* 境界](architecture/molstar-boundary.md) |
| リリース順、実装順、KPI、検証観点 | [ロードマップ](architecture/roadmap.md) |

---

## アーキテクチャ要約

SSE-Diag は、Mol* を構造可視化と構造データ SSOT の基盤として利用しつつ、  
Mol* 標準 SSE（Baseline）と外部計算 SSE（Override）を、  
**比較成立条件つきで診断できるツール**を提供する。

価値は次の 3 点にある。

1. **比較成立**  
   Mapping を分離し、比較不能を差分に混ぜない。

2. **監査可能性**  
   どういう条件で比較したかを Contract / ExecutionRecord として追える。

3. **探索導線**  
   Review points を HUD / Table / Viewer 連携で追える。

全体像の詳細は [全体像](architecture/overview.md) を参照する。

---

## 不変条件

### ブラウザ完結

- 完全サーバーレス
- PDB / mmCIF を外部送信しない
- ローカル読み込み＋ブラウザ内計算で完結する

### Mol* SSOT の原則

- 構造データの読み込み・正規化は Mol* を一次ソースとする
- 残基・鎖・原子・モデルの同一性は Mol* 準拠
- 独自パーサは原則実装しない

Mol* 境界の詳細は [Mol* 境界](architecture/molstar-boundary.md) を参照する。

### 主権の所在

- **診断状態の主権は SSE-Diag が持つ**
- Mol* は viewer / rendering / interaction 基盤として使う
- Mol* 側に比較状態の真実を持ち込まない

比較状態、表示モード、選択、Contract、ExecutionRecord、stale result 採用可否、selected review point の真実は、SSE-Diag 側だけが持つ。
Mol* が持ってはいけない真実の詳細は [Mol* 境界](architecture/molstar-boundary.md) を参照する。

---

## 表現ポリシー

### 推奨語彙

* review points
* comparison
* baseline
* override
* contract
* mapping
* partial

### 禁止語彙

* correct
* validated
* trusted
* accurate
* issue
* problem

---

## 親正本としての非目的

この文書は以下を要求しない。

* 複数 Engine の同時比較
* Engine ごとの複雑な設定 UI
* Engine recommendation / ranking
* Engine score
* viewer 全機能の自前再実装
* plugin marketplace 向け配布
* Mol* をホスト基盤にすること

本体系の目的は、
**SSE-Diag が診断状態の主権を持ち、Mol* を強力な可視化・操作基盤として利用し、Diagnosis Pipeline と Engine 拡張を矛盾なく内包できるアーキテクチャを固定すること**
である。

