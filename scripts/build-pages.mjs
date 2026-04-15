import { rmSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const sh = (cmd) => execSync(cmd, { stdio: "inherit" });

const copyDir = (from, to) => {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
};

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

// build
sh("npm --workspace apps/portal run build");
sh("npm --workspace apps/biofile-guide run build");

// copy
copyDir("apps/portal/dist", "dist");
copyDir("apps/biofile-guide/dist", "dist/biofile-guide");

// disable jekyll
writeFileSync("dist/.nojekyll", "");
console.log("Built combined dist/ for GitHub Pages.");
