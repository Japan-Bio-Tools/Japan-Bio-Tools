# 全体像

この文書は、Japan-Bio-Tools における SSE-Diag の目的、価値、非目的、初回診断、Mol* との高レベル関係を定義する全体像の詳細正本である。  
親正本は [`../architecture.md`](../architecture.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。  
この文書は状態モデル、UI 契約、Diagnosis Pipeline、SSE Engine、Mol* 境界、ロードマップの詳細契約を定義しない。

---

## なぜこの形にしたか

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

## プロダクト定義

### 目的

SSE-Diag は、Mol* を構造可視化と構造データ SSOT の基盤として利用しつつ、  
Mol* 標準 SSE（Baseline）と外部計算 SSE（Override）を、  
**比較成立条件つきで診断できるツール**を提供する。

Known-Methods Pivot 後は、内部試作用ルールを主力にするのではなく、既知手法を明示的な Override 候補として扱う比較ワークベンチへ寄せる。  
ただし、known method の結果を正解として扱うのではなく、由来・互換性主張・入力充足度を監査できる比較対象として扱う。

### 本プロダクトの価値

本ツールの価値は「SSE を出すこと」そのものではない。価値は次の 3 点にある。

1. **比較成立**  
   Mapping を分離し、比較不能を差分に混ぜない。

2. **監査可能性**  
   どういう条件で比較したかを Contract / ExecutionRecord として追える。

3. **探索導線**  
   Review points を HUD / Table / Viewer 連携で追える。

### 補助コピー

- **同じ構造でも、解釈は一つじゃない。**
- **比較が成立した状態で、差異を追える。**

### 非目的

- 正誤判定をすること
- viewer 全機能を自前で再実装すること
- Mol* を置き換えること
- plugin marketplace 向けの plugin として成立させること
- 汎用 plugin platform を完成させること

---

## 初回の意味ある診断

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

## Mol* との関係の高レベル説明

Mol* は、SSE-Diag における

* 構造データ SSOT
* 3D 表示
* selection / focus / highlight
* camera
* rebuild / theme 適用

を担う基盤である。

採用しないもの:

* Mol* をアプリ主権のホスト基盤にすること
* Mol* 側に comparison / contract / execution の真実を持たせること
* SSE-Diag を Mol* の従属パネルにすること

採用するもの:

* SSE-Diag 主権アプリの中で Mol* を深く使う
* Mol* を viewer / interaction engine として利用する
* Mol* の柔軟性は借りるが、主権は渡さない

---

## WASM / Rust 方針の高レベル説明

WASM 化は Engine 実装の差し替えとして扱う。
viewer / shell / pipeline service の責務分離を壊す変更として扱わない。

原則:

* Viewer は WASM 詳細を知らない
* registry / factory 経由で使う
* Mol* から抽出した最小データのみを渡す
* Rust 側で mmCIF / PDB を再パースしない
* async 契約を維持する
* stale result を採用しない
