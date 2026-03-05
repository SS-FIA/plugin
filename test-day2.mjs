const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
if (!ACCESS_TOKEN) { console.error("❌ ACCESS_TOKEN required"); process.exit(1); }

const API_BASE = "https://api.dropboxapi.com/2";
const CONTENT_BASE = "https://content.dropboxapi.com/2";
const auth = { Authorization: `Bearer ${ACCESS_TOKEN}` };

async function testListFolder() {
  console.log("\n📂 Test: files/list_folder");
  const res = await fetch(`${API_BASE}/files/list_folder`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ path: "", recursive: false }),
  });
  const data = await res.json();
  if (!res.ok) { console.error("❌ FAIL:", data); return; }
  console.log(`✅ OK: ${data.entries.length} entries`);
  data.entries.slice(0, 5).forEach(e => console.log(`   [${e[".tag"]}] ${e.name}`));
}

async function testUpload() {
  console.log("\n⬆️  Test: files/upload");
  const content = `# Test\nCreated: ${new Date().toISOString()}\n`;
  const res = await fetch(`${CONTENT_BASE}/files/upload`, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: "/ObsidianVault-test/test-note.md",
        mode: "overwrite", autorename: false, mute: false,
      }),
    },
    body: new TextEncoder().encode(content),
  });
  const data = await res.json();
  if (!res.ok) { console.error("❌ FAIL:", data); return null; }
  console.log(`✅ OK: ${data.path_display} (${data.size} bytes)`);
  return data.path_display;
}

async function testDownload(path) {
  console.log("\n⬇️  Test: files/download");
  const res = await fetch(`${CONTENT_BASE}/files/download`, {
    method: "POST",
    headers: { ...auth, "Dropbox-API-Arg": JSON.stringify({ path }) },
  });
  if (!res.ok) { console.error("❌ FAIL:", res.status); return; }
  const text = await res.text();
  console.log(`✅ OK: ${text.length} chars`);
  console.log("   Content:", text.replace(/\n/g, "↵"));
}

(async () => {
  console.log("🚀 Dropbox API Day 2 Test");
  await testListFolder();
  const path = await testUpload();
  if (path) await testDownload(path);
  console.log("\n✅ Done.");
})();
