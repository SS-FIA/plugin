// src/sync-engine.ts
import { App, TFile, TFolder, normalizePath } from "obsidian";
import { DropboxClient, DropboxEntry } from "./dropbox-client";
import { DropboxSyncSettings } from "./settings";
import {
  SyncState,
  DEFAULT_SYNC_STATE,
  loadSyncState,
  saveSyncState,
  findByPath,
} from "./sync-state";
import { computeContentHash } from "./content-hash";
import { SyncLock } from "./sync-lock";
import { makeConflictPath } from "./conflict";
import { SyncLogger } from "./sync-log";

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// ============================================================
// 型定義
// ============================================================

export type SyncStatus = "idle" | "syncing" | "error";

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  deleted: number;
  conflicts: string[];
  errors: string[];
}

interface LocalFileRecord {
  path: string;   // Vault相対パス
  mtime: number;  // Unix ms
}

// ============================================================
// SyncEngine
// ============================================================

export class SyncEngine {
  private app: App;
  private client: DropboxClient;
  private settings: DropboxSyncSettings;
  private saveSettings: () => Promise<void>;

  private status: SyncStatus = "idle";
  onStatusChange?: (status: SyncStatus) => void;
  private intervalId: number | null = null;

  private syncState: SyncState = DEFAULT_SYNC_STATE;

  // ローカルイベントの debounce バッファ
  private pendingUploads: Map<string, number> = new Map();
  private readonly UPLOAD_DEBOUNCE_MS = 3000;

  // ダウンロード中パスのガード（アップロード競合防止）
  private syncingPaths: Set<string> = new Set();

  private lock = new SyncLock();
  private static readonly BATCH_SIZE     = 20;
  private static readonly BATCH_PAUSE_MS = 500;

  private readonly TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

  private logger: SyncLogger;

  onProgress?: (current: number, total: number) => void;

  constructor(
    app: App,
    client: DropboxClient,
    settings: DropboxSyncSettings,
    saveSettings: () => Promise<void>,
    logger: SyncLogger
  ) {
    this.app = app;
    this.client = client;
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.logger = logger;
  }

  // ============================================================
  // ライフサイクル
  // ============================================================

  async start(): Promise<void> {
    // Day7以前のsettings.json.localTombstonesをstate.jsonへ移植
    this.syncState = await loadSyncState(
      this.app.vault,
      this.settings.localTombstones
    );
    if (Object.keys(this.settings.localTombstones ?? {}).length > 0) {
      this.settings.localTombstones = {};
      await this.saveSettings();
    }

    this.registerVaultEvents();
    await this.fullSync();
    this.startInterval();
  }

  stop(): void {
    this.stopInterval();
    for (const timerId of this.pendingUploads.values()) {
      window.clearTimeout(timerId);
    }
    this.pendingUploads.clear();
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.onStatusChange?.(status);
  }

  private gcTombstones(): void {
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

  private dirtyCount = 0;
private saveTimer: ReturnType<typeof setTimeout> | null = null;
private static readonly SAVE_DEBOUNCE_MS = 5_000;
private static readonly SAVE_BATCH_SIZE = 10;

private markDirty(): void {
  this.dirtyCount++;
  if (this.dirtyCount >= SyncEngine.SAVE_BATCH_SIZE) {
    void this.flushSyncState();
    return;
  }
  if (this.saveTimer) clearTimeout(this.saveTimer);
  this.saveTimer = setTimeout(
    () => void this.flushSyncState(),
    SyncEngine.SAVE_DEBOUNCE_MS
  );
}

async flushSyncState(): Promise<void> {
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

  private startInterval(): void {
    if (this.intervalId !== null) return;
    const ms = (this.settings.syncIntervalMinutes ?? 5) * 60 * 1000;
    this.intervalId = window.setInterval(() => this.incrementalSync(), ms);
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ============================================================
  // Vault イベント監視
  // ============================================================

  private registerVaultEvents(): void {
    const vault = this.app.vault;
    vault.on("create",  (f) => { if (f instanceof TFile) this.scheduleUpload(f.path); });
    vault.on("modify",  (f) => { if (f instanceof TFile) this.scheduleUpload(f.path); });
    vault.on("delete",  (f) => { if (f instanceof TFile) this.handleLocalDelete(f.path); });
    vault.on("rename",  (f, oldPath) => {
      if (f instanceof TFile) {
        this.handleLocalDelete(oldPath);
        this.scheduleUpload(f.path);
      }
    });
  }

  private scheduleUpload(vaultPath: string): void {
    if (this.syncingPaths.has(vaultPath)) return;
    if (this.isExcluded(vaultPath)) return;
    const existing = this.pendingUploads.get(vaultPath);
    if (existing !== undefined) window.clearTimeout(existing);
    const id = window.setTimeout(async () => {
      this.pendingUploads.delete(vaultPath);
      await this.uploadFile(vaultPath);
    }, this.UPLOAD_DEBOUNCE_MS);
    this.pendingUploads.set(vaultPath, id);
  }

  // ============================================================
  // フルシンク
  // ============================================================

  async fullSync(): Promise<SyncResult> {
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

      const localMap = new Map(localFiles.map((f) => [f.path, f]));
      const dropboxMap = new Map(
        dropboxFiles
          .filter((e) => e[".tag"] === "file")
          .map((e) => [
            this.dropboxToVaultPath(e.path_lower ?? e.path_display ?? ""),
            e,
          ])
      );

      // Dropbox → ローカル（ダウンロード対象を収集してバッチDL）
      const toDownload: DropboxEntry[] = [];
      for (const [vaultPath, dbEntry] of dropboxMap) {
        if (!vaultPath || this.isExcluded(vaultPath)) continue;
        const local = localMap.get(vaultPath);
        const dbMtime = dbEntry.client_modified
          ? new Date(dbEntry.client_modified).getTime()
          : 0;
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
        this.onProgress?.(cur, tot);
      });

      // ローカル → Dropbox（存在しないもの）
      for (const local of localFiles) {
        if (this.isExcluded(local.path)) continue;
        if (!dropboxMap.has(local.path)) {
          await this.uploadFile(local.path, result);
        }
      }

      this.settings.syncCursor = finalCursor;
      this.settings.lastSync = new Date().toISOString();
      await this.saveSettings();
      this.logger.log("info", "system", `fullSync completed: up=${result.uploaded} dl=${result.downloaded} del=${result.deleted}`);
    } catch (e) {
      result.errors.push(String(e));
      this.logger.log("error", "system", `error: ${String(e)}`, undefined, e);
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

  async incrementalSync(): Promise<SyncResult> {
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

        // ── rename検知 ──────────────────────────────────────
        for (const entry of res.entries) {
          if (entry[".tag"] !== "file" || !entry.id) continue;

          const existing = this.syncState.files[entry.id];
          if (!existing) continue;

          const newVaultPath = this.dropboxToVaultPath(entry.path_display ?? entry.path_lower ?? "");
          if (existing.path === newVaultPath) continue; // パス変化なし

          const oldVaultPath = existing.path;
          const oldFile = this.app.vault.getAbstractFileByPath(normalizePath(oldVaultPath));

          if (oldFile) {
            try {
              await this.app.vault.rename(oldFile, newVaultPath);
              existing.path = newVaultPath;
              await this.flushSyncState();
              this.logger.log("info", "rename", `renamed: ${oldVaultPath} → ${newVaultPath}`, newVaultPath);
            } catch (e) {
              this.logger.log("error", "system", `rename failed: ${oldVaultPath} → ${newVaultPath}: ${String(e)}`, oldVaultPath, e);
            }
          } else {
            // ローカルに旧ファイルなし → stateのpathだけ更新してdownloadに任せる
            existing.path = newVaultPath;
            await this.flushSyncState();
          }
        }
        // ── rename検知ここまで ────────────────────────────────

        for (const entry of res.entries) {
          const vaultPath = this.dropboxToVaultPath(
            entry.path_lower ?? entry.path_display ?? ""
          );
          if (!vaultPath || this.isExcluded(vaultPath)) continue;
          if (entry[".tag"] === "deleted") {
            await this.handleRemoteDelete(vaultPath, result);
          } else if (entry[".tag"] === "file") {
            await this.resolveConflictAndDownload(vaultPath, result, entry);
          }
        }
      }
      this.settings.syncCursor = cursor;
      this.settings.lastSync = new Date().toISOString();
      await this.saveSettings();
    } catch (e) {
      result.errors.push(String(e));
      this.logger.log("error", "system", `error: ${String(e)}`, undefined, e);
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

  private async resolveConflictAndDownload(
    vaultPath: string,
    result: SyncResult,
    dbEntry: DropboxEntry,
  ): Promise<void> {
    const remoteHash = dbEntry.content_hash ?? "";

    // 1. content_hash一致 → 変更なし
    const existing = findByPath(this.syncState, vaultPath);
    if (existing) {
      const [, state] = existing;
      if (state.contentHash === remoteHash) return;
    }

    // 2. ローカルファイル未存在 → そのままDL
    const normalized = normalizePath(vaultPath);
    const localExists = await this.app.vault.adapter.exists(normalized);
    if (!localExists) {
      await this.downloadFile(vaultPath, result, dbEntry);
      return;
    }

    // 3. ローカルが未変更（syncState一致）→ Dropbox版で上書き
    if (existing) {
      const [, state] = existing;
      const localData = await this.app.vault.adapter.readBinary(normalized);
      const localHash = await computeContentHash(localData);
      if (localHash === state.contentHash) {
        await this.downloadFile(vaultPath, result, dbEntry);
        return;
      }
    }

    // 4. 両側変更 → conflictファイルを作成し、Dropbox版を本体に上書き
    const conflictPath = makeConflictPath(vaultPath);
    const localData = await this.app.vault.adapter.readBinary(normalized);
    await this.app.vault.adapter.writeBinary(conflictPath, localData);
    result.conflicts.push(conflictPath);
    this.logger.log("warn", "conflict", `conflict: ${vaultPath}`, vaultPath);
    await this.downloadFile(vaultPath, result, dbEntry);
  }

  private async batchDownload(
    entries: DropboxEntry[],
    result: SyncResult,
    onProgress?: (current: number, total: number) => void,
  ): Promise<void> {
    const total = entries.length;
    for (let i = 0; i < total; i += SyncEngine.BATCH_SIZE) {
      const batch = entries.slice(i, i + SyncEngine.BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async entry => {
          const vaultPath = this.dropboxToVaultPath(entry.path_lower ?? entry.path_display ?? "");
          await this.downloadFile(vaultPath, result, entry);
        }),
      );
      const current = Math.min(i + SyncEngine.BATCH_SIZE, total);
      onProgress?.(current, total);
      if (i + SyncEngine.BATCH_SIZE < total) {
        await sleep(SyncEngine.BATCH_PAUSE_MS);
      }
    }
  }

  // ============================================================
  // ファイル操作
  // ============================================================

  private async uploadFile(vaultPath: string, result?: SyncResult): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(vaultPath));
      if (!(file instanceof TFile)) return;
      const content = await this.app.vault.readBinary(file);

      const localHash = await computeContentHash(content);

      const found = findByPath(this.syncState, vaultPath);
      if (found) {
        const [, entry] = found;
        if (entry.contentHash === localHash) return;
      }

      const dropboxPath = this.vaultToDropboxPath(vaultPath);
      const res = await this.client.upload(dropboxPath, content);

      if (res?.id) {
        this.syncState.files[res.id] = {
          path: vaultPath,
          contentHash: res.content_hash ?? localHash,
          lastSyncedAt: Date.now(),
        };
        this.markDirty();
      }

      if (result) result.uploaded++;
      this.logger.log("info", "upload", `uploaded: ${vaultPath}`, vaultPath);
    } catch (e) {
      const msg = `upload failed: ${vaultPath} – ${e}`;
      if (result) result.errors.push(msg);
      console.error("[SyncEngine]", msg);
    }
  }

  private async downloadFile(
    vaultPath: string,
    result?: SyncResult,
    dbEntry?: DropboxEntry
  ): Promise<void> {
    this.syncingPaths.add(vaultPath);
    try {
      const dropboxPath    = this.vaultToDropboxPath(vaultPath);
      const data           = await this.client.download(dropboxPath);
      const normalizedPath = normalizePath(vaultPath);
      await this.ensureFolder(normalizedPath);

      const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (existing instanceof TFile) {
        await this.app.vault.modifyBinary(existing, data);
      } else {
        try {
          await this.app.vault.createBinary(normalizedPath, data);
        } catch (e) {
          if (/already exists/i.test(String(e))) {
            await this.app.vault.adapter.writeBinary(normalizedPath, data);
          } else {
            throw e;
          }
        }
      }

      if (dbEntry?.id) {
        const hash = dbEntry.content_hash ?? await computeContentHash(data);
        this.syncState.files[dbEntry.id] = {
          path: vaultPath,
          contentHash: hash,
          lastSyncedAt: Date.now(),
        };
        this.markDirty();
      }

      if (result) result.downloaded++;
      this.logger.log("info", "download", `downloaded: ${vaultPath}`, vaultPath);
    } catch (e) {
      const msg = `download failed: ${vaultPath} – ${e}`;
      if (result) result.errors.push(msg);
      console.error("[SyncEngine]", msg);
    } finally {
      window.setTimeout(() => this.syncingPaths.delete(vaultPath), 500);
    }
  }

  private async handleLocalDelete(vaultPath: string): Promise<void> {
    if (this.isExcluded(vaultPath)) return;

    // tombstone記録（state.jsonへ）
    this.syncState.tombstones[vaultPath] = Date.now();
    this.markDirty();

    try {
      await this.client.delete(this.vaultToDropboxPath(vaultPath));
      // Dropbox削除成功後はtombstone不要
      delete this.syncState.tombstones[vaultPath];
      this.markDirty();
    } catch (e) {
      console.warn("[SyncEngine] remote delete skipped:", vaultPath, e);
    }
  }

  private async handleRemoteDelete(vaultPath: string, result: SyncResult): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(vaultPath));
      if (file instanceof TFile) {
        await this.app.vault.trash(file, true);
        result.deleted++;
        this.logger.log("info", "delete", `deleted: ${vaultPath}`, vaultPath);
      }
    } catch (e) {
      result.errors.push(`local delete failed: ${vaultPath} – ${e}`);
    }
  }
  private vaultToDropboxPath(vaultPath: string): string {
    const base = (this.settings.dropboxFolder ?? "/ObsidianVault").replace(/\/$/, "");
    return `${base}/${vaultPath}`;
  }

  private dropboxToVaultPath(dropboxPath: string): string {
    const base = (this.settings.dropboxFolder ?? "/ObsidianVault")
      .replace(/\/$/, "")
      .toLowerCase();
    const lower = dropboxPath.toLowerCase();
    if (!lower.startsWith(base)) return "";
    return dropboxPath.slice(base.length + 1);
  }

  private isExcluded(vaultPath: string): boolean {
    const excluded = this.settings.excludedFolders ?? [".obsidian", ".trash"];
    return excluded.some(
      (f) => vaultPath.startsWith(f + "/") || vaultPath === f
    );
  }

  private listAllLocalFiles(): LocalFileRecord[] {
    const files: LocalFileRecord[] = [];
    const recurse = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile) {
          files.push({ path: child.path, mtime: child.stat.mtime });
        } else if (child instanceof TFolder) {
          recurse(child);
        }
      }
    };
    recurse(this.app.vault.getRoot());
    return files;
  }

  private async listAllDropboxFiles(): Promise<{ entries: DropboxEntry[]; finalCursor: string }> {
    const base  = this.settings.dropboxFolder ?? "/ObsidianVault";
    const first = await this.client.listFolder(base);
    const all: DropboxEntry[] = [...first.entries];
    let cursor  = first.cursor;
    let hasMore = first.has_more;
    while (hasMore) {
      const cont = await this.client.listFolderContinue(cursor);
      all.push(...cont.entries);
      cursor  = cont.cursor;
      hasMore = cont.has_more;
    }
    return { entries: all, finalCursor: cursor };
  }

  private async refreshCursor(): Promise<void> {
    try {
      const base  = this.settings.dropboxFolder ?? "/ObsidianVault";
      const first = await this.client.listFolder(base);
      let cursor  = first.cursor;
      let more    = first.has_more;
      while (more) {
        const cont = await this.client.listFolderContinue(cursor);
        cursor = cont.cursor;
        more   = cont.has_more;
      }
      this.settings.syncCursor = cursor;
    } catch (e) {
      console.warn("[SyncEngine] refreshCursor failed:", e);
    }
  }

  private async ensureFolder(filePath: string): Promise<void> {
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

  private emptyResult(): SyncResult {
    return { uploaded: 0, downloaded: 0, deleted: 0, conflicts: [], errors: [] };
  }
}
