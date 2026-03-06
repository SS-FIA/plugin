# vault-sync-dropbox CONTEXT
## 作成日: 2026-03-07（セッション終了時点）

---

## 現在の状態

**バージョン: 0.4.25**
**双方向同期: 完全動作確認済み**

| 機能 | 状態 |
|------|------|
| Mac→iPad 新規ファイル | ✅ 動作確認済み |
| iPad→Mac 新規ファイル | ✅ 動作確認済み |
| 双方向ファイル編集同期 | ✅ 動作確認済み |
| 双方向ファイル削除同期 | ✅ 動作確認済み |
| 文字化け | ✅ 解消済み |

---

## 今回セッションで修正したバグ（patch1〜patch8）

### patch1: fullSync アップロード漏れ（同期不安定の主因）
**ファイル:** `src/sync-engine.ts`
**問題:** `fullSync()`のローカル→Dropboxループが「Dropboxに存在しない場合のみ」アップロードしており、「ローカルが新しい場合」を無視していた
**修正:** `local.mtime > dbMtime` の条件を追加

### patch2: syncingPaths 競合（文字化けの関与）
**ファイル:** `src/sync-engine.ts`
**問題:** ダウンロード完了後のsyncingPathsガード解除が500msで早すぎ、debounce(3000ms)経由のアップロードと競合
**修正:** `500ms` → `UPLOAD_DEBOUNCE_MS + 500ms`（3500ms）に延長

### patch3→patch5: downloadFile の再構築
**ファイル:** `src/sync-engine.ts`
**問題:** Dropboxアプリが先にファイルをディスクに配置した場合、`vault.createBinary()`が"already exists"例外→`adapter.writeBinary()`フォールバック→ObsidianのUIインデックスが更新されない
**修正:** 物理ファイルの存在を確認→存在すれば`adapter.remove()`で削除→`vault.createBinary()`で正規登録

### patch6〜7: エラーのlog.json記録
**ファイル:** `src/sync-engine.ts`
**修正:** `uploadFile`と`downloadFile`のcatchブロックに`this.logger.log()`を追加（今まで`console.error`のみで握り潰されていた）

### patch8: tombstone 競合バグ（Mac→iPad新規ファイル不反映の主因）
**ファイル:** `src/sync-engine.ts`
**問題:** `downloadFile`内で`adapter.remove()`→Vaultの`delete`イベント発火→`handleLocalDelete()`がtombstone記録→以降の同期でそのファイルがスキップされ続ける
**修正:** `handleLocalDelete()`の冒頭に`syncingPaths`ガードを追加

```typescript
if (this.syncingPaths.has(vaultPath)) return; // ダウンロード中の削除イベントは無視
```

---

## 重要な注意事項

### state.json のリセットについて
今回の修正適用後、iPadのstate.jsonに不正なtombstoneが蓄積していたため手動削除が必要だった。
今後、大きな同期ロジック変更後は同様のリセットが必要になる場合がある。

**削除パス（iPad）:**
```
Dropbox → ObsidianVault-test → .obsidian → plugins → vault-sync-dropbox → state.json
```

### esbuild.config.mjs のコピー先
```javascript
const TEST_VAULT_PLUGIN_DIR =
  "/Users/t/Library/CloudStorage/Dropbox/ObsidianVault-test/.obsidian/plugins/vault-sync-dropbox";
```
（以前は `60_TOOLS/plugin-test/` という誤ったパスだった。修正済み）

---

## 残課題

1. **Dropboxアプリ生成の競合コピー** — `p test (KのMac mini の競合コピー 2026-03-07).md` などDropboxアプリ自身が生成するコピーがVaultを汚染している。excludedFoldersでは防げない。ファイル名パターンで除外するロジックの検討が必要
2. **state.json の自動修復** — 不正tombstoneを自動検出・削除する仕組みがあると運用が安定する

---

## 次回セッション開始時

```bash
cat ~/obsidian-dropbox-plugin/CONTEXT.md
cd ~/obsidian-dropbox-plugin && git log --oneline -5
```
