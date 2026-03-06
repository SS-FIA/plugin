import { readFileSync, writeFileSync } from "fs";

const manifestPath = "manifest.json";
const versionsPath = "versions.json";

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const oldVersion = manifest.version;
const [major, minor, patch] = oldVersion.split(".").map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;

manifest.version = newVersion;
writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t"));

const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
if (!versions[newVersion]) {
  versions[newVersion] = manifest.minAppVersion;
  writeFileSync(versionsPath, JSON.stringify(versions, null, "\t"));
}

console.log(`Bumped version: ${oldVersion} → ${newVersion}`);
