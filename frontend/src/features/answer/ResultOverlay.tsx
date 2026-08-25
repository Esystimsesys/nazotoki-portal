import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { formatPrize } from "../../shared/format";

const CONFETTI_COLORS = ["#f4c542", "#ff2e9a", "#a855f7", "#39ff88", "#ffe08a"];
const AUTO_CLOSE_MS = 2200;
/** 減額を表示するときは金額を読む時間が要るので長めにする */
const PENALTY_CLOSE_MS = 3800;

interface ConfettiPiece {
  id: number;
  left: number;
  color: string;
  duration: number;
  rotate: number;
}

function buildConfetti(): ConfettiPiece[] {
  return Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    duration: 1.6 + Math.random() * 1.4,
    rotate: Math.random() * 360,
  }));
}

interface ResultOverlayProps {
  open: boolean;
  isCorrect: boolean;
  /** 同じ4桁を自チームが過去に送信済みか */
  alreadyAnswered: boolean;
  /** 実際に減額された額（負の数）。減額が無ければ null */
  penalty?: number | null;
  onClose: () => void;
}

/** 正解/不正解の演出オーバーレイ */
export function ResultOverlay({ open, isCorrect, alreadyAnswered, penalty, onClose }: ResultOverlayProps) {
  // 賞金額は参加者に見せない方針だが、減額だけは例外。いくら減ったか分からないと
  // トラップという仕掛けが機能せず、ただ理不尽なだけになるため。
  const hasPenalty = typeof penalty === "number" && penalty < 0;
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (!open) return;
    // 既に送信済みの番号を打ち直したときは新たな達成ではないため紙吹雪は出さない。
    // 「初めて正解したとき」と視覚的に区別することで、回答済みだと気づきやすくする。
    if (isCorrect && !alreadyAnswered) setConfetti(buildConfetti());
    else setConfetti([]);

    // 金額を読む時間が要るため、減額が出るときだけ表示時間を延ばす
    const timer = window.setTimeout(onClose, hasPenalty ? PENALTY_CLOSE_MS : AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCorrect, alreadyAnswered, hasPenalty]);

  const cardColors = useMemo(
    () =>
      isCorrect
        ? { bg: "linear-gradient(160deg, #1c3a2c, #10241c)", border: "rgba(57,255,136,0.5)", glow: "rgba(57,255,136,0.25)" }
        : { bg: "linear-gradient(160deg, #3a1c26, #241017)", border: "rgba(255,75,110,0.5)", glow: "rgba(255,75,110,0.2)" },
    [isCorrect],
  );

  if (!open) return null;

  return (
    <Box
      onClick={onClose}
      className={isCorrect ? "nazotoki-flash-correct" : "nazotoki-flash-wrong"}
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,3,14,0.6)",
        backdropFilter: "blur(3px)",
      }}
    >
      {confetti.map((p) => (
        <Box
          key={p.id}
          className="nazotoki-confetti-piece"
          sx={{
            left: `${p.left}vw`,
            background: p.color,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          textAlign: "center",
          p: "40px 32px",
          borderRadius: "24px",
          maxWidth: 320,
          mx: 2,
          background: cardColors.bg,
          border: `1.5px solid ${cardColors.border}`,
          boxShadow: `0 0 60px ${cardColors.glow}`,
        }}
      >
        <Typography sx={{ fontSize: 54, mb: 0.5 }}>
          {alreadyAnswered ? "🔁" : isCorrect ? "🎉" : "💥"}
        </Typography>
        <Typography
          className="brand-font"
          sx={{
            fontSize: 26,
            fontWeight: 900,
            margin: "6px 0 2px",
            color: isCorrect ? "#39ff88" : "#ff4b6e",
            textShadow: isCorrect ? "0 0 20px rgba(57,255,136,0.5)" : "0 0 20px rgba(255,75,110,0.4)",
          }}
        >
          {isCorrect ? "正解！" : "不正解…"}
        </Typography>

        {hasPenalty && (
          <Box
            sx={{
              mt: 1.5,
              mb: 0.5,
              px: 1.5,
              py: 1.25,
              borderRadius: "12px",
              background: "rgba(255,75,110,0.12)",
              border: "1px solid rgba(255,75,110,0.45)",
            }}
          >
            <Typography sx={{ fontSize: 11, color: "text.secondary", letterSpacing: 0.5, mb: 0.25 }}>
              賞金が減りました
            </Typography>
            <Typography
              className="mono"
              sx={{
                // 億単位の桁数でも1行に収まる大きさにする（折り返すと符号だけが
                // 前の行に残って読みにくくなるため nowrap で必ず1行に）
                fontSize: 19,
                fontWeight: 900,
                whiteSpace: "nowrap",
                color: "#ff4b6e",
                textShadow: "0 0 16px rgba(255,75,110,0.45)",
                lineHeight: 1.25,
              }}
            >
              {formatPrize(penalty as number)}
            </Typography>
          </Box>
        )}

        {alreadyAnswered && (
          <Box
            sx={{
              display: "inline-block",
              mt: 1,
              mb: 0.5,
              px: 1.5,
              py: 0.5,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              color: "#ffe08a",
              background: "rgba(244,197,66,0.14)",
              border: "1px solid rgba(244,197,66,0.4)",
            }}
          >
            この番号は回答済みです
          </Box>
        )}

        <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 3, mt: alreadyAnswered ? 1 : 0 }}>
          {alreadyAnswered
            ? "すでに送信した番号です。別の謎に挑戦しよう"
            : isCorrect
              ? "お見事、謎を解き明かした！"
              : "惜しい、もう一度考えてみよう"}
        </Typography>
        <Button
          onClick={onClose}
          variant="outlined"
          color="inherit"
          sx={{ borderRadius: "10px", px: 3.5, py: 1.2, fontSize: 13 }}
        >
          つづける
        </Button>
      </Box>
    </Box>
  );
}
