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
