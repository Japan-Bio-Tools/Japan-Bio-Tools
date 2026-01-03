# Architecture Notes (Implementation-facing)

This document connects the project constitution (in Project Instructions) to concrete implementation practices.

## Core principles we enforce in code

### 1) Browser-only / serverless
- Apps run on GitHub Pages.
- Input is via user local file selection (no PDB ID fetching).

### 2) No user structure file leaves the browser
- Never upload user mmCIF/PDB.
- Avoid adding dependencies that silently call external endpoints.

### 3) Mol* is the Single Source of Truth for structure parsing & identity
- Parsing/normalization of PDB/mmCIF should be delegated to Mol*.
- Residue/chain/atom identity follows Mol* model.

### 4) Separate Visualization (Mol*) and Compute (WASM)
- UI (apps/*) should not embed heavy compute logic.
- Compute logic should be UI-independent and move into `packages/wasm-core` when it appears.

### 5) Project “technical core”: inject/override custom data into visualization
- We prioritize capabilities like:
  - overriding SSE assignment
  - residue range annotations
  - scores/confidence overlays
- Implementation should be done as “data injection” into Mol* state rather than ad-hoc UI tricks.

## Current state (as of now)
- Apps exist: portal / sse-diag / tool-b
- WASM toolchain exists (Rust installed) but compute package is not yet introduced
- Mol* integration work starts from `sse-diag` first
