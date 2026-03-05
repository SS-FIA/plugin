import esbuild from "esbuild";
import { existsSync, mkdirSync, copyFileSync } from "fs";

const prod = process.argv[2] === "production";

const TEST_VAULT_PLUGIN_DIR =
  process.env.HOME + "/Documents/plugin-test/.obsidian/plugins/vault-sync-dropbox";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian", "electron",
    "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands",
    "@codemirror/language", "@codemirror/lint", "@codemirror/search",
    "@codemirror/state", "@codemirror/view",
    "@lezer/common", "@lezer/highlight", "@lezer/lr",
    "node:*", "crypto", "http", "path", "fs", "os",
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

await ctx.rebuild();

if (!existsSync(TEST_VAULT_PLUGIN_DIR)) {
  mkdirSync(TEST_VAULT_PLUGIN_DIR, { recursive: true });
}
copyFileSync("main.js", `${TEST_VAULT_PLUGIN_DIR}/main.js`);
copyFileSync("manifest.json", `${TEST_VAULT_PLUGIN_DIR}/manifest.json`);
console.log(`✓ Copied to test vault`);

if (!prod) {
  await ctx.watch();
}
