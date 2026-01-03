# Packages (shared libraries)

This directory contains shared modules used by apps under `apps/*`.

## Philosophy

- Do not over-abstract early.
- Extract common modules only when they are needed by 2+ apps.
- Keep a clean boundary so that adapters (e.g., Mol*) can be isolated later.

## Planned candidates (examples)

- `molstar-adapter/` — Mol* integration boundary and state injection patterns
- `wasm-core/` — Rust/WASM compute core (UI-independent)