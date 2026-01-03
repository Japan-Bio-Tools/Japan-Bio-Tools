---

### `docs/dev-setup.md`
```md
# Dev Setup

## Requirements

- Node: v24.x (repo uses Node 24 in GitHub Actions)
- npm: v11.x

## Install

At repository root:

```bash
npm ci
````

## Run (dev server)

```bash
npm run dev:portal
npm run dev:sse-diag
npm run dev:tool-b
```

Each command delegates to the corresponding workspace under `apps/*`.

## Build (GitHub Pages)

This repository deploys **GitHub Pages from the root `dist/`** directory.

Build combined dist:

```bash
npm run build:pages
```

What it does:

1. Builds each workspace:

   * `apps/portal`
   * `apps/sse-diag`
   * `apps/tool-b`
2. Copies their `apps/*/dist` into a single root `dist/`:

   * portal -> `dist/`
   * sse-diag -> `dist/sse-diag/`
   * tool-b -> `dist/tool-b/`
3. Writes `dist/.nojekyll`

## Notes

### Vite `base`

Each app uses a fixed `base` so that assets resolve under GitHub Pages.

* portal: `/Japan-Bio-Tools/`
* sse-diag: `/Japan-Bio-Tools/sse-diag/`
* tool-b: `/Japan-Bio-Tools/tool-b/`

If you rename the repository, update these `base` values accordingly.

````