# Mol* 境界

この文書は、Japan-Bio-Tools における SSE-Diag の Mol* SSOT、Mol* の責務、Mol* が持ってはいけない真実、Mol* adapter 境界の詳細正本である。  
親正本は [`../architecture.md`](../architecture.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。  
この文書は状態定義、UI 契約、Diagnosis Pipeline 契約、SSE Engine 契約を定義しない。

---

## Mol* を SSOT とする原則

- 構造データの読み込み・正規化は Mol* を一次ソースとする
- 残基・鎖・原子・モデルの同一性は Mol* 準拠
- 独自パーサは原則実装しない
- Known-Methods Pivot 後も、Baseline は Mol* auto を維持する

Mol* は構造 SSOT と raw backbone 抽出元である。  
ただし、Mol* は comparison truth を持たない。

---

## Mol* の責務

Mol* は、SSE-Diag における

* 構造データ SSOT
* 3D 表示
* selection / focus / highlight
* camera
* rebuild / theme 適用

を担う基盤である。

---

## Mol* が持ってはいけない真実

次の状態を SSE-Diag 側と Mol* 側で二重管理してはならない。

- `comparison_status`
- `view_mode`
- `selection`
- `Comparison Contract`
- `EngineExecutionRecord`
- stale result 採用可否
- selected review point の真実

---

## SSE-Diag と Mol* の親子関係の詳細

### 親

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

### 子

**Mol*** は 3D 表示・選択・focus・highlight・camera・rebuild を担う子コンポーネントである。

Mol* は次を担う。

- 3D 構造表示
- representation 更新
- focus
- highlight
- loci 選択
- camera
- rebuild / theme 適用

### してはいけないこと

- Mol* 側に `comparison_status` を持たせる
- Mol* 側に Contract を持たせる
- Mol* 側に ExecutionRecord を持たせる
- SSE-Diag を単なる設定パネルにする

---

## Mol* adapter の責務境界

Mol* adapter は、引き続き以下の責務に限定する。

* Baseline 取得
* residue key 抽出
* raw backbone carrier 抽出
* Override 注入
* focus / highlight
* rebuild / theme 適用

Engine は Mol* adapter の内部事情を知らない。
Mol* adapter も Engine の内部アルゴリズムを知らない。

---

## raw backbone 抽出の境界

Mol* adapter は、Mol* が読み込んだ構造から known method Engine に渡す raw backbone carrier を抽出してよい。  
raw backbone carrier は EngineInput v2 の一次入力であり、Pipeline service へ渡される。

Mol* adapter が行ってよいこと:

* Mol* model から residue key と backbone atom 情報を抽出する
* 欠落した backbone atom や座標を欠落として渡す
* 抽出できた範囲を carrier 上で明示する

Mol* adapter が行ってはいけないこと:

* `comparison_status` を判定する
* known method の assignment を推定する
* unavailable / degraded を `C` に変換する
* Engine の compatibility claim を補完する

---

## derived geometry の非代替原則

derived geometry は、表示や Engine 実装上の convenience として持ってよい。  
ただし、raw backbone の代替ではない。

raw backbone に required input の欠落がある場合、derived geometry だけで欠落を埋めたことにしてはならない。  
欠落は Engine 側の capability / degradation / coverage に反映される。

---

## Baseline / Override 適用と表示操作の境界

- Baseline / Override の詳細定義は [状態モデル](state-model.md) を正本とする
- Baseline 取得は Mol* auto を用い、Mol* adapter の境界内で行う
- Override 適用は Mol* adapter の境界内で行うが、Override の比較意味論は SSE-Diag 側が持つ
- Focus: Mol* の責務。selection の反映
- Highlight: Mol* の責務。selection の反映
- Rebuild: Mol* の責務。override 適用後の更新
