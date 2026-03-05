// src/dropbox-client.ts
import { requestUrl } from "obsidian";

export interface DropboxEntry {
  ".tag": "file" | "folder" | "deleted";
  name: string;
  path_lower: string;
  path_display: string;
  id?: string;
  content_hash?: string;
  client_modified?: string;
  server_modified?: string;
  rev?: string;
  size?: number;
}

export interface ListFolderResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

// トークンリフレッシュ成功時にmain.tsへ通知するためのコールバック型
export type OnTokenRefreshed = (accessToken: string) => Promise<void>;

export class DropboxClient {
  private accessToken: string;
  private readonly refreshToken: string;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly onTokenRefreshed: OnTokenRefreshed;

  private readonly API     = "https://api.dropboxapi.com/2";
  private readonly CONTENT = "https://content.dropboxapi.com/2";

  // リフレッシュ中の重複実行を防ぐPromiseキャッシュ
  private refreshPromise: Promise<void> | null = null;

  constructor(
    accessToken: string,
    refreshToken: string,
    appKey: string,
    appSecret: string,
    onTokenRefreshed: OnTokenRefreshed
  ) {
    this.accessToken      = accessToken;
    this.refreshToken     = refreshToken;
    this.appKey           = appKey;
    this.appSecret        = appSecret;
    this.onTokenRefreshed = onTokenRefreshed;
  }

  setToken(token: string) {
    this.accessToken = token;
  }

  private get authHeader() {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  // ============================================================
  // トークンリフレッシュ（401時に自動呼び出し）
  // ============================================================

  private async refreshAccessToken(): Promise<void> {
    // 並列呼び出しの場合、同一Promiseを共有して二重リフレッシュを防ぐ
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const body = new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: this.refreshToken,
        client_id:     this.appKey,
        ...(this.appSecret ? { client_secret: this.appSecret } : {}),
      });

      const res = await requestUrl({
        url:    "https://api.dropbox.com/oauth2/token",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:   body.toString(),
        throw:  false,
      });

      if (res.status !== 200) {
        throw new Error(`token refresh failed (${res.status}): ${JSON.stringify(res.json)}`);
      }

      const newToken = res.json.access_token as string;
      this.accessToken = newToken;

      // main.ts（settings）へ新トークンを永続化
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

  private async withTokenRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (/401|expired_access_token/i.test(String(e))) {
        console.warn("[DropboxClient] token expired, refreshing...");
        await this.refreshAccessToken();
        return await fn(); // リフレッシュ後に1回だけリトライ
      }
      throw e;
    }
  }

  // ============================================================
  // API メソッド（全てwithTokenRetry経由）
  // ============================================================

  async listFolder(path: string, recursive = false): Promise<ListFolderResult> {
    return this.withTokenRetry(async () => {
      const res = await requestUrl({
        url:     `${this.API}/files/list_folder`,
        method:  "POST",
        headers: { ...this.authHeader, "Content-Type": "application/json" },
        body:    JSON.stringify({ path, recursive }),
        throw:   false,
      });
      if (res.status !== 200) {
        throw new Error(`list_folder failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
      return res.json as ListFolderResult;
    });
  }

  async listFolderContinue(cursor: string): Promise<ListFolderResult> {
    return this.withTokenRetry(async () => {
      const res = await requestUrl({
        url:     `${this.API}/files/list_folder/continue`,
        method:  "POST",
        headers: { ...this.authHeader, "Content-Type": "application/json" },
        body:    JSON.stringify({ cursor }),
        throw:   false,
      });
      if (res.status !== 200) {
        throw new Error(`list_folder/continue failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
      return res.json as ListFolderResult;
    });
  }

  async upload(dropboxPath: string, content: ArrayBuffer): Promise<DropboxEntry> {
    return this.withTokenRetry(async () => {
      const res = await requestUrl({
        url:    `${this.CONTENT}/files/upload`,
        method: "POST",
        headers: {
          ...this.authHeader,
          "Content-Type":    "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path:       dropboxPath,
            mode:       "overwrite",
            autorename: false,
            mute:       false,
          }),
        },
        body:  content,
        throw: false,
      });
      if (res.status !== 200) {
        throw new Error(`upload failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
      return res.json as DropboxEntry;
    });
  }

  async download(dropboxPath: string): Promise<ArrayBuffer> {
    return this.withTokenRetry(async () => {
      const res = await requestUrl({
        url:    `${this.CONTENT}/files/download`,
        method: "POST",
        headers: {
          ...this.authHeader,
          "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath }),
        },
        throw: false,
      });
      if (res.status !== 200) {
        throw new Error(`download failed (${res.status})`);
      }
      return res.arrayBuffer;
    });
  }

  async delete(dropboxPath: string): Promise<void> {
    return this.withTokenRetry(async () => {
      const res = await requestUrl({
        url:     `${this.API}/files/delete_v2`,
        method:  "POST",
        headers: { ...this.authHeader, "Content-Type": "application/json" },
        body:    JSON.stringify({ path: dropboxPath }),
        throw:   false,
      });
      if (res.status !== 200 && res.status !== 409) {
        throw new Error(`delete failed (${res.status}): ${JSON.stringify(res.json)}`);
      }
    });
  }
}