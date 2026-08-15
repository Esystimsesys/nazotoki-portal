/** 回答コードの桁数（4桁固定） */
export const CODE_LENGTH = 4;

/** 4桁コードの全パターン数（0000〜9999） */
const CODE_SPACE = 10 ** CODE_LENGTH;

/**
 * CSV取込でコード列を自動採番扱いにするキーワード（小文字で比較）。
 * 空欄も自動採番として扱う。
 */
export const AUTO_CODE_KEYWORDS = new Set(["auto", "ランダム", "random"]);

/**
 * 既存のコードと重複しないランダムな4桁コードを生成する。
 * 空きが無い場合は null を返す（必ず有限回で打ち切り、無限ループしない）。
 */
export function generateUnusedCode(used: Iterable<string>): string | null {
  const taken = used instanceof Set ? used : new Set(used);
  if (taken.size >= CODE_SPACE) return null;

  // 空きが多い通常ケースはランダムで一発で決まる
  for (let i = 0; i < 50; i++) {
    const candidate = String(Math.floor(Math.random() * CODE_SPACE)).padStart(CODE_LENGTH, "0");
    if (!taken.has(candidate)) return candidate;
  }

  // 埋まってきた場合はランダムな開始位置から順に走査して確実に空きを見つける
  const start = Math.floor(Math.random() * CODE_SPACE);
  for (let offset = 0; offset < CODE_SPACE; offset++) {
    const candidate = String((start + offset) % CODE_SPACE).padStart(CODE_LENGTH, "0");
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}
