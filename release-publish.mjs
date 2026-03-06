import { readFileSync } from "fs";
import { execSync } from "child_process";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const v = manifest.version;

execSync("git tag " + v);
execSync("git push && git push --tags");
execSync(
  `gh release create ${v} main.js manifest.json --repo Faust-IA/plugin --title "${v}" --notes "Release ${v}"`,
  { stdio: "inherit" }
);
