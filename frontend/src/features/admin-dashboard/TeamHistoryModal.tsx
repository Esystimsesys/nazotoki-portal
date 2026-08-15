import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { submissionsApi } from "../../api/submissions";
import type { TeamSubmissionsPerProblem } from "../../api/types";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import {
  CHART_COLORS,
  Legend,
  ProblemGrid,
  formatYen,
  type ProblemCellState,
} from "../../shared/components/charts";
import { formatTime } from "../../shared/format";

interface TeamHistoryModalProps {
  open: boolean;
  teamId: string | null;
  teamName: string | null;
  onClose: () => void;
}

/** 問題ラベル「12. 若返りの薬」から先頭の番号だけを取り出す（マス目に表示する短縮名） */
function shortNo(label: string): string {
  const m = label.match(/^\s*(\d+)/);
  return m ? m[1] : label.slice(0, 3);
}

function cellState(p: TeamSubmissionsPerProblem): ProblemCellState["state"] {
  if (p.solved) return "solved";
  if (p.hits.length > 0) return "penalty";
  return "none";
}

function cellTooltip(p: TeamSubmissionsPerProblem): string {
  if (p.hits.length === 0) return `${p.label}\n未回答`;
  const lines = p.hits.map(
    (h) => `${h.code} ${h.isCorrect ? "正解" : "不正解"} ${formatYen(h.prizeAwarded)}`,
  );
  return `${p.label}\n${lines.join("\n")}\n計 ${formatYen(p.earnedPrize)}`;
}

/** 獲得と減点の内訳を1本の積み上げバーで示す */
function GainLossBar({ gained, lost }: { gained: number; lost: number }) {
  const total = gained + Math.abs(lost);
  const gainPct = total === 0 ? 0 : (gained / total) * 100;
  const lossPct = total === 0 ? 0 : (Math.abs(lost) / total) * 100;
  return (
    <Box>
      <Box sx={{ display: "flex", height: 16, borderRadius: "4px", overflow: "hidden", gap: "2px" }}>
        {gainPct > 0 && <Box sx={{ width: `${gainPct}%`, background: CHART_COLORS.gain }} />}
        {lossPct > 0 && <Box sx={{ width: `${lossPct}%`, background: CHART_COLORS.loss }} />}
        {total === 0 && <Box sx={{ width: "100%", background: CHART_COLORS.empty }} />}
      </Box>
      <Legend
        items={[
          { color: CHART_COLORS.gain, label: `獲得 ${formatYen(gained)}` },
          { color: CHART_COLORS.loss, label: `減点 ${formatYen(lost)}` },
        ]}
      />
    </Box>
  );
}

/** チーム詳細ドリルダウン（到達状況の可視化＋問題別の内訳＋回答ログ） */
export function TeamHistoryModal({ open, teamId, teamName, onClose }: TeamHistoryModalProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "team-submissions", teamId],
    queryFn: () => submissionsApi.teamSubmissions(teamId as string),
    enabled: open && teamId !== null,
  });

  // 実際に何かしら回答した問題だけを内訳として並べる（未回答はマス目側で見える）
  const touched = (data?.perProblem ?? []).filter((p) => p.hits.length > 0);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}
      >
        {teamName ?? data?.team.teamName} - 詳細
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={26} />
          </Box>
        )}
        {isError && <ApiErrorAlert error={error} />}

        {data && (
          <>
            {/* --- サマリー数値 --- */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
                gap: 1,
              }}
            >
              {[
                { label: "正解した問題", value: `${data.totals.solvedCount} / ${data.totals.problemCount}` },
                { label: "マイナスを踏んだ回数", value: `${data.totals.penaltyCount} 回` },
                { label: "獲得", value: formatYen(data.totals.gainedPrize) },
                { label: "合計", value: formatYen(data.totals.totalPrize) },
              ].map((s) => (
                <Box
                  key={s.label}
                  sx={{
                    p: 1.25,
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <Typography sx={{ fontSize: 10.5, color: "text.secondary", mb: 0.25 }}>{s.label}</Typography>
                  <Typography sx={{ fontSize: 15, fontWeight: 800 }}>{s.value}</Typography>
                </Box>
              ))}
            </Box>

            <Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.75, letterSpacing: 0.5 }}>
                賞金の内訳
              </Typography>
              <GainLossBar gained={data.totals.gainedPrize} lost={data.totals.lostPrize} />
            </Box>

            {/* --- 問題別の到達状況（マス目） --- */}
            <Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.75, letterSpacing: 0.5 }}>
                問題別の到達状況（数字は問題番号 / マウスを重ねると詳細）
              </Typography>
              <ProblemGrid
                cells={data.perProblem.map((p) => ({
                  key: p.problemId,
                  label: shortNo(p.label),
                  state: cellState(p),
                  tooltip: cellTooltip(p),
                }))}
              />
            </Box>

            {/* --- 回答した問題の内訳 --- */}
            <Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.75, letterSpacing: 0.5 }}>
                回答した問題の内訳（{touched.length} 問）
              </Typography>
              {touched.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  まだ登録済みコードへの回答がありません。
                </Typography>
              )}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {touched.map((p) => (
                  <Box
                    key={p.problemId}
                    sx={{
                      p: 1.25,
                      borderRadius: "10px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.75 }}
                    >
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{p.label}</Typography>
                      <Chip
                        size="small"
                        label={p.solved ? "正解" : "未正解"}
                        sx={{
                          height: 20,
                          fontSize: 10.5,
                          fontWeight: 700,
                          bgcolor: p.solved ? "rgba(181,138,24,0.25)" : "rgba(214,57,90,0.2)",
                          color: p.solved ? "#ffe08a" : "#ff8fa5",
                        }}
                      />
                      <Typography
                        sx={{
                          ml: "auto",
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: p.earnedPrize >= 0 ? "#ffe08a" : "#ff8fa5",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatYen(p.earnedPrize)}
                      </Typography>
                    </Box>
                    {/* 踏んだパターンを1行ずつ。マイナス賞金に当たったかがここで分かる */}
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.375 }}>
                      {p.hits.map((h, i) => (
                        <Box
                          key={`${h.code}-${i}`}
                          sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 11.5 }}
                        >
                          <Typography sx={{ fontSize: 11, color: "text.secondary", width: 46 }}>
                            {formatTime(h.submittedAt)}
                          </Typography>
                          <Typography
                            sx={{
                              fontFamily: "monospace",
                              fontSize: 12,
                              letterSpacing: 1,
                              fontWeight: 700,
                              color: "#cdb8ff",
                            }}
                          >
                            {h.code}
                          </Typography>
                          <Typography
                            sx={{ fontSize: 11, color: h.isCorrect ? "#ffe08a" : "#ff8fa5", fontWeight: 700 }}
                          >
                            {h.isCorrect ? "正解" : "不正解"}
                          </Typography>
                          {h.note && (
                            <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{h.note}</Typography>
                          )}
                          <Typography
                            sx={{
                              ml: "auto",
                              fontSize: 11.5,
                              fontWeight: 700,
                              color: "text.secondary",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatYen(h.prizeAwarded)}
                            {h.prizeAwarded === 0 && h.prize !== 0 && (
                              <Typography component="span" sx={{ fontSize: 10, ml: 0.5 }}>
                                (再回答・加算なし)
                              </Typography>
                            )}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
