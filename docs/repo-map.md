
# Repo Map (Monorepo)

## Top-level

- `apps/*` — user-facing web apps (Vite + React + TypeScript)
- `packages/*` — shared libraries (planned / incremental)
- `scripts/*` — build utilities (e.g. Pages dist merge)
- `docs/*` — project documentation (this folder)

## Apps

- `apps/portal`  
  Landing page / navigation to sub tools.

- `apps/sse-diag`  
  Secondary structure diagnostics tool (work in progress).

- `apps/tool-b`  
  Placeholder for another tool (work in progress).

## Packages (planned)

This repo keeps room for shared modules, e.g.

- `packages/molstar-adapter` — Mol* integration boundary / state injection patterns
- `packages/wasm-core` — Rust/WASM compute core (UI-independent)

Note: packages are intentionally not over-abstracted early; we extract when needed.
