# Japan-Bio-Tools

Browser-only, serverless bioinformatics tools (React + Vite + Mol* + Rust/WASM).

- Runs entirely on GitHub Pages
- User-provided PDB/mmCIF is processed locally in the browser (no upload)
- Monorepo with multiple sub-apps under a single Pages site

## Apps

- Portal: `/Japan-Bio-Tools/`
- SSE Diag: `/Japan-Bio-Tools/sse-diag/`
- Tool B: `/Japan-Bio-Tools/tool-b/`

## Quick start

```bash
npm ci
npm run dev:portal
````

## Dev commands

```bash
npm run dev:sse-diag
npm run dev:tool-b
npm run lint:all
```

## Build for GitHub Pages

```bash
npm run build:pages
```

## Docs

* docs/dev-setup.md
* docs/deploy-github-pages.md
* docs/security-privacy.md
* docs/architecture.md

````