import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { AnalysisResponse } from "../../api/types";
import { CHART_COLORS, Legend, formatOku, formatYen } from "../../shared/components/charts";
import { NeonPanel } from "../../shared/components/NeonPanel";

/**
 * 問題の到達状況。
 *
 * 分布サマリ（何チームが解いたか別の問題数）と、チーム×問題の格子をひとつにまとめる。
 * 分けて2つのグラフにすると同じ数字を2度見せることになるため
 * （格子の列を数えれば分布になる）、要約と明細の関係で並べている。
 *
 * 見たいのは「用意した問題のうちどれだけが実際に解かれたか」で、
 * 次回の問題数と制限時間を決める材料になる。
 */
export function ProblemReachPanel({ data }: { data: AnalysisResponse }) {
  const { teams, problems } = data;
  const solvedCount = (n: number) => problems.filter((p) => p.solvedTeamIds.length === n).length;
  const untouched = solvedCount(0);
  const reached = problems.length - untouched;

  // 何チームが解いたか別の問題数。0（未正解）は別扱いで強調する
  const buckets = Array.from({ length: teams.length }, (_, i) => teams.length - i)
    .map((n) => ({ n, count: solvedCount(n) }))
    .filter((b) => b.count > 0);

  return (
    <NeonPanel sx={{ mb: 3, p: 2 }}>
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>解かれた問題</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 900, color: "#ffe08a" }}>
            {reached} <Box component="span" sx={{ fontSize: 13, fontWeight: 700 }}>/ {problems.length}</Box>
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>誰も解けなかった</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 900, color: CHART_COLORS.loss }}>{untouched}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", flexWrap: "wrap" }}>
          {buckets.map((b) => (
            <Box key={b.n}>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{b.n}チームが正解</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{b.count}問</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* チーム×問題の格子。1行が1チーム、1列が1問。 */}
      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: problems.length * 14 + 96 }}>
          {teams.map((team) => (
            <Box key={team.teamId} sx={{ display: "flex", alignItems: "center", gap: 1, mb: "3px" }}>
              <Typography
                sx={{
                  width: 88,
                  flex: "0 0 auto",
                  fontSize: 11,
                  color: "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={team.teamName}
              >
                {team.teamName}
              </Typography>
              <Box sx={{ display: "flex", gap: "2px" }}>
                {problems.map((p) => {
                  const solved = p.solvedTeamIds.includes(team.teamId);
                  const wrong = p.wrongTeamIds.includes(team.teamId);
                  // 同じ問題で正解しつつ誤答もすることがある（4択で他の選択肢も入力した場合）。
                  // 正解に丸めてしまうと「正解したのに賞金が減った」実態が消えるため、
                  // 塗り＝正解／内側の縁取り＝誤答あり、と2つの意味を重ねて表す。
                  const state = solved && wrong ? "solvedWithWrong" : solved ? "solved" : wrong ? "wrong" : "none";
                  const tip = `${p.label} — ${
                    state === "solvedWithWrong"
                      ? "正解（誤答もあり）"
                      : state === "solved"
                        ? "正解"
                        : state === "wrong"
                          ? "誤答"
                          : "未回答"
                  }`;
                  return (
                    <Tooltip key={p.problemId} title={tip} placement="top" arrow>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "2px",
                          flex: "0 0 auto",
                          background:
                            state === "wrong"
                              ? CHART_COLORS.loss
                              : state === "none"
                                ? CHART_COLORS.empty
                                : CHART_COLORS.gain,
                          boxShadow:
                            state === "solvedWithWrong"
                              ? `inset 0 0 0 2px ${CHART_COLORS.loss}`
                              : "none",
                          border: state === "none" ? "1px solid rgba(255,255,255,0.10)" : "none",
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Legend
        items={[
          { color: CHART_COLORS.gain, label: "正解" },
          { color: CHART_COLORS.gain, ring: CHART_COLORS.loss, label: "正解（誤答もあり）" },
          { color: CHART_COLORS.loss, label: "誤答" },
          { color: CHART_COLORS.empty, label: "未回答", outlined: true },
        ]}
      />
      <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 1 }}>
        1行が1チーム、1マスが1問（問題番号順）。マスにマウスを重ねると問題名が出ます。
      </Typography>
    </NeonPanel>
  );
}

/**
 * 誤答の状況を**問題単位**でまとめる。
 *
 * 4択問題なら3つが不正解の選択肢という作りになるため、パターン1件ずつ並べても
 * 同じ問題の選択肢が複数行に散るだけで読み取れることが増えない。知りたいのは
 * 「どの問題で誤答が出たか」なので、問題ごとに集約する。
 *
 * 不正解の選択肢を持つ問題はすべて出す（誤答0回も含む）。用意したのに誰も
 * 間違えなかったことが分かるのが目的で、出たものだけ並べると判断を誤る。
 *
 * 並びは問題番号順（サーバー側でそろえている）。単一系列なので凡例は持たず、
 * 値を各行に直接ラベルする。
 */
export function WrongAnswerPanel({ data }: { data: AnalysisResponse }) {
  const { wrongAnswerProblems } = data;
  const withWrong = wrongAnswerProblems.filter((p) => p.wrongAnswerCount > 0);
  const max = Math.max(1, ...wrongAnswerProblems.map((p) => p.wrongAnswerCount));
  const totalWrong = wrongAnswerProblems.reduce((n, p) => n + p.wrongAnswerCount, 0);
  const totalPenalty = wrongAnswerProblems.reduce((n, p) => n + p.totalPenalty, 0);

  return (
    <NeonPanel sx={{ mb: 3, p: 2 }}>
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>誤答が出た問題</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 900, color: CHART_COLORS.loss }}>
            {withWrong.length}{" "}
            <Box component="span" sx={{ fontSize: 13, fontWeight: 700 }}>
              / {wrongAnswerProblems.length}
            </Box>
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>誤答の回数</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 900 }}>{totalWrong}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>減点の合計</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 900, color: CHART_COLORS.loss }}>
            {formatOku(totalPenalty)}
          </Typography>
        </Box>
      </Box>

      {wrongAnswerProblems.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: "text.secondary", py: 2, textAlign: "center" }}>
          不正解の選択肢が登録されている問題はありません。
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {wrongAnswerProblems.map((p) => (
            <Box key={p.problemId} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                sx={{
                  width: { xs: 132, sm: 210 },
                  flex: "0 0 auto",
                  fontSize: 11.5,
                  color: p.wrongAnswerCount > 0 ? "text.primary" : "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={p.label}
              >
                {p.label}
              </Typography>
              <Typography
                sx={{ width: 62, flex: "0 0 auto", fontSize: 10.5, color: "text.secondary" }}
              >
                選択肢{p.wrongChoiceCount}個
              </Typography>
              <Tooltip
                title={`${p.label} — 誤答${p.wrongAnswerCount}回 / ${p.teamCount}チーム / ${formatYen(p.totalPenalty)}`}
                placement="top"
                arrow
              >
                <Box sx={{ position: "relative", flex: 1, height: 16, minWidth: 0 }}>
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      width: `${(p.wrongAnswerCount / max) * 100}%`,
                      background: CHART_COLORS.loss,
                      borderRadius: "0 4px 4px 0",
                    }}
                  />
                </Box>
              </Tooltip>
              <Typography
                sx={{
                  width: 74,
                  flex: "0 0 auto",
                  textAlign: "right",
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: p.wrongAnswerCount > 0 ? "text.secondary" : "rgba(182,169,217,0.45)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {p.wrongAnswerCount}回 / {p.teamCount}チーム
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 1.25 }}>
        問題番号順。不正解の選択肢を持つ問題をすべて表示しています（0回＝誰も間違えなかった）。
        「選択肢N個」は登録されている不正解の数です。バーにマウスを重ねると減点の合計を表示します。
      </Typography>
    </NeonPanel>
  );
}
