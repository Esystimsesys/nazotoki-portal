import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { submissionsApi } from "../../api/submissions";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import { NeonPanel } from "../../shared/components/NeonPanel";
import { formatPrize, prizeColor } from "../../shared/format";
import { neon } from "../../app/theme";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * チームへのプロジェクター投影・画面共有を想定した大画面表示。
 * 管理操作は一切持たず、途中経過の閲覧に振り切っている（操作ボタンが映り込むと事故のもとになるため）。
 * Fullscreen APIはこのBox（ref先）だけを対象にするので、AdminShellのヘッダー/タブは
 * 兄弟要素として全画面表示の外に残り、共有時に映り込まない。
 */
export function AdminScreenPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { data, isLoading, isError, error, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["admin", "summary"],
    queryFn: () => submissionsApi.summary(),
    // 投影中は手元で気付かれないまま古い順位が映り続けるのを避けたいので、
    // 管理ダッシュボード（10秒）より短い間隔で追いかける。
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  };

  const ranking = data?.ranking ?? [];

  // 未開始と終了後はどちらも running=false だが、会場に見せる意味がまったく違うので分ける
  const eventTone = data?.event.running
    ? { label: "開催中", color: neon.success, bg: "rgba(57,255,136,0.12)", border: "rgba(57,255,136,0.45)" }
    : data?.event.endedAt
      ? { label: "終了", color: neon.inkDim, bg: "rgba(182,169,217,0.10)", border: "rgba(182,169,217,0.35)" }
      : { label: "開始前", color: neon.gold, bg: "rgba(244,197,66,0.12)", border: "rgba(244,197,66,0.45)" };

  return (
    <Box
      ref={containerRef}
      className={isFullscreen ? "starfield" : undefined}
      sx={{
        position: "relative",
        bgcolor: isFullscreen ? neon.bgDeep : "transparent",
        minHeight: isFullscreen ? "100vh" : undefined,
        overflow: isFullscreen ? "auto" : undefined,
        p: isFullscreen ? { xs: 3, sm: 6 } : 0,
      }}
    >
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          mb: isFullscreen ? 4 : 2.25,
        }}
      >
        <Box>
          <Typography
            className="brand-font"
            sx={{
              fontSize: isFullscreen ? { xs: 30, sm: 44 } : 16,
              fontWeight: 900,
              background: `linear-gradient(135deg, ${neon.goldSoft}, ${neon.gold} 40%, ${neon.magenta} 90%)`,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            🏆 途中経過
          </Typography>
          {dataUpdatedAt > 0 && (
            <Typography sx={{ fontSize: isFullscreen ? 13 : 11, color: "text.secondary", mt: 0.5 }}>
              {isFetching ? "更新中…" : `自動更新中（最終更新 ${new Date(dataUpdatedAt).toLocaleTimeString("ja-JP")}）`}
            </Typography>
          )}
        </Box>
        {/* イベントの開始/終了は投影中の参加者がいちばん知りたい情報なので、
            順位より先に目に入る位置に大きく出す。操作はここではできない（見せる専用の画面のため）。 */}
        {data && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: isFullscreen ? 3 : 2,
              py: isFullscreen ? 1.5 : 1,
              borderRadius: 999,
              border: `1px solid ${eventTone.border}`,
              background: eventTone.bg,
            }}
          >
            <Box
              sx={{
                width: isFullscreen ? 14 : 10,
                height: isFullscreen ? 14 : 10,
                borderRadius: "50%",
                background: eventTone.color,
                boxShadow: data.event.running ? `0 0 12px ${eventTone.color}` : "none",
              }}
            />
            <Typography sx={{ fontSize: isFullscreen ? 24 : 14, fontWeight: 900, color: eventTone.color }}>
              {eventTone.label}
            </Typography>
          </Box>
        )}
        <Button size={isFullscreen ? "medium" : "small"} variant="outlined" color="inherit" onClick={toggleFullscreen}>
          {isFullscreen ? "全画面を終了" : "⛶ 全画面表示"}
        </Button>
      </Box>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6, position: "relative", zIndex: 1 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {isError && (
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <ApiErrorAlert error={error} />
        </Box>
      )}

      {data && (
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Typography sx={{ fontSize: isFullscreen ? 22 : 14, fontWeight: 800, mb: isFullscreen ? 1.5 : 1 }}>
            賞金ランキング
          </Typography>
          <NeonPanel sx={{ p: isFullscreen ? 1.5 : 1, mb: isFullscreen ? 4 : 3 }}>
            {ranking.length === 0 && (
              <Typography color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
                まだ回答記録がありません。
              </Typography>
            )}
            {ranking.map((row, i) => (
              <Box
                key={row.teamId}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: isFullscreen ? 2.5 : 1.5,
                  px: isFullscreen ? 2.5 : 1.5,
                  py: isFullscreen ? 1.75 : 1,
                  borderRadius: 2,
                  mb: 0.5,
                  bgcolor: i < 3 ? "rgba(244,197,66,0.08)" : "transparent",
                  border: i < 3 ? `1px solid ${neon.borderGlow}` : "1px solid transparent",
                }}
              >
                <Box sx={{ width: isFullscreen ? 48 : 30, textAlign: "center", fontSize: isFullscreen ? 30 : 18, flex: "0 0 auto" }}>
                  {MEDALS[i] ?? i + 1}
                </Box>
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: isFullscreen ? 26 : 15,
                    fontWeight: i < 3 ? 900 : 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.teamName}
                </Typography>
                <Typography
                  sx={{
                    flex: "0 0 auto",
                    minWidth: isFullscreen ? 140 : 90,
                    textAlign: "right",
                    color: prizeColor(row.totalPrize),
                    fontWeight: 900,
                    fontSize: isFullscreen ? 26 : 15,
                  }}
                >
                  {formatPrize(row.totalPrize)}
                </Typography>
              </Box>
            ))}
          </NeonPanel>

        </Box>
      )}
    </Box>
  );
}
