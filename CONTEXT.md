# vault-sync-dropbox CONTEXT
## 作成日: 2026-03-07（セッション2終了時点）

---

## 現在の状態

**バージョン: 0.4.27**
**双方向同期: 完全動作確認済み**

| 機能 | 状態 |
|------|------|
| Mac→iPad 新規ファイル | ✅ 動作確認済み |
| iPad→Mac 新規ファイル | ✅ 動作確認済み |
| 双方向ファイル編集同期 | ✅ 動作確認済み |
| 双方向ファイル削除同期 | ✅ 動作確認済み |
| 文字化け | ✅ 解消済み |
| 競合コピー除外 | ✅ v0.4.27で実装済み |
| tombstone自動修復 | ✅ v0.4.27で実装済み |

---

## セッション2で実装した修正

### patch A: Dropbox競合コピー除外
**ファイル:** `src/sync-engine.ts`
**問題:** Dropboxアプリが自動生成する「KのMac mini の競合コピー 2026-03-07」形式のファイルがVaultに流入していた。`excludedFolders`では防げない。
**修正:** `isConflictCopy()` メソッドと `CONFLICT_COPY_RE` 正規表現を追加。`isExcluded()` の冒頭でガードすることで全入口（upload/download/fullSync/incrementalSync）を一括遮断。
```typescript
private static readonly CONFLICT_COPY_RE =
  /\(.*?(?:の競合コピー|のコンフリクトコピー|'s conflicted copy)\s+\d{4}-\d{2}-\d{2}\)/i;
```

### patch B: tombstone自動修復（repairTombstones）
**ファイル:** `src/sync-engine.ts`
**問題:** state.jsonに不正tombstoneが蓄積すると、Dropboxに存在するファイルが永続的にスキップされ続ける。
**修正:** 3段構えで対処：
1. `repairTombstones(dropboxMap)` — fullSync時にdropboxMapと照合し、`dbMtime >= deletedAt` のtombstoneを自動除去
2. `downloadFile()` 成功時にtombstone残留チェック＆削除
3. 既存の `gcTombstones()`（30日TTL）はそのまま維持

---

## セッション1で修正したバグ（patch1〜patch8）の記録は下記の通り

### patch1: fullSync アップロード漏れ
`local.mtime > dbMtime` 条件追加

### patch2: syncingPaths 競合（文字化け）
500ms → 3500ms に延長

### patch3→patch5: downloadFile 再構築
物理ファイル存在確認 → adapter.remove() → vault.createBinary() の順に統一

### patch6〜7: エラーのlog.json記録
uploadFile/downloadFileのcatchにlogger追加

### patch8: tombstone 競合バグ
handleLocalDelete()冒頭にsyncingPathsガード追加

---

## 重要な注意事項

### state.json のリセットについて
大きな同期ロジック変更後は不正tombstoneが蓄積する場合がある。
v0.4.27以降はfullSync時に自動修復されるが、手動リセットが必要な場合：

**削除パス（iPad）:**
```
Dropbox → ObsidianVault-test → .obsidian → plugins → vault-sync-dropbox → state.json
```

### esbuild.config.mjs のコピー先
```javascript
const TEST_VAULT_PLUGIN_DIR =
  "/Users/t/Library/CloudStorage/Dropbox/ObsidianVault-test/.obsidian/plugins/vault-sync-dropbox";
```

---

## 残課題

現時点で主要課題は解消済み。今後の候補：
1. **iPad BRAT配布** — BRATを使ったiPadへのプラグインインストール手順の整備
2. **競合コピーの自動削除** — 現状は除外（無視）のみ。Dropbox側の競合コピーを定期的にDropboxからも削除するか検討
3. **ログUI** — Open WebUI等からlog.jsonを参照できる軽量UIの検討

---

## 次回セッション開始時
```bash
cat ~/obsidian-dropbox-plugin/CONTEXT.md
cd ~/obsidian-dropbox-plugin && git log --oneline -5
```