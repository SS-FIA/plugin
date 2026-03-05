// Dropbox content_hash 計算ユーティリティ
//
// 仕様: https://www.dropbox.com/developers/reference/content-hash
// アルゴリズム:
//   1. ファイルを4MBチャンクに分割
//   2. 各チャンクをSHA-256でハッシュ
//   3. 全チャンクハッシュを連結したバイト列をSHA-256でハッシュ
//   4. 結果を小文字16進数文字列で返す

const BLOCK_SIZE = 4 * 1024 * 1024; // 4MB

export async function computeContentHash(data: ArrayBuffer): Promise<string> {
  const blockHashes: Uint8Array[] = [];

  let offset = 0;
  while (offset < data.byteLength) {
    const end = Math.min(offset + BLOCK_SIZE, data.byteLength);
    const chunk = data.slice(offset, end);
    const hashBuf = await crypto.subtle.digest("SHA-256", chunk);
    blockHashes.push(new Uint8Array(hashBuf));
    offset = end;
  }

  // 空ファイルの場合: 空バイト列のSHA-256
  const combined = new Uint8Array(blockHashes.length * 32);
  blockHashes.forEach((h, i) => combined.set(h, i * 32));

  const finalBuf = await crypto.subtle.digest("SHA-256", combined);
  return toHex(new Uint8Array(finalBuf));
}

function toHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
