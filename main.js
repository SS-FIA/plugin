var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => DropboxSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  appKey: "",
  appSecret: "",
  accessToken: "",
  refreshToken: "",
  dropboxFolder: "/ObsidianVault",
  syncIntervalMinutes: 5,
  excludedFolders: [".obsidian", ".trash"],
  syncCursor: "",
  lastSync: "",
  localTombstones: {}
};
var DropboxSyncSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Dropbox Sync \u8A2D\u5B9A" });
    new import_obsidian.Setting(containerEl).setName("App Key").setDesc("Dropbox Developer Console \u3067\u78BA\u8A8D\u3067\u304D\u307E\u3059").addText(
      (text) => text.setPlaceholder("\u4F8B: kd6a7ywlcptrskd").setValue(this.plugin.settings.appKey).onChange(async (value) => {
        this.plugin.settings.appKey = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("App Secret").setDesc("PKCE\u4F7F\u7528\u6642\u306F\u7701\u7565\u53EF").addText((text) => {
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      text.setPlaceholder("\u7701\u7565\u53EF").setValue(this.plugin.settings.appSecret).onChange(async (value) => {
        this.plugin.settings.appSecret = value.trim();
        await this.plugin.saveSettings();
      });
      return text;
    });
    containerEl.createEl("hr");
    const isConnected = !!this.plugin.settings.accessToken;
    const connectSetting = new import_obsidian.Setting(containerEl).setName("Dropbox\u63A5\u7D9A\u72B6\u614B").setDesc(
      isConnected ? "\u2705 \u63A5\u7D9A\u6E08\u307F\uFF08refresh_token: " + (this.plugin.settings.refreshToken ? "\u3042\u308A" : "\u306A\u3057") + "\uFF09" : "\u2B1C \u672A\u63A5\u7D9A"
    );
    if (!isConnected) {
      connectSetting.addButton(
        (btn) => btn.setButtonText("Dropbox\u306B\u63A5\u7D9A").setCta().onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("\u8A8D\u8A3C\u4E2D...");
          try {
            await this.plugin.startOAuthFlow();
            this.display();
          } catch (err) {
            btn.setDisabled(false);
            btn.setButtonText("Dropbox\u306B\u63A5\u7D9A");
          }
        })
      );
    } else {
      connectSetting.addButton(
        (btn) => btn.setButtonText("\u63A5\u7D9A\u89E3\u9664").setWarning().onClick(async () => {
          await this.plugin.revokeToken();
          this.display();
        })
      );
    }
    containerEl.createEl("hr");
    new import_obsidian.Setting(containerEl).setName("\u540C\u671F\u5148 Dropbox\u30D5\u30A9\u30EB\u30C0").setDesc("Dropbox\u5185\u306E\u540C\u671F\u5148\u30D5\u30A9\u30EB\u30C0\u3092\u30B9\u30E9\u30C3\u30B7\u30E5\u59CB\u307E\u308A\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u4F8B: /ObsidianVault\uFF09").addText(
      (text) => text.setPlaceholder("/ObsidianVault\uFF08\u4EFB\u610F\u306E\u30D5\u30A9\u30EB\u30C0\u540D\u306B\u5909\u66F4\u3067\u304D\u307E\u3059\uFF09").setValue(this.plugin.settings.dropboxFolder).onChange(async (value) => {
        let v = value.trim();
        if (v && !v.startsWith("/")) v = "/" + v;
        this.plugin.settings.dropboxFolder = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u540C\u671F\u9593\u9694\uFF08\u5206\uFF09").setDesc("\u81EA\u52D5\u540C\u671F\u306E\u9593\u9694\u3002\u30C7\u30D5\u30A9\u30EB\u30C85\u5206\u3002").addSlider(
      (slider) => slider.setLimits(1, 60, 1).setValue(this.plugin.settings.syncIntervalMinutes).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.syncIntervalMinutes = value;
        await this.plugin.saveSettings();
      })
    );
    if (this.plugin.settings.lastSync) {
      new import_obsidian.Setting(containerEl).setName("\u6700\u7D42\u540C\u671F").setDesc(this.plugin.settings.lastSync).setDisabled(true);
    }
  }
};

// src/dropbox-client.ts
var import_obsidian2 = require("obsidian");
var DropboxClient = class {
  constructor(accessToken, refreshToken, appKey, appSecret, onTokenRefreshed) {
    this.API = "https://api.dropboxapi.com/2";
    this.CONTENT = "https://content.dropboxapi.com/2";
    // リフレッシュ中の重複実行を防ぐPromiseキャッシュ
    this.refreshPromise = null;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.onTokenRefreshed = onTokenRefreshed;
  }
  setToken(token) {
    this.accessToken = token;
  }
  get authHeader() {
    return { Authorization: `Bearer ${this.accessToken}` };
  }
  // ============================================================
  // トークンリフレッシュ（401時に自動呼び出し）
  // ============================================================
  async refreshAccessToken() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
        client_id: this.appKey,
        ...this.appSecret ? { client_secret: this.appSecret } : {}
      });
      const res = await (0, import_obsidian2.requestUrl)({
        url: "https://api.dropbox.com/oauth2/token",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        throw: false
      });
      if (res.status !== 200) {
        throw new Error(`token refresh failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
      const newToken = res.json.access_token;
      this.accessToken = newToken;
      await this.onTokenRefreshed(newToken);
    })();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }
  // ============================================================
  // 401リトライラッパー
  // ============================================================
  async withTokenRetry(fn) {
    try {
      return await fn();
    } catch (e) {
      if (/401|expired_access_token/i.test(String(e))) {
        console.warn("[DropboxClient] token expired, refreshing...");
        await this.refreshAccessToken();
        return await fn();
      }
      throw e;
    }
  }
  // ============================================================
  // API メソッド（全てwithTokenRetry経由）
  // ============================================================
  async listFolder(path, recursive = false) {
    return this.withTokenRetry(async () => {
      const res = await (0, import_obsidian2.requestUrl)({
        url: `${this.API}/files/list_folder`,
        method: "POST",
        headers: { ...this.authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ path, recursive }),
        throw: false
      });
      if (res.status !== 200) {
        throw new Error(`list_folder failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
      return res.json;
    });
  }
  async listFolderContinue(cursor) {
    return this.withTokenRetry(async () => {
      const res = await (0, import_obsidian2.requestUrl)({
        url: `${this.API}/files/list_folder/continue`,
        method: "POST",
        headers: { ...this.authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ cursor }),
        throw: false
      });
      if (res.status !== 200) {
        throw new Error(`list_folder/continue failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
      return res.json;
    });
  }
  async upload(dropboxPath, content) {
    return this.withTokenRetry(async () => {
      const res = await (0, import_obsidian2.requestUrl)({
        url: `${this.CONTENT}/files/upload`,
        method: "POST",
        headers: {
          ...this.authHeader,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: dropboxPath,
            mode: "overwrite",
            autorename: false,
            mute: false
          })
        },
        body: content,
        throw: false
      });
      if (res.status !== 200) {
        throw new Error(`upload failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
      return res.json;
    });
  }
  async download(dropboxPath) {
    return this.withTokenRetry(async () => {
      const res = await (0, import_obsidian2.requestUrl)({
        url: `${this.CONTENT}/files/download`,
        method: "POST",
        headers: {
          ...this.authHeader,
          "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath })
        },
        throw: false
      });
      if (res.status !== 200) {
        throw new Error(`download failed (${res.status})`);
      }
      return res.arrayBuffer;
    });
  }
  async delete(dropboxPath) {
    return this.withTokenRetry(async () => {
      const res = await (0, import_obsidian2.requestUrl)({
        url: `${this.API}/files/delete_v2`,
        method: "POST",
        headers: { ...this.authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ path: dropboxPath }),
        throw: false
      });
      if (res.status !== 200 && res.status !== 409) {
        throw new Error(`delete failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
    });
  }
};

// src/sync-engine.ts
var import_obsidian3 = require("obsidian");

// src/sync-state.ts
var STATE_PATH = ".obsidian/plugins/vault-sync-dropbox/state.json";
var DEFAULT_SYNC_STATE = {
  files: {},
  tombstones: {}
};
function migrate(raw) {
  var _a, _b, _c, _d;
  if (raw && typeof raw.files === "object") {
    return {
      files: (_a = raw.files) != null ? _a : {},
      tombstones: (_b = raw.tombstones) != null ? _b : {}
    };
  }
  const files = {};
  for (const [path, v] of Object.entries(raw != null ? raw : {})) {
    const id = v == null ? void 0 : v.dropboxId;
    if (!id) continue;
    files[id] = {
      path,
      contentHash: (_c = v.contentHash) != null ? _c : "",
      lastSyncedAt: (_d = v.lastSyncedAt) != null ? _d : 0
    };
  }
  return { files, tombstones: {} };
}
async function loadSyncState(vault, legacyTombstones) {
  try {
    const text = await vault.adapter.read(STATE_PATH);
    const state = migrate(JSON.parse(text));
    if (legacyTombstones && Object.keys(legacyTombstones).length > 0) {
      state.tombstones = { ...legacyTombstones, ...state.tombstones };
    }
    return state;
  } catch (e) {
    return {
      files: {},
      tombstones: legacyTombstones != null ? legacyTombstones : {}
    };
  }
}
async function saveSyncState(vault, state) {
  await vault.adapter.write(STATE_PATH, JSON.stringify(state, null, 2));
}
function findByPath(state, vaultPath) {
  for (const [id, entry] of Object.entries(state.files)) {
    if (entry.path.toLowerCase() === vaultPath.toLowerCase()) return [id, entry];
  }
  return null;
}

// src/content-hash.ts
var BLOCK_SIZE = 4 * 1024 * 1024;
async function computeContentHash(data) {
  const blockHashes = [];
  let offset = 0;
  while (offset < data.byteLength) {
    const end = Math.min(offset + BLOCK_SIZE, data.byteLength);
    const chunk = data.slice(offset, end);
    const hashBuf = await crypto.subtle.digest("SHA-256", chunk);
    blockHashes.push(new Uint8Array(hashBuf));
    offset = end;
  }
  const combined = new Uint8Array(blockHashes.length * 32);
  blockHashes.forEach((h, i) => combined.set(h, i * 32));
  const finalBuf = await crypto.subtle.digest("SHA-256", combined);
  return toHex(new Uint8Array(finalBuf));
}
function toHex(buf) {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/sync-lock.ts
var SyncLock = class {
  constructor() {
    this.locked = false;
    this.queue = [];
  }
  async acquire() {
    if (!this.locked) {
      this.locked = true;
      return this.release.bind(this);
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(this.release.bind(this));
      });
    });
  }
  release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
  get isLocked() {
    return this.locked;
  }
  get queueLength() {
    return this.queue.length;
  }
};

// src/conflict.ts
var CONFLICT_SUFFIX = /\s*\(conflict\s+[^)]+\)/g;
function makeConflictPath(vaultPath) {
  const dot = vaultPath.lastIndexOf(".");
  const baseWithConflicts = dot >= 0 ? vaultPath.slice(0, dot) : vaultPath;
  const ext = dot >= 0 ? vaultPath.slice(dot) : "";
  const base = baseWithConflicts.replace(CONFLICT_SUFFIX, "").trimEnd();
  const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${base} (conflict ${ts})${ext}`;
}

// src/sync-engine.ts
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var _SyncEngine = class _SyncEngine {
  constructor(app, client, settings, saveSettings, logger) {
    this.status = "idle";
    this.intervalId = null;
    this.syncState = DEFAULT_SYNC_STATE;
    // ローカルイベントの debounce バッファ
    this.pendingUploads = /* @__PURE__ */ new Map();
    this.UPLOAD_DEBOUNCE_MS = 3e3;
    // ダウンロード中パスのガード（アップロード競合防止）
    this.syncingPaths = /* @__PURE__ */ new Set();
    this.lock = new SyncLock();
    this.TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
    this.dirtyCount = 0;
    this.saveTimer = null;
    this.app = app;
    this.client = client;
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.logger = logger;
  }
  // ============================================================
  // ライフサイクル
  // ============================================================
  async start() {
    var _a;
    this.syncState = await loadSyncState(
      this.app.vault,
      this.settings.localTombstones
    );
    if (Object.keys((_a = this.settings.localTombstones) != null ? _a : {}).length > 0) {
      this.settings.localTombstones = {};
      await this.saveSettings();
    }
    this.registerVaultEvents();
    await this.fullSync();
    this.startInterval();
  }
  stop() {
    this.stopInterval();
    for (const timerId of this.pendingUploads.values()) {
      window.clearTimeout(timerId);
    }
    this.pendingUploads.clear();
  }
  getStatus() {
    return this.status;
  }
  setStatus(status) {
    var _a;
    this.status = status;
    (_a = this.onStatusChange) == null ? void 0 : _a.call(this, status);
  }
  gcTombstones() {
    const now = Date.now();
    let count = 0;
    for (const [vaultPath, deletedAt] of Object.entries(this.syncState.tombstones)) {
      if (now - deletedAt > this.TOMBSTONE_TTL_MS) {
        delete this.syncState.tombstones[vaultPath];
        count++;
      }
    }
    if (count > 0) {
      this.logger.log("info", "system", `tombstone GC: removed ${count} entries`);
    }
  }
  /**
   * fullSync時にdropboxMapと照合し、Dropbox側が新しいtombstoneを除去する。
   * 例：別デバイスで再作成されたファイルが同期されない問題を自動修復。
   */
  async repairTombstones(dropboxMap) {
    let repaired = 0;
    for (const [vaultPath, deletedAt] of Object.entries(this.syncState.tombstones)) {
      const dbEntry = dropboxMap.get(vaultPath.toLowerCase());
      if (!dbEntry) continue;
      const dbMtime = dbEntry.client_modified ? new Date(dbEntry.client_modified).getTime() : 0;
      if (dbMtime >= deletedAt) {
        delete this.syncState.tombstones[vaultPath];
        repaired++;
      }
    }
    if (repaired > 0) {
      this.markDirty();
      this.logger.log("info", "system", `tombstone repair: cleared ${repaired} stale entries`);
    }
  }
  markDirty() {
    this.dirtyCount++;
    if (this.dirtyCount >= _SyncEngine.SAVE_BATCH_SIZE) {
      void this.flushSyncState();
      return;
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(
      () => void this.flushSyncState(),
      _SyncEngine.SAVE_DEBOUNCE_MS
    );
  }
  async flushSyncState() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirtyCount === 0) return;
    await saveSyncState(this.app.vault, this.syncState);
    this.dirtyCount = 0;
  }
  // ============================================================
  // インターバル
  // ============================================================
  startInterval() {
    var _a;
    if (this.intervalId !== null) return;
    const ms = ((_a = this.settings.syncIntervalMinutes) != null ? _a : 5) * 60 * 1e3;
    this.intervalId = window.setInterval(() => this.incrementalSync(), ms);
  }
  stopInterval() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  // ============================================================
  // Vault イベント監視
  // ============================================================
  registerVaultEvents() {
    const vault = this.app.vault;
    vault.on("create", (f) => {
      if (f instanceof import_obsidian3.TFile) this.scheduleUpload(f.path);
    });
    vault.on("modify", (f) => {
      if (f instanceof import_obsidian3.TFile) this.scheduleUpload(f.path);
    });
    vault.on("delete", (f) => {
      if (f instanceof import_obsidian3.TFile) this.handleLocalDelete(f.path);
    });
    vault.on("rename", (f, oldPath) => {
      if (f instanceof import_obsidian3.TFile) {
        this.handleLocalDelete(oldPath);
        this.scheduleUpload(f.path);
      }
    });
  }
  scheduleUpload(vaultPath) {
    if (this.syncingPaths.has(vaultPath)) return;
    if (this.isExcluded(vaultPath)) return;
    const existing = this.pendingUploads.get(vaultPath);
    if (existing !== void 0) window.clearTimeout(existing);
    const id = window.setTimeout(async () => {
      this.pendingUploads.delete(vaultPath);
      await this.uploadFile(vaultPath);
    }, this.UPLOAD_DEBOUNCE_MS);
    this.pendingUploads.set(vaultPath, id);
  }
  // ============================================================
  // フルシンク
  // ============================================================
  async fullSync() {
    if (this.status === "syncing") return this.emptyResult();
    if (this.lock.isLocked) return this.emptyResult();
    const release = await this.lock.acquire();
    this.setStatus("syncing");
    const result = this.emptyResult();
    this.logger.log("info", "system", "fullSync started");
    try {
      this.gcTombstones();
      const { entries: dropboxFiles, finalCursor } = await this.listAllDropboxFiles();
      const localFiles = this.listAllLocalFiles();
      const localMap = new Map(localFiles.map((f) => [f.path.toLowerCase(), f]));
      const dropboxMap = new Map(
        dropboxFiles.filter((e) => e[".tag"] === "file").map((e) => {
          var _a, _b;
          return [
            this.dropboxToVaultPath((_b = (_a = e.path_display) != null ? _a : e.path_lower) != null ? _b : "").toLowerCase(),
            e
          ];
        })
      );
      await this.repairTombstones(dropboxMap);
      const toDownload = [];
      for (const [vaultPath, dbEntry] of dropboxMap) {
        if (!vaultPath || this.isExcluded(vaultPath)) continue;
        const local = localMap.get(vaultPath.toLowerCase());
        const dbMtime = dbEntry.client_modified ? new Date(dbEntry.client_modified).getTime() : 0;
        const tombstoneTime = this.syncState.tombstones[vaultPath];
        if (tombstoneTime && tombstoneTime > dbMtime) continue;
        if (!local) {
          toDownload.push(dbEntry);
        } else if (dbMtime > local.mtime) {
          result.conflicts.push(vaultPath);
          this.logger.log("warn", "conflict", `conflict: ${vaultPath}`, vaultPath);
          toDownload.push(dbEntry);
        }
      }
      await this.batchDownload(toDownload, result, (cur, tot) => {
        var _a;
        (_a = this.onProgress) == null ? void 0 : _a.call(this, cur, tot);
      });
      for (const local of localFiles) {
        if (this.isExcluded(local.path)) continue;
        const dbEntry = dropboxMap.get(local.path.toLowerCase());
        if (!dbEntry) {
          await this.uploadFile(local.path, result);
        } else {
          const dbMtime = dbEntry.client_modified ? new Date(dbEntry.client_modified).getTime() : 0;
          if (local.mtime > dbMtime) {
            await this.uploadFile(local.path, result);
          }
        }
      }
      this.settings.syncCursor = finalCursor;
      this.settings.lastSync = (/* @__PURE__ */ new Date()).toISOString();
      await this.saveSettings();
      this.logger.log("info", "system", `fullSync completed: up=${result.uploaded} dl=${result.downloaded} del=${result.deleted}`);
    } catch (e) {
      result.errors.push(String(e));
      this.logger.log("error", "system", `error: ${String(e)}`, void 0, e);
      console.error("[SyncEngine] fullSync error:", e);
    } finally {
      await this.logger.flushAll();
      this.setStatus("idle");
      release();
    }
    return result;
  }
  // ============================================================
  // インクリメンタルシンク（カーソルベース）
  // ============================================================
  async incrementalSync() {
    var _a, _b, _c, _d;
    if (this.status === "syncing") return this.emptyResult();
    if (this.lock.isLocked) return this.emptyResult();
    if (!this.settings.syncCursor) return this.fullSync();
    const release = await this.lock.acquire();
    this.setStatus("syncing");
    const result = this.emptyResult();
    this.logger.log("info", "system", "incrementalSync started");
    try {
      let cursor = this.settings.syncCursor;
      let hasMore = true;
      while (hasMore) {
        const res = await this.client.listFolderContinue(cursor);
        cursor = res.cursor;
        hasMore = res.has_more;
        for (const entry of res.entries) {
          if (entry[".tag"] !== "file" || !entry.id) continue;
          const existing = this.syncState.files[entry.id];
          if (!existing) continue;
          const newVaultPath = this.dropboxToVaultPath((_b = (_a = entry.path_display) != null ? _a : entry.path_lower) != null ? _b : "").toLowerCase();
          if (existing.path === newVaultPath) continue;
          const oldVaultPath = existing.path;
          const oldFile = this.app.vault.getAbstractFileByPath((0, import_obsidian3.normalizePath)(oldVaultPath));
          if (oldFile) {
            try {
              await this.app.vault.rename(oldFile, newVaultPath);
              existing.path = newVaultPath;
              await this.flushSyncState();
              this.logger.log("info", "rename", `renamed: ${oldVaultPath} \u2192 ${newVaultPath}`, newVaultPath);
            } catch (e) {
              this.logger.log("error", "system", `rename failed: ${oldVaultPath} \u2192 ${newVaultPath}: ${String(e)}`, oldVaultPath, e);
            }
          } else {
            existing.path = newVaultPath;
            await this.flushSyncState();
          }
        }
        for (const entry of res.entries) {
          const vaultPath = this.dropboxToVaultPath(
            (_d = (_c = entry.path_lower) != null ? _c : entry.path_display) != null ? _d : ""
          ).toLowerCase();
          if (!vaultPath || this.isExcluded(vaultPath)) continue;
          if (entry[".tag"] === "deleted") {
            await this.handleRemoteDelete(vaultPath, result);
          } else if (entry[".tag"] === "file") {
            await this.resolveConflictAndDownload(vaultPath, result, entry);
          }
        }
      }
      this.settings.syncCursor = cursor;
      this.settings.lastSync = (/* @__PURE__ */ new Date()).toISOString();
      await this.saveSettings();
    } catch (e) {
      result.errors.push(String(e));
      this.logger.log("error", "system", `error: ${String(e)}`, void 0, e);
      console.error("[SyncEngine] incrementalSync error:", e);
      if (/reset|expired/i.test(String(e))) {
        this.settings.syncCursor = "";
        await this.saveSettings();
      }
    } finally {
      await this.logger.flushAll();
      this.setStatus("idle");
      release();
    }
    return result;
  }
  // ============================================================
  // 競合解決：last-write-wins
  // ============================================================
  async resolveConflictAndDownload(vaultPath, result, dbEntry) {
    var _a;
    const remoteHash = (_a = dbEntry.content_hash) != null ? _a : "";
    const existing = findByPath(this.syncState, vaultPath);
    if (existing) {
      const [, state] = existing;
      if (state.contentHash === remoteHash) return;
    }
    const normalized = (0, import_obsidian3.normalizePath)(vaultPath);
    const localExists = await this.app.vault.adapter.exists(normalized);
    if (!localExists) {
      await this.downloadFile(vaultPath, result, dbEntry);
      return;
    }
    if (existing) {
      const [, state] = existing;
      const localData2 = await this.app.vault.adapter.readBinary(normalized);
      const localHash = await computeContentHash(localData2);
      if (localHash === state.contentHash) {
        await this.downloadFile(vaultPath, result, dbEntry);
        return;
      }
    }
    if (!existing) {
      await this.downloadFile(vaultPath, result, dbEntry);
      return;
    }
    const conflictPath = makeConflictPath(vaultPath);
    const localData = await this.app.vault.adapter.readBinary(normalized);
    await this.app.vault.adapter.writeBinary(conflictPath, localData);
    result.conflicts.push(conflictPath);
    this.logger.log("warn", "conflict", `conflict: ${vaultPath}`, vaultPath);
    await this.downloadFile(vaultPath, result, dbEntry);
  }
  async batchDownload(entries, result, onProgress) {
    const total = entries.length;
    for (let i = 0; i < total; i += _SyncEngine.BATCH_SIZE) {
      const batch = entries.slice(i, i + _SyncEngine.BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (entry) => {
          var _a, _b;
          const vaultPath = this.dropboxToVaultPath((_b = (_a = entry.path_lower) != null ? _a : entry.path_display) != null ? _b : "").toLowerCase();
          await this.downloadFile(vaultPath, result, entry);
        })
      );
      const current = Math.min(i + _SyncEngine.BATCH_SIZE, total);
      onProgress == null ? void 0 : onProgress(current, total);
      if (i + _SyncEngine.BATCH_SIZE < total) {
        await sleep(_SyncEngine.BATCH_PAUSE_MS);
      }
    }
  }
  // ============================================================
  // ファイル操作
  // ============================================================
  async uploadFile(vaultPath, result) {
    var _a;
    try {
      const file = this.app.vault.getAbstractFileByPath((0, import_obsidian3.normalizePath)(vaultPath));
      if (!(file instanceof import_obsidian3.TFile)) return;
      const content = await this.app.vault.readBinary(file);
      const localHash = await computeContentHash(content);
      const found = findByPath(this.syncState, vaultPath);
      if (found) {
        const [, entry] = found;
        if (entry.contentHash === localHash) return;
      }
      const dropboxPath = this.vaultToDropboxPath(vaultPath);
      const res = await this.client.upload(dropboxPath, content);
      if (res == null ? void 0 : res.id) {
        this.syncState.files[res.id] = {
          path: vaultPath,
          contentHash: (_a = res.content_hash) != null ? _a : localHash,
          lastSyncedAt: Date.now()
        };
        this.markDirty();
      }
      if (result) result.uploaded++;
      this.logger.log("info", "upload", `uploaded: ${vaultPath}`, vaultPath);
    } catch (e) {
      const msg = `upload failed: ${vaultPath} \u2013 ${e}`;
      if (result) result.errors.push(msg);
      this.logger.log("error", "upload", msg, vaultPath, e);
      console.error("[SyncEngine]", msg);
    }
  }
  async downloadFile(vaultPath, result, dbEntry) {
    var _a;
    this.syncingPaths.add(vaultPath);
    try {
      const dropboxPath = this.vaultToDropboxPath(vaultPath);
      const data = await this.client.download(dropboxPath);
      const normalizedPath = (0, import_obsidian3.normalizePath)(vaultPath);
      await this.ensureFolder(normalizedPath);
      const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (existing instanceof import_obsidian3.TFile) {
        await this.app.vault.modifyBinary(existing, data);
      } else {
        const physicallyExists = await this.app.vault.adapter.exists(normalizedPath);
        if (physicallyExists) {
          await this.app.vault.adapter.remove(normalizedPath);
        }
        await this.app.vault.createBinary(normalizedPath, data);
      }
      if (dbEntry == null ? void 0 : dbEntry.id) {
        const hash = (_a = dbEntry.content_hash) != null ? _a : await computeContentHash(data);
        this.syncState.files[dbEntry.id] = {
          path: vaultPath,
          contentHash: hash,
          lastSyncedAt: Date.now()
        };
        this.markDirty();
      }
      if (this.syncState.tombstones[vaultPath]) {
        delete this.syncState.tombstones[vaultPath];
        this.markDirty();
      }
      if (result) result.downloaded++;
      this.logger.log("info", "download", `downloaded: ${vaultPath}`, vaultPath);
    } catch (e) {
      const msg = `download failed: ${vaultPath} \u2013 ${e}`;
      if (result) result.errors.push(msg);
      console.error("[SyncEngine]", msg);
    } finally {
      window.setTimeout(() => this.syncingPaths.delete(vaultPath), this.UPLOAD_DEBOUNCE_MS + 500);
    }
  }
  async handleLocalDelete(vaultPath) {
    if (this.isExcluded(vaultPath)) return;
    if (this.syncingPaths.has(vaultPath)) return;
    this.syncState.tombstones[vaultPath] = Date.now();
    this.markDirty();
    try {
      await this.client.delete(this.vaultToDropboxPath(vaultPath));
      delete this.syncState.tombstones[vaultPath];
      this.markDirty();
    } catch (e) {
      console.warn("[SyncEngine] remote delete skipped:", vaultPath, e);
    }
  }
  async handleRemoteDelete(vaultPath, result) {
    try {
      const file = this.app.vault.getAbstractFileByPath((0, import_obsidian3.normalizePath)(vaultPath));
      if (file instanceof import_obsidian3.TFile) {
        await this.app.vault.trash(file, true);
        result.deleted++;
        this.logger.log("info", "delete", `deleted: ${vaultPath}`, vaultPath);
      }
    } catch (e) {
      result.errors.push(`local delete failed: ${vaultPath} \u2013 ${e}`);
    }
  }
  // ============================================================
  // パス変換・除外判定
  // ============================================================
  vaultToDropboxPath(vaultPath) {
    var _a;
    const base = ((_a = this.settings.dropboxFolder) != null ? _a : "/ObsidianVault").replace(/\/$/, "");
    return `${base}/${vaultPath}`;
  }
  dropboxToVaultPath(dropboxPath) {
    var _a;
    const base = ((_a = this.settings.dropboxFolder) != null ? _a : "/ObsidianVault").replace(/\/$/, "").toLowerCase();
    const lower = dropboxPath.toLowerCase();
    if (!lower.startsWith(base)) return "";
    return dropboxPath.slice(base.length + 1);
  }
  isConflictCopy(vaultPath) {
    var _a;
    const filename = (_a = vaultPath.split("/").pop()) != null ? _a : vaultPath;
    return _SyncEngine.CONFLICT_COPY_RE.test(filename);
  }
  isExcluded(vaultPath) {
    var _a;
    if (this.isConflictCopy(vaultPath)) return true;
    const excluded = (_a = this.settings.excludedFolders) != null ? _a : [".obsidian", ".trash"];
    return excluded.some(
      (f) => vaultPath.startsWith(f + "/") || vaultPath === f
    );
  }
  listAllLocalFiles() {
    const files = [];
    const recurse = (folder) => {
      for (const child of folder.children) {
        if (child instanceof import_obsidian3.TFile) {
          files.push({ path: child.path, mtime: child.stat.mtime });
        } else if (child instanceof import_obsidian3.TFolder) {
          recurse(child);
        }
      }
    };
    recurse(this.app.vault.getRoot());
    return files;
  }
  async listAllDropboxFiles() {
    var _a;
    const base = (_a = this.settings.dropboxFolder) != null ? _a : "/ObsidianVault";
    const first = await this.client.listFolder(base);
    const all = [...first.entries];
    let cursor = first.cursor;
    let hasMore = first.has_more;
    while (hasMore) {
      const cont = await this.client.listFolderContinue(cursor);
      all.push(...cont.entries);
      cursor = cont.cursor;
      hasMore = cont.has_more;
    }
    return { entries: all, finalCursor: cursor };
  }
  async refreshCursor() {
    var _a;
    try {
      const base = (_a = this.settings.dropboxFolder) != null ? _a : "/ObsidianVault";
      const first = await this.client.listFolder(base);
      let cursor = first.cursor;
      let more = first.has_more;
      while (more) {
        const cont = await this.client.listFolderContinue(cursor);
        cursor = cont.cursor;
        more = cont.has_more;
      }
      this.settings.syncCursor = cursor;
    } catch (e) {
      console.warn("[SyncEngine] refreshCursor failed:", e);
    }
  }
  async ensureFolder(filePath) {
    const parts = filePath.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
  emptyResult() {
    return { uploaded: 0, downloaded: 0, deleted: 0, conflicts: [], errors: [] };
  }
};
_SyncEngine.BATCH_SIZE = 20;
_SyncEngine.BATCH_PAUSE_MS = 500;
_SyncEngine.SAVE_DEBOUNCE_MS = 5e3;
_SyncEngine.SAVE_BATCH_SIZE = 10;
// Dropboxアプリ自動生成の競合コピーを検出
// 日本語: 「KのMac mini の競合コピー 2026-03-07」
// 英語:   "User's conflicted copy 2026-03-07"
// スペイン語等も考慮した汎用パターン
_SyncEngine.CONFLICT_COPY_RE = /\(.*?(?:の競合コピー|のコンフリクトコピー|'s conflicted copy)\s+\d{4}-\d{2}-\d{2}\)/i;
var SyncEngine = _SyncEngine;

// src/sync-log.ts
var LOG_PATH = ".obsidian/plugins/vault-sync-dropbox/log.json";
var MAX_ENTRIES = 1e3;
var SyncLogger = class {
  constructor(adapter) {
    this.adapter = adapter;
    this.entries = [];
  }
  async load() {
    try {
      const raw = await this.adapter.read(LOG_PATH);
      const parsed = JSON.parse(raw);
      if (parsed.version === 1 && Array.isArray(parsed.entries)) {
        this.entries = parsed.entries;
      }
    } catch (e) {
      this.entries = [];
    }
  }
  log(level, op, msg, path, detail) {
    this.entries.push({ ts: Date.now(), level, op, msg, path, detail });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
  }
  async flushAll() {
    const data = { version: 1, entries: this.entries };
    try {
      await this.adapter.write(LOG_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("[SyncLogger] flush failed:", e);
    }
  }
  getEntries() {
    return this.entries;
  }
};

// src/main.ts
var REDIRECT_URI = "obsidian://vault-sync-dropbox/oauth";
var AUTH_TIMEOUT_MS = 5 * 60 * 1e3;
var DropboxSyncPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.syncTimer = null;
    this.syncEngine = null;
  }
  async onload() {
    console.log("DropboxSync: loading plugin");
    await this.loadSettings();
    this.client = this.buildClient();
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();
    this.settingTab = new DropboxSyncSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.syncLogger = new SyncLogger(this.app.vault.adapter);
    await this.syncLogger.load();
    this.addCommand({
      id: "connect-dropbox",
      name: "Dropbox\u306B\u63A5\u7D9A",
      callback: () => this.startOAuthFlow()
    });
    this.addCommand({
      id: "test-list-folder",
      name: "Dropbox\u63A5\u7D9A\u30C6\u30B9\u30C8\uFF08list_folder\uFF09",
      callback: () => this.testListFolder()
    });
    this.addCommand({
      id: "manual-sync",
      name: "\u4ECA\u3059\u3050\u540C\u671F (Dropbox)",
      callback: async () => {
        if (!this.syncEngine) {
          new import_obsidian4.Notice("Dropbox\u672A\u63A5\u7D9A\u3067\u3059\u3002\u8A2D\u5B9A\u304B\u3089\u8A8D\u8A3C\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
          return;
        }
        const result = await this.syncEngine.incrementalSync();
        await this.handleSyncResult(result);
      }
    });
    if (this.settings.accessToken) {
      await this.startSync();
    }
  }
  onunload() {
    var _a;
    this.statusBarItem.remove();
    if (this.syncTimer) clearTimeout(this.syncTimer);
    (_a = this.syncEngine) == null ? void 0 : _a.stop();
  }
  // ─── DropboxClient生成 ────────────────────────
  // 【FIX】OAuth完了後にも同じファクトリを使いClientを再生成する
  buildClient() {
    return new DropboxClient(
      this.settings.accessToken,
      this.settings.refreshToken,
      this.settings.appKey,
      this.settings.appSecret,
      async (newToken) => {
        this.settings.accessToken = newToken;
        await this.saveSettings();
      }
    );
  }
  // ─── 同期開始 ─────────────────────────────────
  async startSync() {
    var _a;
    (_a = this.syncEngine) == null ? void 0 : _a.stop();
    this.syncEngine = new SyncEngine(
      this.app,
      this.client,
      this.settings,
      () => this.saveData(this.settings),
      this.syncLogger
    );
    this.syncEngine.onStatusChange = (s) => this.updateStatusBar(s);
    this.syncEngine.onProgress = (current, total) => {
      this.updateStatusBar("syncing", { current, total });
    };
    await this.syncEngine.start();
    this.updateStatusBar();
  }
  // ─── 設定 ───────────────────────────────────
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  updateStatusBar(status = "idle", progress) {
    if (status === "syncing" && progress) {
      this.statusBarItem.setText(`\u2601 Syncing ${progress.current}/${progress.total}`);
    } else if (status === "syncing") {
      this.statusBarItem.setText("\u2601 Syncing...");
    } else if (status === "error") {
      this.statusBarItem.setText("\u2601 Sync error");
    } else {
      const lastSync = this.settings.lastSync ? new Date(this.settings.lastSync).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit"
      }) : "\u672A\u540C\u671F";
      this.statusBarItem.setText(`\u2601 Dropbox: \u63A5\u7D9A\u6E08 (${lastSync})`);
    }
  }
  async handleSyncResult(result) {
    this.settings.lastSync = (/* @__PURE__ */ new Date()).toISOString();
    await this.saveSettings();
    this.updateStatusBar("idle");
    if (result.errors.length > 0) {
      new import_obsidian4.Notice(
        `Dropbox\u540C\u671F\u30A8\u30E9\u30FC (${result.errors.length}\u4EF6):
${result.errors[0]}`,
        8e3
      );
      console.error("[vault-sync-dropbox] sync errors:", result.errors);
    }
    if (result.conflicts.length > 0) {
      new import_obsidian4.Notice(`\u7AF6\u5408\u691C\u51FA (${result.conflicts.length}\u4EF6): \u30ED\u30FC\u30AB\u30EB\u3092\u512A\u5148\u3057\u307E\u3057\u305F\u3002`);
    }
  }
  // ─── 接続テスト ──────────────────────────────
  async testListFolder() {
    if (!this.settings.accessToken) {
      new import_obsidian4.Notice("\u26A0 \u5148\u306BDropbox\u306B\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044");
      return;
    }
    try {
      this.statusBarItem.setText("\u2601 Dropbox: \u78BA\u8A8D\u4E2D...");
      const result = await this.client.listFolder(
        this.settings.dropboxFolder || "",
        false
      );
      new import_obsidian4.Notice(`\u2705 \u63A5\u7D9AOK: ${result.entries.length}\u4EF6\u53D6\u5F97`);
      console.log("DropboxSync: list_folder result", result);
    } catch (e) {
      new import_obsidian4.Notice(`\u274C \u63A5\u7D9A\u30A8\u30E9\u30FC: ${e.message}`);
    } finally {
      this.updateStatusBar();
    }
  }
  // ─── PKCE ヘルパー ────────────────────────────
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return base64urlEncode(array);
  }
  async generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return base64urlEncode(new Uint8Array(digest));
  }
  // ─── OAuth フロー ─────────────────────────────
  async startOAuthFlow() {
    if (!this.settings.appKey) {
      new import_obsidian4.Notice("\u26A0 \u8A2D\u5B9A\u753B\u9762\u3067App Key\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
      return;
    }
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const stateBytes = new Uint8Array(16);
    window.crypto.getRandomValues(stateBytes);
    const state = Array.from(stateBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const authUrl = this.buildAuthUrl(codeChallenge, state);
    const timeoutId = setTimeout(() => {
      new import_obsidian4.Notice("\u26A0 \u8A8D\u8A3C\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\uFF085\u5206\uFF09");
    }, AUTH_TIMEOUT_MS);
    this.registerObsidianProtocolHandler(
      "vault-sync-dropbox/oauth",
      async (params) => {
        var _a;
        clearTimeout(timeoutId);
        if (params.state !== state) {
          new import_obsidian4.Notice("\u26A0 \u8A8D\u8A3C\u30A8\u30E9\u30FC\uFF1Astate\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093");
          return;
        }
        if (params.error) {
          new import_obsidian4.Notice(`\u26A0 \u8A8D\u8A3C\u30A8\u30E9\u30FC\uFF1A${params.error}`);
          return;
        }
        if (!params.code) {
          new import_obsidian4.Notice("\u26A0 \u8A8D\u8A3C\u30B3\u30FC\u30C9\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
          return;
        }
        try {
          await this.exchangeCodeForToken(params.code, codeVerifier);
          new import_obsidian4.Notice("\u2705 Dropbox\u306B\u63A5\u7D9A\u3057\u307E\u3057\u305F");
          (_a = this.settingTab) == null ? void 0 : _a.display();
        } catch (e) {
          new import_obsidian4.Notice(`\u274C \u30C8\u30FC\u30AF\u30F3\u53D6\u5F97\u5931\u6557\uFF1A${e.message}`);
        }
      }
    );
    window.location.href = authUrl;
    new import_obsidian4.Notice("\u30D6\u30E9\u30A6\u30B6\u3067Dropbox\u306E\u8A8D\u8A3C\u3092\u5B8C\u4E86\u3057\u3066\u304F\u3060\u3055\u3044");
  }
  buildAuthUrl(codeChallenge, state) {
    const url = new URL("https://www.dropbox.com/oauth2/authorize");
    url.searchParams.set("client_id", this.settings.appKey);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("token_access_type", "offline");
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    return url.toString();
  }
  // ─── トークン交換 ─────────────────────────────
  async exchangeCodeForToken(code, codeVerifier) {
    const params = {
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
      client_id: this.settings.appKey
    };
    if (this.settings.appSecret) {
      params.client_secret = this.settings.appSecret;
    }
    const response = await (0, import_obsidian4.requestUrl)({
      url: "https://api.dropbox.com/oauth2/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      throw: false
    });
    if (response.status !== 200) {
      throw new Error(`Token exchange failed (${response.status}): ${JSON.stringify(response.json)}`);
    }
    const data = response.json;
    this.settings.accessToken = data.access_token;
    if (data.refresh_token) this.settings.refreshToken = data.refresh_token;
    await this.saveSettings();
    this.client = this.buildClient();
    await this.startSync();
  }
  // ─── 接続解除 ─────────────────────────────────
  async revokeToken() {
    var _a;
    if (!this.settings.accessToken) return;
    try {
      await (0, import_obsidian4.requestUrl)({
        url: "https://api.dropboxapi.com/2/auth/token/revoke",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.accessToken}`,
          "Content-Type": "application/json"
        },
        body: "null",
        throw: false
      });
    } catch (e) {
      console.error("DropboxSync: revoke error (ignored):", e);
    }
    (_a = this.syncEngine) == null ? void 0 : _a.stop();
    this.syncEngine = null;
    this.settings.accessToken = "";
    this.settings.refreshToken = "";
    this.settings.syncCursor = "";
    await this.saveSettings();
    this.updateStatusBar();
    new import_obsidian4.Notice("Dropbox\u3068\u306E\u63A5\u7D9A\u3092\u89E3\u9664\u3057\u307E\u3057\u305F");
  }
};
function base64urlEncode(data) {
  let binary = "";
  data.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
