import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { submissionsApi } from "../../api/submissions";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import { BarChart } from "../../shared/components/charts";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { NeonPanel } from "../../shared/components/NeonPanel";
import { TimelineChart } from "../../shared/components/TimelineChart";
import { ProblemReachPanel, WrongAnswerPanel } from "./AnalysisPanels";
import { formatPrize, prizeColor } from "../../shared/format";
import { downloadCsv, problemStatsToCsv, rankingToCsv, timestampedFilename } from "../../shared/csv";
import { TeamHistoryModal } from "./TeamHistoryModal";

const MEDALS = ["🥇", "🥈", "🥉"];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <NeonPanel sx={{ p: "16px 18px" }}>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary", letterSpacing: 0.5, mb: 0.75 }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 900, color: "#ffe08a" }}>{value}</Typography>
    </NeonPanel>
  );
}

/** 大会ダッシュボード（ランキング・問題別サマリ・チーム詳細ドリルダウン） */
export function AdminDashboardPage() {
  // イベント進行中は参加者の回答が随時入るため、画面を開いている間は自動更新する。
  // 手動リロードしないと順位が止まって見えるのを防ぐのが目的。
  // 10秒間隔なら「ほぼリアルタイム」に見えつつ、DynamoDBの読み取り回数は
  // 1時間あたり360回程度に収まりコストは無視できる（オンデマンド課金）。
  // タブが非表示のときは更新しない（見ていない画面のために課金しない）。
  const { data, isLoading, isError, error, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["admin", "summary"],
    queryFn: () => submissionsApi.summary(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const [selectedTeam, setSelectedTeam] = useState<{ teamId: string; teamName: string } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  // 振り返り用の集計。問題数×チーム数ぶんの配列が返るのでポーリングはしない
  // （イベント中に刻々と変わる情報ではなく、開いたときに見れば足りる）
  const { data: analysisData } = useQuery({
    queryKey: ["admin", "analysis"],
    queryFn: () => submissionsApi.analysis(),
  });

  // 賞金推移。順位表と同じ間隔で追いかける
  const { data: timelineData } = useQuery({
    queryKey: ["admin", "timeline"],
    queryFn: () => submissionsApi.timeline(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const queryClient = useQueryClient();
  const clearMutation = useMutation({
    mutationFn: () => submissionsApi.clearAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "analysis"] });
      setClearOpen(false);
    },
  });

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800, mb: 0.5 }}>大会ダッシュボード</Typography>
        {/* イベント後に結果を残す手段（画面のスクリーンショット以外）。
            表示中のsummaryをそのまま書き出すので、追加のAPI呼び出しは発生しない。 */}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            disabled={!data || data.ranking.length === 0}
            onClick={() =>
              data && downloadCsv(timestampedFilename("nazotoki-ranking"), rankingToCsv(data.ranking))
            }
          >
            ⬇ 順位CSV
          </Button>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            disabled={!data || data.problemStats.length === 0}
            onClick={() =>
              data &&
              downloadCsv(
                timestampedFilename("nazotoki-problem-stats"),
                problemStatsToCsv(data.problemStats),
              )
            }
          >
            ⬇ 問題別CSV
          </Button>
          {/* 消す前にCSVで結果を残せるよう、出力ボタンの隣に置く */}
          <Button
            size="small"
            color="error"
            variant="outlined"
            disabled={!data || data.stats.submissionCount === 0 || clearMutation.isPending}
            onClick={() => setClearOpen(true)}
          >
            🗑 全回答をクリア
          </Button>
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.25, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          チームごとの正誤サマリ・合計賞金・ランキングをリアルタイムに確認できます。
        </Typography>
        {dataUpdatedAt > 0 && (
          <Typography sx={{ fontSize: 11, color: "text.secondary", opacity: 0.8 }}>
            {isFetching
              ? "更新中…"
              : `10秒ごとに自動更新（最終更新 ${new Date(dataUpdatedAt).toLocaleTimeString("ja-JP")}）`}
          </Typography>
        )}
      </Box>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {isError && <ApiErrorAlert error={error} />}

      {data && (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(5, 1fr)" },
              gap: 1.75,
              mb: 2.5,
            }}
          >
            <StatCard
              label="イベント"
              value={data.event.running ? "開催中" : data.event.endedAt ? "終了" : "開始前"}
            />
            <StatCard label="参加チーム数" value={String(data.stats.teamCount)} />
            <StatCard label="総回答数" value={String(data.stats.submissionCount)} />
            <StatCard
              label="有効な問題"
              value={`${data.stats.enabledProblemCount} / ${data.stats.totalProblemCount}`}
            />
            <StatCard label="最高賞金額" value={formatPrize(data.stats.maxPrize).replace("+", "")} />
          </Box>

          {/* 表より先に順位を一目で掴めるようグラフを置く。値は正にも負にもなるので
              ゼロ基準線を持つ横棒（獲得＝ゴールド／マイナス＝レッドの2極）で表す。 */}
          {timelineData && timelineData.series.length > 0 && (
            <>
              <Typography sx={{ fontSize: 14, fontWeight: 800, mb: 1 }}>賞金の推移</Typography>
              <NeonPanel sx={{ mb: 3, p: 2 }}>
                <TimelineChart series={timelineData.series} />
                <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 1.25 }}>
                  縦軸は億円表記。賞金は回答した瞬間に動くため階段状に描いています。グラフに
                  マウスを重ねると、その時点の各チームの賞金を表示します。
                </Typography>
              </NeonPanel>
            </>
          )}

          <Typography sx={{ fontSize: 14, fontWeight: 800, mb: 1 }}>賞金ランキング</Typography>
          <NeonPanel sx={{ mb: 3, p: 2 }}>
            <BarChart
              rows={data.ranking.map((r) => ({
                key: r.teamId,
                label: r.teamName,
                value: r.totalPrize,
              }))}
            />
            <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 1.25 }}>
              数値は億円表記。バーにマウスを重ねると正確な金額を表示します。
            </Typography>
          </NeonPanel>

          <Typography sx={{ fontSize: 14, fontWeight: 800, mb: 1 }}>ランキング（合計賞金順）</Typography>
          <TableContainer component={NeonPanel} sx={{ p: 0, mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>順位</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>チーム</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>正解数</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>不正解数</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>合計賞金</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.ranking.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary" sx={{ textAlign: "center", py: 3 }} component="div">
                        まだ回答記録がありません。
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {data.ranking.map((row, i) => (
                  <TableRow
                    key={row.teamId}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setSelectedTeam({ teamId: row.teamId, teamName: row.teamName })}
                  >
                    <TableCell>
                      <Box sx={{ width: 30, textAlign: "center", fontSize: 18 }}>{MEDALS[i] ?? i + 1}</Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{row.teamName}</TableCell>
                    <TableCell>{row.correctCount}</TableCell>
                    <TableCell>{row.incorrectCount}</TableCell>
                    <TableCell sx={{ color: prizeColor(row.totalPrize), fontWeight: 900, fontSize: 15 }}>
                      {formatPrize(row.totalPrize)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {analysisData && analysisData.problems.length > 0 && (
            <>
              <Typography sx={{ fontSize: 14, fontWeight: 800, mb: 1 }}>問題の到達状況</Typography>
              <ProblemReachPanel data={analysisData} />

              <Typography sx={{ fontSize: 14, fontWeight: 800, mb: 1 }}>誤答と減点</Typography>
              <WrongAnswerPanel data={analysisData} />
            </>
          )}

          <Typography sx={{ fontSize: 14, fontWeight: 800, mb: 1 }}>問題別サマリ</Typography>
          <TableContainer component={NeonPanel} sx={{ p: 0 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>問題</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>状態</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>正解数</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>不正解数</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.problemStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography color="text.secondary" sx={{ textAlign: "center", py: 3 }} component="div">
                        まだ問題が登録されていません。
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {data.problemStats.map((p) => (
                  <TableRow key={p.problemId} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{p.label}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={p.enabled ? "有効" : "無効"}
                        sx={{
                          fontWeight: 700,
                          fontSize: 11,
                          bgcolor: p.enabled ? "rgba(57,255,136,0.15)" : "rgba(182,169,217,0.12)",
                          color: p.enabled ? "success.main" : "text.secondary",
                        }}
                      />
                    </TableCell>
                    <TableCell>{p.correctCount}</TableCell>
                    <TableCell>{p.incorrectCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <ConfirmDialog
        open={clearOpen}
        title="すべての回答記録を削除しますか？"
        description={
          data
            ? `${data.stats.submissionCount}件の回答記録をすべて削除します。\n\n順位と賞金はすべて0に戻り、元に戻すことはできません。\nチームと問題は削除されません。\n\n結果を残す場合は、先に「順位CSV」「問題別CSV」を出力してください。`
            : undefined
        }
        confirmLabel="すべて削除する"
        danger
        loading={clearMutation.isPending}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => clearMutation.mutate()}
      />

      {clearMutation.isError && (
        <Box sx={{ mt: 2 }}>
          <ApiErrorAlert error={clearMutation.error} />
        </Box>
      )}

      <TeamHistoryModal
        open={selectedTeam !== null}
        teamId={selectedTeam?.teamId ?? null}
        teamName={selectedTeam?.teamName ?? null}
        onClose={() => setSelectedTeam(null)}
      />
    </Box>
  );
}
