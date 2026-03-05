import { Vault } from "obsidian";

const STATE_PATH = ".obsidian/plugins/vault-sync-dropbox/state.json";

export interface FileSyncState {
  path: string;
  contentHash: string;
  lastSyncedAt: number;
}

export interface SyncState {
  files: { [dropboxId: string]: FileSyncState };
  tombstones: Record<string, number>; // vaultPath → 削除時刻(ms)
}

export const DEFAULT_SYNC_STATE: SyncState = {
  files: {},
  tombstones: {},
};

// 旧フォーマット判定
// 旧: { "note.md": { dropboxId, contentHash, lastSyncedAt } }  ← 値にpathがない
// 新: { files: {...}, tombstones: {...} }
function migrate(raw: any): SyncState {
  // 新フォーマット
  if (raw && typeof raw.files === "object") {
    return {
      files: raw.files ?? {},
      tombstones: raw.tombstones ?? {},
    };
  }

  // 旧フォーマット（Day7以前: pathキーのフラットマップ）
  const files: SyncState["files"] = {};
  for (const [path, v] of Object.entries(raw ?? {}) as [string, any][]) {
    const id: string | undefined = v?.dropboxId;
    if (!id) continue; // idがなければ復元不可 → 次回fullSyncで再取得
    files[id] = {
      path,
      contentHash: v.contentHash ?? "",
      lastSyncedAt: v.lastSyncedAt ?? 0,
    };
  }
  return { files, tombstones: {} };
  // tombstonesはsettings.jsonからの移植はloadSyncState呼び出し側で行う
}

export async function loadSyncState(
  vault: Vault,
  legacyTombstones?: Record<string, number> // settings.jsonから渡す
): Promise<SyncState> {
  try {
    const text = await vault.adapter.read(STATE_PATH);
    const state = migrate(JSON.parse(text));
    // settings.jsonのlocalTombstonesが残っていれば一度だけマージ
    if (legacyTombstones && Object.keys(legacyTombstones).length > 0) {
      state.tombstones = { ...legacyTombstones, ...state.tombstones };
    }
    return state;
  } catch {
    // ファイル未存在 → 初回起動
    return {
      files: {},
      tombstones: legacyTombstones ?? {},
    };
  }
}

export async function saveSyncState(
  vault: Vault,
  state: SyncState
): Promise<void> {
  await vault.adapter.write(STATE_PATH, JSON.stringify(state, null, 2));
}

// 逆引きユーティリティ
export function findByPath(
  state: SyncState,
  vaultPath: string
): [string, FileSyncState] | null {
  for (const [id, entry] of Object.entries(state.files)) {
    if (entry.path === vaultPath) return [id, entry];
  }
  return null;
}