/** 既存の "(conflict ...)" を除去してベース名に戻す（連鎖でパスが長くなり ENAMETOOLONG になるのを防ぐ） */
const CONFLICT_SUFFIX = /\s*\(conflict\s+[^)]+\)/g;

/**
 * コンフリクト発生時のファイルパスを生成する。
 * 既に "(conflict ...)" が付いたパスが渡っても、一度剥がして1つだけ付与する。
 * 例: "notes/memo.md" → "notes/memo (conflict 2025-01-15T10-30-00).md"
 */
export function makeConflictPath(vaultPath: string): string {
  const dot = vaultPath.lastIndexOf(".");
  const baseWithConflicts = dot >= 0 ? vaultPath.slice(0, dot) : vaultPath;
  const ext = dot >= 0 ? vaultPath.slice(dot) : "";
  const base = baseWithConflicts.replace(CONFLICT_SUFFIX, "").trimEnd();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${base} (conflict ${ts})${ext}`;
}
