# Architecture

## Overview

Japan-Bio-Tools は、**ブラウザ完結・完全サーバーレス**で動作する
構造バイオインフォマティクス向けツール群である。

本プロジェクトの設計思想の中心は、以下に集約される。

- 構造データ（mmCIF / PDB）は **ユーザーのローカル環境のみ**で処理する
- 可視化と計算を明確に分離する
- Mol* を一次ソース（Single Source of Truth, SSOT）として扱う
- 外部で計算・生成した任意データを可視化へ「注入」できる構造を保つ

---

## Mol* as Single Source of Truth

### 基本方針

本プロジェクトでは、**構造データの読み込み・正規化・同一性管理は Mol* を一次ソースとする**。

- mmCIF / PDB のパースは Mol* に委譲する
- 残基・鎖・原子の同一性、インデックス、モデル構造は Mol* のデータモデルに従う
- 独自パーサは原則実装しない

これは、以下の理由による。

- mmCIF / PDB の仕様差・曖昧さを各ツールで再実装しないため
- 将来的な Mol* 側仕様変更への追従を容易にするため
- 可視化と計算結果の整合性を保証するため

---

## Visualization and Computation Separation

### 概念分離

- **可視化レイヤ**
  - Mol* を使用
  - 表示・選択・描画状態の管理を担当
- **計算レイヤ**
  - Rust + WebAssembly
  - SSE 判定、スコア計算、診断アルゴリズム等を担当
  - UI / Mol* に直接依存しない

計算結果は、Mol* の State へ **後から注入・上書き**される。

---

## Data Injection Model (Core Capability)

本プロジェクトの技術的コアは、

> **外部で計算・生成したカスタムデータを、Mol* の可視化表現へ注入・上書きできる能力**

である。

注入対象は固定しない。

例：
- 二次構造（SSE）
- 残基・領域アノテーション
- スコア・分類・信頼度
- 診断用メタ情報

特定アルゴリズムへの固定を避け、
差し替え・比較・拡張が可能な構造を維持する。

---

## Stepwise Integration Strategy

### Phase 0: sse-diag

- Mol* 統合の初期実装は **sse-diag** から開始する
- mmCIF / PDB 読み込み
- Mol* State を用いた SSE 表示の差し替え
- カスタム判定結果の可視化反映

### Phase 1: Adapter Extraction (Future)

- 2つ以上のツールで Mol* 統合パターンが安定した時点で、
  `packages/molstar-adapter` として切り出すことを想定
- 初期段階では共通化を強制しない

---

## Dependency Boundary

Mol* への依存は、将来的に **adapter 層として隔離可能**であることを常に意識する。

- 初期実装では直接利用してよい
- ただし、境界を意識した設計を保つ
