import type { DataAdapter } from "obsidian";

export type LogLevel = "info" | "warn" | "error";
export type LogOp =
  | "upload"
  | "download"
  | "delete"
  | "conflict"
  | "rename"
  | "auth"
  | "system";

export interface LogEntry {
  ts: number;       // Unix ms
  level: LogLevel;
  op: LogOp;
  path?: string;    // 対象ファイルのvaultパス（任意）
  msg: string;
  detail?: unknown; // エラーオブジェクト等（任意）
}

interface SyncLog {
  version: 1;
  entries: LogEntry[];
}

const LOG_PATH = ".obsidian/plugins/vault-sync-dropbox/log.json";
const MAX_ENTRIES = 1000;

export class SyncLogger {
  private entries: LogEntry[] = [];

  constructor(private adapter: DataAdapter) {}

  async load(): Promise<void> {
    try {
      const raw = await this.adapter.read(LOG_PATH);
      const parsed: SyncLog = JSON.parse(raw);
      if (parsed.version === 1 && Array.isArray(parsed.entries)) {
        this.entries = parsed.entries;
      }
    } catch {
      // ファイル未存在は正常（初回起動）
      this.entries = [];
    }
  }

  log(level: LogLevel, op: LogOp, msg: string, path?: string, detail?: unknown): void {
    this.entries.push({ ts: Date.now(), level, op, msg, path, detail });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
  }

  async flushAll(): Promise<void> {
    const data: SyncLog = { version: 1, entries: this.entries };
    try {
      await this.adapter.write(LOG_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("[SyncLogger] flush failed:", e);
    }
  }

  getEntries(): Readonly<LogEntry[]> {
    return this.entries;
  }
}
