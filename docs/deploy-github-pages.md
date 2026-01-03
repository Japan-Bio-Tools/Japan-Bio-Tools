
---

### `docs/deploy-github-pages.md`
```md
# Deploy: GitHub Pages

## Overview

Deployment is triggered on `push` to `main`.
The workflow builds a combined `dist/` and uploads it as the Pages artifact.

## Build pipeline

Root script:

- `npm run build:pages`
- Implementation: `scripts/build-pages.mjs`

Steps:
1. Remove old `dist/`
2. Build each app workspace:
   - `npm --workspace apps/portal run build`
   - `npm --workspace apps/sse-diag run build`
   - `npm --workspace apps/tool-b run build`
3. Copy:
   - `apps/portal/dist` -> `dist/`
   - `apps/sse-diag/dist` -> `dist/sse-diag/`
   - `apps/tool-b/dist` -> `dist/tool-b/`
4. Create `dist/.nojekyll`

## Why we merge dist/

GitHub Pages deploys a single directory.
We want multiple sub-apps under:

- `/Japan-Bio-Tools/` (portal)
- `/Japan-Bio-Tools/sse-diag/`
- `/Japan-Bio-Tools/tool-b/`

So we build each app separately and then combine outputs into one `dist/`.
````

---