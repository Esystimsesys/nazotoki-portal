import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { NeonPanel } from "../../shared/components/NeonPanel";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import { useTeamAuth } from "./TeamAuthContext";

interface FormValues {
  loginCode: string;
}

/** チーム共有コードでのログイン画面 */
export function TeamLoginPage() {
  const { login } = useTeamAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit } = useForm<FormValues>({ defaultValues: { loginCode: "" } });

  const onSubmit = async (values: FormValues) => {
    const code = values.loginCode.trim().toUpperCase();
    if (!code) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(code);
      navigate("/answer", { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      className="starfield full-viewport"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
        textAlign: "center",
        position: "relative",
      }}
    >
      <Box sx={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>
        <Typography sx={{ fontSize: 36, mb: 1, filter: "drop-shadow(0 0 10px rgba(168,85,247,0.6))" }}>🔮</Typography>
        <Typography
          className="brand-font"
          sx={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: 2,
            background: "linear-gradient(135deg, #ffe08a, #f4c542 40%, #ff2e9a 90%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
            mb: 0.5,
          }}
        >
          謎解きナイト
        </Typography>
        <Typography sx={{ color: "text.secondary", fontSize: 13, letterSpacing: 3, mb: 5 }}>
          MYSTERY CODE HUNT
        </Typography>

        <NeonPanel
          component="form"
          onSubmit={handleSubmit(onSubmit)}
          sx={{ p: "32px 24px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
        >
          <Typography
            component="label"
            htmlFor="loginCode"
            sx={{ display: "block", fontSize: 12, color: "text.secondary", letterSpacing: 1.5, mb: 1.5 }}
          >
            チーム共有コードを入力
          </Typography>
          <TextField
            id="loginCode"
            fullWidth
            autoComplete="off"
            placeholder="ABCXYZ"
            slotProps={{
              htmlInput: {
                maxLength: 12,
                style: {
                  textAlign: "center",
                  fontSize: 22,
                  letterSpacing: 6,
                  fontWeight: 700,
                  color: "#ffe08a",
                },
              },
            }}
            {...register("loginCode", { required: true })}
          />
          <Button
            type="submit"
            fullWidth
            disabled={submitting}
            sx={{
              mt: 2.5,
              py: 1.8,
              fontSize: 16,
              letterSpacing: 1,
              color: "#1a0f2e",
              background: "linear-gradient(135deg, #ffe08a, #f4c542)",
              boxShadow: "0 6px 20px rgba(244,197,66,0.35)",
              "&:hover": { background: "linear-gradient(135deg, #ffe08a, #f4c542)" },
            }}
          >
            {submitting ? "確認中…" : "入場する"}
          </Button>
          <Typography sx={{ mt: 2.2, fontSize: 12, color: "text.secondary", lineHeight: 1.7 }}>
            受付で渡された<Box component="b" sx={{ color: "#ffe08a" }}>チームコード</Box>
            を、チームの誰か1台の端末に入力してください。
          </Typography>
          {error !== null && (
            <Box sx={{ mt: 2 }}>
              <ApiErrorAlert error={error} />
            </Box>
          )}
        </NeonPanel>
      </Box>
    </Box>
  );
}
