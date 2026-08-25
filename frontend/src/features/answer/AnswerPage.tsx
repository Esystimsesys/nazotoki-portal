import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { eventApi } from "../../api/event";
import { submissionsApi } from "../../api/submissions";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import { useTeamAuth } from "../team-auth/TeamAuthContext";
import { CodeDisplay } from "./CodeDisplay";
import { Keypad } from "./Keypad";
import { ResultOverlay } from "./ResultOverlay";

const CODE_LENGTH = 4;

/**
 * 参加者の単一回答画面。
 * 会場の全問題が同時に出題される仕様のため、画面側で問題を選ばせる導線は持たない。
 * サーバーが有効な全問題から自動でコード一致を探す（賞金額・回答履歴は参加者に見せない）。
 */
export function AnswerPage() {
  const { team, logout } = useTeamAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // イベントの開始/終了状態。開始前・終了後は入力自体をさせない。
  // 参加者は開始の瞬間を画面の前で待つので、短めの間隔で追いかけて
  // 「押してもまだ始まっていない」を自力でリロードせずに済ませる。
  const { data: eventData } = useQuery({
    queryKey: ["team", "event"],
    queryFn: () => eventApi.get("team"),
    refetchInterval: 5_000,
  });
  const eventState = eventData?.event;
  // 状態が取れるまでは受付中として扱う（取得失敗で回答できなくなるより、
  // 送信して サーバー側のゲートに弾かれる方が挙動として素直）
  const accepting = eventState?.running ?? true;
  const finished = eventState != null && !eventState.running && eventState.endedAt != null;

  const [code, setCode] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [result, setResult] = useState<{
    isCorrect: boolean;
    alreadyAnswered: boolean;
    penalty?: number | null;
  } | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  const submitMutation = useMutation({
    mutationFn: (value: string) => submissionsApi.submit(value),
    onSuccess: (res) => {
      setResult({ isCorrect: res.isCorrect, alreadyAnswered: res.alreadyAnswered, penalty: res.penalty });
      setShowOverlay(true);
      setCode("");
      if (!res.isCorrect) setShakeKey((k) => k + 1);
    },
    onError: () => {
      setShakeKey((k) => k + 1);
      // 開始前/終了後で弾かれた可能性があるので、状態を取り直して画面表示を実態に合わせる
      queryClient.invalidateQueries({ queryKey: ["team", "event"] });
    },
  });

  const pushDigit = (digit: string) => {
    if (code.length >= CODE_LENGTH) return;
    setCode((c) => c + digit);
  };
  const backspace = () => setCode((c) => c.slice(0, -1));
  const clear = () => setCode("");

  const handleSubmit = () => {
    if (!accepting || code.length < CODE_LENGTH || submitMutation.isPending) {
      setShakeKey((k) => k + 1);
      return;
    }
    submitMutation.mutate(code);
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <Box className="starfield full-viewport" sx={{ position: "relative", px: 2, pt: 2, pb: 4, maxWidth: 480, mx: "auto" }}>
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.2,
          background: "rgba(30, 22, 56, 0.7)",
          border: "1px solid rgba(168,85,247,0.25)",
          borderRadius: "14px",
          mb: 2.25,
          backdropFilter: "blur(6px)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 700, fontSize: 14 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#39ff88",
              boxShadow: "0 0 8px #39ff88",
            }}
          />
          <Typography component="span" sx={{ fontWeight: 700, fontSize: 14 }}>
            チーム: {team?.teamName}
          </Typography>
        </Box>
        <Button
          size="small"
          onClick={handleLogout}
          sx={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "text.secondary",
            fontSize: 12,
            borderRadius: "20px",
            px: 1.75,
          }}
        >
          退出
        </Button>
      </Box>

      {accepting ? (
        <Typography
          sx={{ textAlign: "center", fontSize: 12.5, color: "text.secondary", mb: 2.25, lineHeight: 1.7, px: 1, position: "relative", zIndex: 1 }}
        >
          会場のすべての問題は同時に出題されています。
          <br />
          どの問題から解いてもOK — <Box component="b" sx={{ color: "#d9c6ff" }}>正解した問題の4桁コード</Box>
          を入力してください。
        </Typography>
      ) : (
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            textAlign: "center",
            px: 2.5,
            py: 3,
            mb: 2.25,
            borderRadius: "16px",
            background: "rgba(30,22,56,0.7)",
            border: `1px solid ${finished ? "rgba(182,169,217,0.3)" : "rgba(244,197,66,0.4)"}`,
          }}
        >
          <Typography sx={{ fontSize: 40, mb: 0.5 }}>{finished ? "🏁" : "⏳"}</Typography>
          <Typography
            className="brand-font"
            sx={{ fontSize: 20, fontWeight: 900, color: finished ? "#b6a9d9" : "#ffe08a", mb: 0.75 }}
          >
            {finished ? "イベント終了" : "開始までお待ちください"}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", lineHeight: 1.7 }}>
            {finished
              ? "回答の受付は終了しました。おつかれさまでした！"
              : "まもなく開始します。始まると自動でこの画面が切り替わります。"}
          </Typography>
        </Box>
      )}

      <Box sx={{ position: "relative", zIndex: 1, opacity: accepting ? 1 : 0.35, pointerEvents: accepting ? "auto" : "none" }}>
        <CodeDisplay code={code} shakeKey={shakeKey} />

        <Keypad onDigit={pushDigit} onBackspace={backspace} onClear={clear} disabled={!accepting || submitMutation.isPending} />

        <Button
          fullWidth
          onClick={handleSubmit}
          disabled={!accepting || submitMutation.isPending}
          sx={{
            maxWidth: 300,
            mx: "auto",
            mt: 2,
            display: "block",
            py: 2.1,
            fontSize: 17,
            letterSpacing: 2,
            color: "#fff",
            background: "linear-gradient(135deg, #ff2e9a, #8b5cf6)",
            boxShadow: "0 6px 20px rgba(255,46,154,0.3)",
            opacity: code.length < CODE_LENGTH ? 0.5 : 1,
            "&:hover": { background: "linear-gradient(135deg, #ff2e9a, #8b5cf6)" },
          }}
        >
          {submitMutation.isPending ? "判定中…" : "回答する"}
        </Button>

        {submitMutation.isError && (
          <Box sx={{ mt: 2 }}>
            <ApiErrorAlert error={submitMutation.error} />
          </Box>
        )}
      </Box>

      <ResultOverlay
        open={showOverlay && result !== null}
        isCorrect={result?.isCorrect ?? false}
        alreadyAnswered={result?.alreadyAnswered ?? false}
        penalty={result?.penalty}
        onClose={() => setShowOverlay(false)}
      />
    </Box>
  );
}
