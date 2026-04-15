# ロードマップ

この文書は、Japan-Bio-Tools における SSE-Diag のリリース順、実装順、KPI、検証観点を扱う可変計画の詳細正本である。  
親正本は [`../architecture.md`](../architecture.md) であり、この文書は親正本が定める不変条件と参照ルールに従う。  
この文書は不変条件、状態定義、UI 契約、Diagnosis Pipeline 契約、SSE Engine 契約、Mol* 境界を定義しない。

---

## この文書の性質

- この文書は契約文書ではなく、実装状況と検証結果に応じて更新される可変文書である。
- 契約や状態定義を変更する場合は、該当領域の詳細正本を更新する。
- この文書は、実装の優先順位、測定対象、検証観点を整理するために使う。

---

## リリース順

* R1: 即時切替＋Baseline復元
* R1.5: HUD compact / expanded
* R2: Diff Table
* R2.5: 分類 pure 関数
* R3: focus / highlight + Prev / Next
* R4: HUD 洗練

---

## 実装順

1. **Known-Methods Pivot 契約の反映**  
   `prototype.rule` を主力から降格し、known method catalog と provenance metadata を Engine 契約へ反映する。

2. **EngineInput v2 raw carrier 導入**  
   Pipeline が Mol* 由来 raw backbone carrier を組み立て、known method Engine へ渡せるようにする。

3. **capability / degradation / coverage の伝播と表示**  
   Engine 結果から HUD / Diag まで、coverage、degraded、unavailable reasons を同一 run 結果として運ぶ。

4. **known method 候補の追加**  
   `dssp.explicit.v1`、`stride.v1`、`psea.v1` を catalog 上の Override 候補として扱う。

5. **`stride.v1` default override 切替判定**  
   provenance / baseline semantics / capability 表示が揃った後にのみ、`stride.v1` の default 化を判断する。

---

## `stride.v1` default override 切替ゲート

`stride.v1` は default override 候補である。  
ただし、切替ゲートの**詳細契約**は [`./sse-engine.md`](./sse-engine.md) を正本とする。

この文書では、切替判定を次の**検証観点**として扱う。

- provenance が HUD / Diag で追えること
- baseline semantics が表示できること
- capability / degradation / coverage が確認できること
- unavailable / degraded を黙って `C` に吸収しないこと
- `EngineInput v2` の raw backbone carrier が実装へ反映されていること

すなわち、`roadmap.md` は「いつ切り替えるか」を追跡し、  
「何を満たせば切り替えてよいか」の詳細定義は `sse-engine.md` を参照する。

---

## KPI

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
* `prototype.rule` 利用率
* known method engine 利用率
* `stride.v1` default 候補到達率
* coverage 率
* degraded assignment 率
* unavailable assignment 率
* provenance 表示到達率
* `fidelity_class` / `compatibility_claim` 表示率
* baseline resolved source 表示率

---

## 検証観点

2週間検証では、上記 KPI を測定する。  
検証観点は、比較成立、監査導線、探索導線、engine resolution、stale result 棄却、known method catalog、coverage、degradation、unavailable、provenance 表示、第 2 Engine 追加時の Viewer 変更量に分ける。
