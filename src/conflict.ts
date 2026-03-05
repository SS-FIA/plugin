/**
 * コンフリクト発生時のファイルパスを生成する。
 * 例: "notes/memo.md" → "notes/memo (conflict 2025-01-15T10-30-00).md"
 */
export function makeConflictPath(vaultPath: string): string {
  const dot = vaultPath.lastIndexOf(".");
  const base = dot >= 0 ? vaultPath.slice(0, dot) : vaultPath;
  const ext  = dot >= 0 ? vaultPath.slice(dot)   : "";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${base} (conflict ${ts})${ext}`;
}
