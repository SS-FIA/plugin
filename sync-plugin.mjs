#!/usr/bin/env node
/**
 * ビルド成果物を公開用 plugin/ リポジトリへコピーする。
 * 使い方: npm run sync-plugin
 * オプション: --git-add → plugin/ 内で git add まで実行（commit/push は手動）
 */

import { copyFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname);
const pluginDir = join(root, "plugin");

const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const doGitAdd = process.argv.includes("--git-add");

// 1) ビルド（bun を優先、失敗したら npm）
console.log("Building...");
let build = spawnSync("bun", ["run", "build"], { cwd: root, stdio: "inherit", shell: true });
if (build.status !== 0) {
  build = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit", shell: true });
}
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// 2) plugin/ へコピー
for (const name of ARTIFACTS) {
  const src = join(root, name);
  const dest = join(pluginDir, name);
  if (!existsSync(src)) {
    if (name === "styles.css") continue; // オプションなのでスキップ
    console.error(`Error: ${name} not found. Build may have failed.`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`Copied ${name} → plugin/`);
}

// 3) オプション: plugin/ で git add（コピー済みのファイルのみ）
if (doGitAdd) {
  const toAdd = ARTIFACTS.filter((name) => existsSync(join(pluginDir, name)));
  if (toAdd.length) {
    const add = spawnSync("git", ["add", ...toAdd], {
      cwd: pluginDir,
      stdio: "inherit",
    });
    if (add.status !== 0) process.exit(add.status ?? 1);
  }
  console.log("Done. In plugin/: git commit -m '...' && git push");
} else {
  console.log("Done. To publish: cd plugin && git add main.js manifest.json styles.css && git commit -m '...' && git push");
}
