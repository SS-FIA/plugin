# vault-sync-dropbox 開発コンテキスト

## 環境
- NRT (Mac mini M4, 192.168.1.53)
- bun使用、Node.js不可
- Obsidianプラグイン開発（コミュニティプラグイン）
- テストVault: ビルド時に自動コピー済み

## 完了状況
- Day1: プロジェクト初期化、esbuild設定
- Day2: OAuth2/PKCE認証完成、Dropbox API動作確認（list_folder/upload/download）
- Day3: ファイル分割・統合完了、ビルド成功 ✅

## ファイル構成
- src/main.ts             : メインプラグイン（OAuth認証フロー完成、DropboxClient統合済み）
- src/settings.ts         : DropboxSyncSettings型、DEFAULT_SETTINGS、DropboxSyncSettingTab
- src/dropbox-client.ts   : DropboxClient（list_folder/listFolderContinue/upload/download/delete）
- test-day2.mjs           : Dropbox API動作確認スクリプト（ACCESS_TOKEN環境変数必要）

## 設定インターフェース（DropboxSyncSettings）
- appKey, appSecret
- accessToken, refreshToken
- dropboxFolder（例: /ObsidianVault）
- syncIntervalMinutes（デフォルト5）
- excludedFolders（デフォルト: .obsidian, .trash）
- syncCursor（差分同期用カーソル）
- lastSync（最終同期時刻）

## Day4の予定
- SyncEngineの実装（src/sync-engine.ts）
- ローカルVaultイベント監視（create/modify/delete/rename）
- Dropboxカーソルベースの差分同期
- main.tsへのSyncEngine統合
- 競合解決：last-write-wins戦略

## ビルドコマンド
bun run build

## 型チェック
bun x tsc --noEmit --skipLibCheck
