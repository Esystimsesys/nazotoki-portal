/** 日本語名と末尾の数字を自然順で比較する（例: チーム2 → チーム10）。 */
export function compareTeamNames(
  a: { teamId: string; teamName: string },
  b: { teamId: string; teamName: string },
): number {
  const byName = a.teamName.localeCompare(b.teamName, "ja", {
    numeric: true,
    sensitivity: "base",
  });
  return byName !== 0 ? byName : a.teamId.localeCompare(b.teamId);
}

/**
 * 合計賞金順の配列へ競技順位を付ける。同点の次は人数分だけ順位を飛ばす
 * （100, 100, 50 なら 1位, 1位, 3位）。
 */
export function withPrizeRanks<T extends { totalPrize: number }>(
  ranking: T[],
): { row: T; rank: number }[] {
  let previousPrize: number | undefined;
  let previousRank = 0;
  return ranking.map((row, index) => {
    const rank = previousPrize === row.totalPrize ? previousRank : index + 1;
    previousPrize = row.totalPrize;
    previousRank = rank;
    return { row, rank };
  });
}
