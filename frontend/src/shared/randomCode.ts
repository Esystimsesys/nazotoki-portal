/** 回答コードの桁数（4桁固定） */
export const CODE_LENGTH = 4;

/** 4桁コードの全パターン数（0000〜9999） */
const CODE_SPACE = 10 ** CODE_LENGTH;

/**
 * 既存のコードと重複しないランダムな4桁コードを生成する。
 *
 * 管理者が問題を登録するたびに毎回コードを考えるのは手間なため、
 * ボタン1つで空いている番号を割り当てられるようにするためのヘルパー。
 *
 * `used` には「同じフォーム内の他パターン」と「既に登録済みの全問題のコード」を
 * 渡す想定。有効・無効を問わず全問題のコードを避けることで、あとから問題を
 * 有効化したときに重複エラー（409）になるのを防ぐ。
 *
 * 空きが無い場合は null を返す（4桁は10,000通りなので現実には起きないが、
 * 無限ループを避けるため必ず有限回で打ち切る）。
 */
export function generateUnusedCode(used: Iterable<string>): string | null {
  const taken = new Set(used);
  if (taken.size >= CODE_SPACE) return null;

  // まずはランダムに試す（空きが多い通常ケースはほぼ1回で決まる）
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
