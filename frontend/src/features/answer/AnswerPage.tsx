import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
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

  const [code, setCode] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [result, setResult] = useState<{ isCorrect: boolean; alreadyAnswered: boolean } | null>(
    null,
  );
  const [showOverlay, setShowOverlay] = useState(false);

  const submitMutation = useMutation({
    mutationFn: (value: string) => submissionsApi.submit(value),
    onSuccess: (res) => {
      setResult({ isCorrect: res.isCorrect, alreadyAnswered: res.alreadyAnswered });
      setShowOverlay(true);
      setCode("");
      if (!res.isCorrect) setShakeKey((k) => k + 1);
    },
    onError: () => {
      setShakeKey((k) => k + 1);
    },
  });

  const pushDigit = (digit: string) => {
    if (code.length >= CODE_LENGTH) return;
    setCode((c) => c + digit);
  };
  const backspace = () => setCode((c) => c.slice(0, -1));
  const clear = () => setCode("");

  const handleSubmit = () => {
    if (code.length < CODE_LENGTH || submitMutation.isPending) {
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

      <Typography
        sx={{ textAlign: "center", fontSize: 12.5, color: "text.secondary", mb: 2.25, lineHeight: 1.7, px: 1, position: "relative", zIndex: 1 }}
      >
        会場のすべての問題は同時に出題されています。
        <br />
        どの問題から解いてもOK — <Box component="b" sx={{ color: "#d9c6ff" }}>正解した問題の4桁コード</Box>
        を入力してください。
      </Typography>

      <Box sx={{ position: "relative", zIndex: 1 }}>
        <CodeDisplay code={code} shakeKey={shakeKey} />

        <Keypad onDigit={pushDigit} onBackspace={backspace} onClear={clear} disabled={submitMutation.isPending} />

        <Button
          fullWidth
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
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
        onClose={() => setShowOverlay(false)}
      />
    </Box>
  );
}
