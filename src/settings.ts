import { App, PluginSettingTab, Setting } from "obsidian";
import type DropboxSyncPlugin from "./main";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface DropboxSyncSettings {
  appKey: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
  dropboxFolder: string;
  syncIntervalMinutes: number;
  excludedFolders: string[];
  syncCursor: string;
  lastSync: string;
  localTombstones: Record<string, number>; // path → 削除時刻(ms)
}

export const DEFAULT_SETTINGS: DropboxSyncSettings = {
  appKey: "",
  appSecret: "",
  accessToken: "",
  refreshToken: "",
  dropboxFolder: "/ObsidianVault",
  syncIntervalMinutes: 5,
  excludedFolders: [".obsidian", ".trash"],
  syncCursor: "",
  lastSync: "",
  localTombstones: {},
};

// ─────────────────────────────────────────────
// 設定タブ（main.tsから移動）
// ─────────────────────────────────────────────

export class DropboxSyncSettingTab extends PluginSettingTab {
  plugin: DropboxSyncPlugin;

  constructor(app: App, plugin: DropboxSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Dropbox Sync 設定" });

    new Setting(containerEl)
      .setName("App Key")
      .setDesc("Dropbox Developer Console で確認できます")
      .addText((text) =>
        text
          .setPlaceholder("例: kd6a7ywlcptrskd")
          .setValue(this.plugin.settings.appKey)
          .onChange(async (value) => {
            this.plugin.settings.appKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("App Secret")
      .setDesc("PKCE使用時は省略可")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text
          .setPlaceholder("省略可")
          .setValue(this.plugin.settings.appSecret)
          .onChange(async (value) => {
            this.plugin.settings.appSecret = value.trim();
            await this.plugin.saveSettings();
          });
        return text;
      });

    containerEl.createEl("hr");

    // ── 接続状態 ────────────────────────────────
    const isConnected = !!this.plugin.settings.accessToken;
    const connectSetting = new Setting(containerEl)
      .setName("Dropbox接続状態")
      .setDesc(
        isConnected
          ? "✅ 接続済み（refresh_token: " +
              (this.plugin.settings.refreshToken ? "あり" : "なし") + "）"
          : "⬜ 未接続"
      );

    if (!isConnected) {
      connectSetting.addButton((btn) =>
        btn
          .setButtonText("Dropboxに接続")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("認証中...");
            try {
              await this.plugin.startOAuthFlow();
              this.display();
            } catch (err) {
              btn.setDisabled(false);
              btn.setButtonText("Dropboxに接続");
            }
          })
      );
    } else {
      connectSetting.addButton((btn) =>
        btn
          .setButtonText("接続解除")
          .setWarning()
          .onClick(async () => {
            await this.plugin.revokeToken();
            this.display();
          })
      );
    }

    containerEl.createEl("hr");

    new Setting(containerEl)
      .setName("同期先 Dropboxフォルダ")
      .setDesc("例: /ObsidianVault")
      .addText((text) =>
        text
          .setPlaceholder("/ObsidianVault")
          .setValue(this.plugin.settings.dropboxFolder)
          .onChange(async (value) => {
            let v = value.trim();
            if (v && !v.startsWith("/")) v = "/" + v;
            this.plugin.settings.dropboxFolder = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("同期間隔（分）")
      .setDesc("自動同期の間隔。デフォルト5分。")
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.syncIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.syncIntervalMinutes = value;
            await this.plugin.saveSettings();
          })
      );

    if (this.plugin.settings.lastSync) {
      new Setting(containerEl)
        .setName("最終同期")
        .setDesc(this.plugin.settings.lastSync)
        .setDisabled(true);
    }
  }
}