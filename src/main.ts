import {
  App,
  Notice,
  Plugin,
  requestUrl,
} from "obsidian";
import {
  DropboxSyncSettings,
  DEFAULT_SETTINGS,
  DropboxSyncSettingTab,
} from "./settings";
import { DropboxClient } from "./dropbox-client";
import { SyncEngine, SyncStatus, SyncResult } from "./sync-engine";
import { SyncLogger } from "./sync-log";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

const REDIRECT_URI = "obsidian://vault-sync-dropbox/oauth";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────
// メインプラグインクラス
// ─────────────────────────────────────────────

export default class DropboxSyncPlugin extends Plugin {
  settings!: DropboxSyncSettings;
  client!: DropboxClient;  // 【FIX】全箇所でthis.clientに統一

  private statusBarItem!: HTMLElement;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncEngine: SyncEngine | null = null;
  private syncLogger!: SyncLogger;
  settingTab?: DropboxSyncSettingTab;

  async onload() {
    console.log("DropboxSync: loading plugin");
    await this.loadSettings();

    // 【FIX】初期化時にthis.clientへ代入（dropboxClientは廃止）
    this.client = this.buildClient();

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();

    this.settingTab = new DropboxSyncSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.syncLogger = new SyncLogger(this.app.vault.adapter);
    await this.syncLogger.load();

    this.addCommand({
      id: "connect-dropbox",
      name: "Dropboxに接続",
      callback: () => this.startOAuthFlow(),
    });

    this.addCommand({
      id: "test-list-folder",
      name: "Dropbox接続テスト（list_folder）",
      callback: () => this.testListFolder(),
    });

    this.addCommand({
      id: "manual-sync",
      name: "今すぐ同期 (Dropbox)",
      callback: async () => {
        if (!this.syncEngine) {
          new Notice("Dropbox未接続です。設定から認証してください。");
          return;
        }
        const result = await this.syncEngine.incrementalSync();
        await this.handleSyncResult(result);
      },
    });

    if (this.settings.accessToken) {
      await this.startSync();
    }
  }

  onunload() {
    this.statusBarItem.remove();
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncEngine?.stop();
  }

  // ─── DropboxClient生成 ────────────────────────
  // 【FIX】OAuth完了後にも同じファクトリを使いClientを再生成する

  private buildClient(): DropboxClient {
    return new DropboxClient(
      this.settings.accessToken,
      this.settings.refreshToken,
      this.settings.appKey,
      this.settings.appSecret,
      async (newToken: string) => {
        this.settings.accessToken = newToken;
        await this.saveSettings();
      }
    );
  }

  // ─── 同期開始 ─────────────────────────────────

  async startSync(): Promise<void> {
    this.syncEngine?.stop();
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

  private updateStatusBar(status: SyncStatus = "idle", progress?: { current: number; total: number }) {
    if (status === "syncing" && progress) {
      this.statusBarItem.setText(`☁ Syncing ${progress.current}/${progress.total}`);
    } else if (status === "syncing") {
      this.statusBarItem.setText("☁ Syncing...");
    } else if (status === "error") {
      this.statusBarItem.setText("☁ Sync error");
    } else {
      const lastSync = this.settings.lastSync
        ? new Date(this.settings.lastSync).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "未同期";
      this.statusBarItem.setText(`☁ Dropbox: 接続済 (${lastSync})`);
    }
  }

  private async handleSyncResult(result: SyncResult) {
    this.settings.lastSync = new Date().toISOString();
    await this.saveSettings();
    this.updateStatusBar("idle");

    if (result.errors.length > 0) {
      new Notice(
        `Dropbox同期エラー (${result.errors.length}件):\n${result.errors[0]}`,
        8000
      );
      console.error("[vault-sync-dropbox] sync errors:", result.errors);
    }
    if (result.conflicts.length > 0) {
      new Notice(`競合検出 (${result.conflicts.length}件): ローカルを優先しました。`);
    }
  }

  // ─── 接続テスト ──────────────────────────────

  private async testListFolder() {
    if (!this.settings.accessToken) {
      new Notice("⚠ 先にDropboxに接続してください");
      return;
    }
    try {
      this.statusBarItem.setText("☁ Dropbox: 確認中...");
      const result = await this.client.listFolder(
        this.settings.dropboxFolder || "",
        false
      );
      new Notice(`✅ 接続OK: ${result.entries.length}件取得`);
      console.log("DropboxSync: list_folder result", result);
    } catch (e) {
      new Notice(`❌ 接続エラー: ${(e as Error).message}`);
    } finally {
      this.updateStatusBar();
    }
  }
  
	// ─── PKCE ヘルパー ────────────────────────────

	private generateCodeVerifier(): string {
	  const array = new Uint8Array(32);
	  window.crypto.getRandomValues(array);
	  return base64urlEncode(array);
	}

	private async generateCodeChallenge(verifier: string): Promise<string> {
	  const data   = new TextEncoder().encode(verifier);
	  const digest = await window.crypto.subtle.digest("SHA-256", data);
	  return base64urlEncode(new Uint8Array(digest));
	}
  
	// ─── OAuth フロー ─────────────────────────────
  
	async startOAuthFlow(): Promise<void> {
	  if (!this.settings.appKey) {
		new Notice("⚠ 設定画面でApp Keyを入力してください");
		return;
	  }

	  const codeVerifier  = this.generateCodeVerifier();
	  const codeChallenge = await this.generateCodeChallenge(codeVerifier);
	  const stateBytes    = new Uint8Array(16);
	  window.crypto.getRandomValues(stateBytes);
	  const state         = Array.from(stateBytes).map(b => b.toString(16).padStart(2, "0")).join("");
	  const authUrl       = this.buildAuthUrl(codeChallenge, state);

	  const timeoutId = setTimeout(() => {
		new Notice("⚠ 認証がタイムアウトしました（5分）");
	  }, AUTH_TIMEOUT_MS);

	  this.registerObsidianProtocolHandler(
		"vault-sync-dropbox/oauth",
		async (params) => {
		  clearTimeout(timeoutId);
		  if (params.state !== state) {
			new Notice("⚠ 認証エラー：stateが一致しません");
			return;
		  }
		  if (params.error) {
			new Notice(`⚠ 認証エラー：${params.error}`);
			return;
		  }
		  if (!params.code) {
			new Notice("⚠ 認証コードが取得できませんでした");
			return;
		  }
		  try {
			await this.exchangeCodeForToken(params.code, codeVerifier);
			new Notice("✅ Dropboxに接続しました");
			this.settingTab?.display();
		  } catch (e) {
			new Notice(`❌ トークン取得失敗：${(e as Error).message}`);
		  }
		}
	  );

	  window.location.href = authUrl;
	  new Notice("ブラウザでDropboxの認証を完了してください");
	}
  
	private buildAuthUrl(codeChallenge: string, state: string): string {
	  const url = new URL("https://www.dropbox.com/oauth2/authorize");
	  url.searchParams.set("client_id",             this.settings.appKey);
	  url.searchParams.set("response_type",         "code");
	  url.searchParams.set("redirect_uri",          REDIRECT_URI);
	  url.searchParams.set("token_access_type",     "offline");
	  url.searchParams.set("code_challenge",        codeChallenge);
	  url.searchParams.set("code_challenge_method", "S256");
	  url.searchParams.set("state",                 state);
	  return url.toString();
	}
  
	// ─── トークン交換 ─────────────────────────────
  
	private async exchangeCodeForToken(
	  code: string,
	  codeVerifier: string
	): Promise<void> {
	  const params: Record<string, string> = {
		code,
		grant_type:    "authorization_code",
		redirect_uri:  REDIRECT_URI,
		code_verifier: codeVerifier,
		client_id:     this.settings.appKey,
	  };
	  if (this.settings.appSecret) {
		params.client_secret = this.settings.appSecret;
	  }
  
	  const response = await requestUrl({
		url:    "https://api.dropbox.com/oauth2/token",
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body:   new URLSearchParams(params).toString(),
		throw:  false,
	  });
  
	  if (response.status !== 200) {
		throw new Error(`Token exchange failed (${response.status}): ${JSON.stringify(response.json)}`);
	  }
  
	  const data = response.json as {
		access_token:   string;
		refresh_token?: string;
	  };
  
	  this.settings.accessToken = data.access_token;
	  if (data.refresh_token) this.settings.refreshToken = data.refresh_token;
	  await this.saveSettings();
  
	  // 【FIX】新トークンで DropboxClient を再生成してから同期開始
	  // （古いclientのまま startSync するとリフレッシュコールバックが繋がらない）
	  this.client = this.buildClient();
	  await this.startSync();
	}
  
	// ─── 接続解除 ─────────────────────────────────
  
	async revokeToken(): Promise<void> {
	  if (!this.settings.accessToken) return;
	  try {
		await requestUrl({
		  url:    "https://api.dropboxapi.com/2/auth/token/revoke",
		  method: "POST",
		  headers: {
			Authorization:  `Bearer ${this.settings.accessToken}`,
			"Content-Type": "application/json",
		  },
		  body:  "null",
		  throw: false,
		});
	  } catch (e) {
		console.error("DropboxSync: revoke error (ignored):", e);
	  }
  
	  this.syncEngine?.stop();
	  this.syncEngine = null;
  
	  this.settings.accessToken  = "";
	  this.settings.refreshToken = "";
	  this.settings.syncCursor   = "";
	  await this.saveSettings();
	  this.updateStatusBar();
	  new Notice("Dropboxとの接続を解除しました");
	}
  }

// ─── Web Crypto ユーティリティ（Node.js 非依存）────────────────
// btoa + Uint8Array を使った base64url エンコード
// Node.js の Buffer/crypto に依存しないので iOS でも動作する

function base64urlEncode(data: Uint8Array): string {
  let binary = "";
  data.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}