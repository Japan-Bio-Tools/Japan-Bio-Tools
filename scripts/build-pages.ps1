$ErrorActionPreference = "Stop"

# clean
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
New-Item -ItemType Directory -Path "dist" | Out-Null

# build apps
npm --workspace apps/portal run build
npm --workspace apps/tool-a run build
npm --workspace apps/tool-b run build

# copy outputs
Copy-Item -Recurse -Force "apps/portal/dist/*" "dist/"
New-Item -ItemType Directory -Path "dist/tool-a" | Out-Null
New-Item -ItemType Directory -Path "dist/tool-b" | Out-Null
Copy-Item -Recurse -Force "apps/tool-a/dist/*" "dist/tool-a/"
Copy-Item -Recurse -Force "apps/tool-b/dist/*" "dist/tool-b/"

# disable jekyll
New-Item -ItemType File -Path "dist/.nojekyll" | Out-Null

Write-Host "Built combined dist/ for GitHub Pages."
